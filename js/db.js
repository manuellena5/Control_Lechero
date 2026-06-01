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

async function addRegistro(tandaId, rp, litros, estado) {
  // Obtener tamboId para el padrón — navegar tandas → controles
  const tanda = await db.tandas.get(tandaId);
  const control = await db.controles.get(tanda.controlId);
  await upsertVacaRegistro(control.tamboId, rp);

  const estadoFinal = estado || (litros != null ? 'normal' : 'pendiente');
  const id = await db.registros.add({ tandaId, rp, litros: litros ?? null, estado: estadoFinal });
  return db.registros.get(id);
}

async function updateRegistro(id, litros, estado) {
  const current = await db.registros.get(id);
  const estadoFinal = estado !== undefined ? estado : current.estado;
  const litrosFinal = litros !== undefined ? litros : current.litros;
  await db.registros.update(id, { litros: litrosFinal, estado: estadoFinal });
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
      if (r.estado !== 'venta' && r.estado !== 'pendiente' && r.litros != null) {
        total += r.litros;
      }
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
      estado: reg.estado,
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
