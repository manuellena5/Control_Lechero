/* db.js — IndexedDB schema y helpers CRUD via Dexie.js */

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

function formatFecha(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function fmtL(n) {
  if (n == null || n === 0) return '0';
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function _hexToRgba(hex, a) {
  const h = (hex || '#888888').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const db = new Dexie('ControlLechero');

db.version(1).stores({
  veterinario:    '++id, nombre, matricula, appsScriptUrl',
  tambos:         '++id, nombre, propietario, telefono, sheetId, creadoAt, syncedAt',
  vacas_registro: '++id, [tamboId+rp], tamboId, rp, activa, fechaAlta, notas',
  controles:      '++id, [tamboId+fecha], tamboId, fecha',
  tandas:         '++id, controlId, turno, numero',
  registros:      '++id, [tandaId+rp], tandaId, rp, litros, estado',
  syncQueue:      '++id, operacion, tabla, intentos, creadoAt'
});

// v2: tags de vaca (etiquetas configurables). Migra el campo `estado` de cada
// registro a un array `tags` con nombres de etiqueta. Los estados normal y
// pendiente no son tags (se derivan de si hay litros o no).
db.version(2).stores({
  tags: '++id, orden'
}).upgrade(async tx => {
  await tx.table('registros').toCollection().modify(r => {
    if (!Array.isArray(r.tags)) {
      r.tags = r.estado === 'secar' ? ['Secar']
             : r.estado === 'venta' ? ['Venta']
             : [];
    }
  });
});

// ─── Tags (etiquetas de vaca) ────────────────────────────────────────────────

// Colores automáticos para tags nuevos (evitan chocar con mañana/tarde/accent).
const TAG_PALETTE = ['#3A86C8', '#C47B2A', '#2D9E75', '#C0392B', '#D4537E', '#0E7C7B', '#8E44AD', '#B8860B'];

// Guard para que múltiples llamadas concurrentes (init + pantallas) no dupliquen
let _seedTagsPromise = null;
function seedTagsIfEmpty() {
  if (!_seedTagsPromise) _seedTagsPromise = _seedTags();
  return _seedTagsPromise;
}

async function _seedTags() {
  // Transacción rw: el chequeo + alta es atómico (IndexedDB serializa las
  // transacciones rw sobre la misma tabla), así no se crean tags duplicados.
  await db.transaction('rw', db.tags, async () => {
    const all = await db.tags.toArray();

    if (all.length === 0) {
      await db.tags.bulkAdd([
        { nombre: 'Venta', color: '#E76F51', orden: 0, builtin: 1, activo: 1 },
        { nombre: 'Secar', color: '#7B5EA7', orden: 1, builtin: 1, activo: 1 },
      ]);
      return;
    }

    // Limpiar duplicados por nombre (de versiones con el bug de seed concurrente)
    const vistos = new Set();
    const aBorrar = [];
    for (const t of all.sort((a, b) => a.id - b.id)) {
      const key = (t.nombre || '').toLowerCase();
      if (vistos.has(key)) aBorrar.push(t.id);
      else vistos.add(key);
    }
    if (aBorrar.length) await db.tags.bulkDelete(aBorrar);

    // Tags viejos sin el campo `activo` → activarlos
    await db.tags.toCollection().modify(t => { if (t.activo === undefined) t.activo = 1; });
  });
}

async function getTags() {
  return db.tags.orderBy('orden').toArray();
}

// Solo tags habilitados (para asignar en el control)
async function getTagsActivos() {
  const all = await db.tags.orderBy('orden').toArray();
  return all.filter(t => t.activo !== 0);
}

async function getTagByNombre(nombre) {
  const low = nombre.trim().toLowerCase();
  return db.tags.filter(t => (t.nombre || '').toLowerCase() === low).first();
}

// Devuelve un mapa { nombreLower → color } para renderizar chips.
async function getTagColorMap() {
  const tags = await db.tags.toArray();
  const map = {};
  for (const t of tags) map[(t.nombre || '').toLowerCase()] = t.color;
  return map;
}

async function addTag(nombre) {
  nombre = (nombre || '').trim();
  if (!nombre) return null;
  const existe = await getTagByNombre(nombre);
  if (existe) {
    // Si existía pero estaba deshabilitado, re-habilitarlo
    if (existe.activo === 0) await db.tags.update(existe.id, { activo: 1 });
    return existe.id;
  }
  const all = await db.tags.toArray();
  const color = TAG_PALETTE[Math.max(0, all.length - 2) % TAG_PALETTE.length];
  const orden = all.length ? Math.max(...all.map(t => t.orden || 0)) + 1 : 0;
  return db.tags.add({ nombre, color, orden, builtin: 0, activo: 1 });
}

async function updateTagNombre(id, nombre) {
  nombre = (nombre || '').trim();
  if (!nombre) return;
  const tag = await db.tags.get(id);
  if (!tag) return;
  const viejo = tag.nombre;
  if (viejo === nombre) return;
  await db.tags.update(id, { nombre });
  // Cascada: renombrar en todos los registros que usaban el nombre viejo
  await db.registros.toCollection().modify(r => {
    if (Array.isArray(r.tags)) {
      const i = r.tags.indexOf(viejo);
      if (i !== -1) r.tags[i] = nombre;
    }
  });
}

// Deshabilitar / habilitar un tag. No se borra ni se quita de las vacas que ya
// lo tienen: solo deja de aparecer como opción para asignar en nuevos controles.
async function setTagActivo(id, activo) {
  await db.tags.update(id, { activo: activo ? 1 : 0 });
}

// Tags de un registro, con compatibilidad hacia registros antiguos (campo estado).
function regTags(reg) {
  if (Array.isArray(reg.tags)) return reg.tags;
  if (reg.estado === 'secar') return ['Secar'];
  if (reg.estado === 'venta') return ['Venta'];
  return [];
}

// ─── Veterinario ────────────────────────────────────────────────────────────

async function getVeterinario() {
  return (await db.veterinario.get(1)) || null;
}

async function saveVeterinario(data) {
  await db.veterinario.put({ ...data, id: 1 });
}

// ─── Tambos ─────────────────────────────────────────────────────────────────

async function getTambos() {
  return db.tambos.orderBy('nombre').toArray();
}

async function getTambo(id) {
  return db.veterinario ? db.tambos.get(id) : null;
}

async function saveTambo(data) {
  if (data.id) {
    await db.tambos.put(data);
    return data.id;
  } else {
    return db.tambos.add({ ...data, creadoAt: new Date(), syncedAt: null });
  }
}

async function deleteTambo(id) {
  await db.transaction('rw',
    db.tambos, db.controles, db.tandas, db.registros, db.vacas_registro, db.syncQueue,
    async () => {
      const controles = await db.controles.where('tamboId').equals(id).toArray();
      for (const control of controles) {
        const tandas = await db.tandas.where('controlId').equals(control.id).toArray();
        for (const tanda of tandas) {
          await db.registros.where('tandaId').equals(tanda.id).delete();
        }
        await db.tandas.where('controlId').equals(control.id).delete();
      }
      await db.controles.where('tamboId').equals(id).delete();
      await db.vacas_registro.where('tamboId').equals(id).delete();
      await db.tambos.delete(id);
    }
  );
}

// ─── Controles ───────────────────────────────────────────────────────────────

async function getOrCreateControl(tamboId, fecha) {
  const existing = await db.controles.where('[tamboId+fecha]').equals([tamboId, fecha]).first();
  if (existing) return existing;
  const id = await db.controles.add({ tamboId, fecha });
  return db.controles.get(id);
}

async function getControlesDeTambo(tamboId) {
  const rows = await db.controles.where('tamboId').equals(tamboId).sortBy('fecha');
  return rows.reverse(); // más reciente primero
}

// ─── Tandas ──────────────────────────────────────────────────────────────────

async function getTandasDeControl(controlId) {
  return db.tandas.where('controlId').equals(controlId).sortBy('numero');
}

async function addTanda(controlId, turno) {
  // Numerar desde 1 dentro de cada turno (independiente de otros turnos)
  const count = await db.tandas.where('controlId').equals(controlId)
    .filter(t => t.turno === turno).count();
  const id = await db.tandas.add({ controlId, turno, numero: count + 1 });
  return db.tandas.get(id);
}

async function deleteTanda(tandaId) {
  await db.registros.where('tandaId').equals(tandaId).delete();
  await db.tandas.delete(tandaId);
}

// ─── Registros ───────────────────────────────────────────────────────────────

async function getRegistrosDeTanda(tandaId) {
  return db.registros.where('tandaId').equals(tandaId).sortBy('rp');
}

async function addRegistro(tandaId, rp, litros, tags) {
  // Obtener tamboId para el padrón — navegar tandas → controles
  const tanda = await db.tandas.get(tandaId);
  const control = await db.controles.get(tanda.controlId);
  await upsertVacaRegistro(control.tamboId, rp);

  const id = await db.registros.add({ tandaId, rp, litros: litros ?? null, tags: tags || [] });
  return db.registros.get(id);
}

async function updateRegistro(id, litros, tags) {
  const current = await db.registros.get(id);
  const tagsFinal   = tags   !== undefined ? tags   : regTags(current);
  const litrosFinal = litros !== undefined ? litros : current.litros;
  await db.registros.update(id, { litros: litrosFinal, tags: tagsFinal });
  return db.registros.get(id);
}

async function deleteRegistro(id) {
  await db.registros.delete(id);
}

async function getLitrosControl(controlId) {
  const tandas = await db.tandas.where('controlId').equals(controlId).toArray();
  let total = 0;
  for (const tanda of tandas) {
    const regs = await db.registros.where('tandaId').equals(tanda.id).toArray();
    for (const r of regs) {
      // Los tags ya no afectan el total: cuenta cualquier vaca con litros cargados.
      if (r.litros != null) total += r.litros;
    }
  }
  return total;
}

// ─── Padrón de vacas ─────────────────────────────────────────────────────────

async function getPadronTambo(tamboId) {
  return db.vacas_registro.where('tamboId').equals(tamboId).sortBy('rp');
}

async function upsertVacaRegistro(tamboId, rp) {
  const existing = await db.vacas_registro.where('[tamboId+rp]').equals([tamboId, rp]).first();
  if (!existing) {
    await db.vacas_registro.add({
      tamboId,
      rp,
      activa: true,
      fechaAlta: new Date(),
      notas: null
    });
  }
}

async function getHistorialVaca(tamboId, rp) {
  // Obtener todos los registros con ese RP en ese tambo, ordenados por fecha desc
  const registros = await db.registros.where('rp').equals(rp).toArray();
  const resultado = [];
  for (const reg of registros) {
    const tanda = await db.tandas.get(reg.tandaId);
    if (!tanda) continue;
    const control = await db.controles.get(tanda.controlId);
    if (!control || control.tamboId !== tamboId) continue;
    resultado.push({
      fecha: control.fecha,
      turno: tanda.turno,
      tanda: tanda.numero,
      litros: reg.litros,
      tags: regTags(reg),
      registroId: reg.id
    });
  }
  resultado.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return resultado;
}

// ─── Sync Queue ──────────────────────────────────────────────────────────────

async function enqueueSync(operacion, tabla, payload) {
  return db.syncQueue.add({
    operacion,
    tabla,
    payload: JSON.stringify(payload),
    intentos: 0,
    creadoAt: new Date()
  });
}

async function getPendingSync() {
  return db.syncQueue.where('tabla').equals('control').and(j => j.intentos < 3).toArray();
}
