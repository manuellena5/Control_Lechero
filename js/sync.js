/* sync.js — Sincronización offline-first con Google Sheets */

let _syncing = false;

// ─── Inicialización ───────────────────────────────────────────────────────────

function initSync() {
  window.addEventListener('online',  () => { procesarQueue(); updateSyncBadges(); });
  window.addEventListener('offline', () => updateSyncBadges());
  if (navigator.onLine) procesarQueue();
  updateSyncBadges();
}

// ─── Encolar control para sync ────────────────────────────────────────────────

async function enqueueControlSync(controlId, tamboId) {
  // Si ya hay un job para este control, solo reiniciar intentos
  const existing = await db.syncQueue.filter(j => {
    try { return JSON.parse(j.payload).controlId === controlId; }
    catch { return false; }
  }).first();

  if (existing) {
    await db.syncQueue.update(existing.id, { intentos: 0, creadoAt: new Date() });
  } else {
    await enqueueSync('upsert', 'control', { controlId, tamboId });
  }
  updateSyncBadges();
  // No auto-sync aquí — solo sincroniza al evento 'online', al abrir la app,
  // o cuando el usuario presiona el botón en planilla
}

// ─── Procesar cola ────────────────────────────────────────────────────────────

async function procesarQueue() {
  if (_syncing || !navigator.onLine) return;
  _syncing = true;
  try {
    const jobs = await getPendingSync();
    if (!jobs.length) return;

    // Un solo envío por controlId (estado más reciente)
    const byControl = new Map();
    for (const job of jobs) {
      try {
        const p = JSON.parse(job.payload);
        if (p.controlId) byControl.set(p.controlId, job);
      } catch {}
    }

    for (const job of byControl.values()) {
      await _procesarJob(job);
    }
  } finally {
    _syncing = false;
    updateSyncBadges();
  }
}

async function _procesarJob(job) {
  let p;
  try { p = JSON.parse(job.payload); } catch {
    await db.syncQueue.delete(job.id);
    return;
  }

  const resultado = await _enviarControl(p.controlId, p.tamboId);

  if (resultado.ok) {
    await _borrarJobsDeControl(p.controlId);
    await db.tambos.update(p.tamboId, { syncedAt: new Date() });
  } else {
    await db.syncQueue.update(job.id, { intentos: (job.intentos || 0) + 1 });
    console.warn('[sync] falló para control', p.controlId, ':', resultado.error);
  }
}

// ─── Construir y enviar payload ───────────────────────────────────────────────

async function _buildPayload(controlId, tamboId) {
  const [vet, tambo, control] = await Promise.all([
    getVeterinario(),
    getTambo(tamboId),
    db.controles.get(controlId),
  ]);

  if (!tambo?.sheetId)       return { error: 'Sin sheetId configurado en el tambo.' };
  if (!vet?.appsScriptUrl)   return { error: 'Sin URL de Apps Script. Configurala en Ajustes.' };

  // Agregar registros por vaca (mismo algoritmo que planilla.js)
  const tandas  = await getTandasDeControl(controlId);
  const vacaMap = new Map();

  for (const tanda of tandas) {
    const regs = await getRegistrosDeTanda(tanda.id);
    for (const r of regs) {
      if (!vacaMap.has(r.rp)) {
        vacaMap.set(r.rp, { rp: r.rp, litrosMañana: null, litrosTarde: null, estado: 'normal', tanda: tanda.numero });
      }
      const v = vacaMap.get(r.rp);
      if      (r.estado === 'venta')                              v.estado = 'venta';
      else if (r.estado === 'secar'    && v.estado !== 'venta')   v.estado = 'secar';
      else if (r.estado === 'pendiente' && v.estado === 'normal') v.estado = 'pendiente';

      if      (tanda.turno === 'mañana') v.litrosMañana = (v.litrosMañana || 0) + (r.litros || 0);
      else if (tanda.turno === 'tarde')  v.litrosTarde  = (v.litrosTarde  || 0) + (r.litros || 0);
    }
  }

  const registros = [...vacaMap.values()]
    .sort((a, b) => parseInt(a.rp) - parseInt(b.rp))
    .map(v => ({
      rp:           v.rp,
      litrosMañana: v.litrosMañana,
      litrosTarde:  v.litrosTarde,
      total: (v.estado !== 'venta' && v.estado !== 'pendiente')
        ? (v.litrosMañana || 0) + (v.litrosTarde || 0)
        : null,
      estado: v.estado,
      tanda:  v.tanda,
    }));

  // Fecha: YYYY-MM-DD → DD-MM-YYYY para el nombre de la hoja
  const [y, m, d] = control.fecha.split('-');

  return {
    payload: {
      sheetId: tambo.sheetId,
      control: {
        fecha:       `${d}-${m}-${y}`,
        tambo:       tambo.nombre,
        propietario: tambo.propietario,
        veterinario: vet.nombre    || '',
        matricula:   vet.matricula || '',
      },
      registros,
    },
    url: vet.appsScriptUrl,
  };
}

async function _enviarControl(controlId, tamboId) {
  const built = await _buildPayload(controlId, tamboId);
  if (built.error) return { ok: false, error: built.error };

  try {
    const res = await fetch(built.url, {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body:     JSON.stringify(built.payload),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    return json;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Sync manual desde planilla ───────────────────────────────────────────────

async function sincronizarControlManual(controlId, tamboId) {
  const resultado = await _enviarControl(controlId, tamboId);
  if (resultado.ok) {
    await _borrarJobsDeControl(controlId);
    await db.tambos.update(tamboId, { syncedAt: new Date() });
  }
  await updateSyncBadges();
  return resultado;
}

async function _borrarJobsDeControl(controlId) {
  const keys = await db.syncQueue.filter(j => {
    try { return JSON.parse(j.payload).controlId === controlId; }
    catch { return false; }
  }).primaryKeys();
  if (keys.length) await db.syncQueue.bulkDelete(keys);
}

// ─── Pull desde Google Sheets ─────────────────────────────────────────────────

async function pullFromSheet(tamboId) {
  const [tambo, vet] = await Promise.all([getTambo(tamboId), getVeterinario()]);

  if (!tambo?.sheetId)     return { ok: false, error: 'Este tambo no tiene Sheet ID configurado.' };
  if (!vet?.appsScriptUrl) return { ok: false, error: 'Sin URL de Apps Script. Configurala en Ajustes.' };

  _showToast('⏳ Importando desde Sheets…', 'loading');

  let data;
  try {
    const url = `${vet.appsScriptUrl}?sheetId=${encodeURIComponent(tambo.sheetId)}`;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    data = await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  if (data.ok === false) return { ok: false, error: data.error || 'Error en el servidor.' };
  if (!Array.isArray(data.controles)) return { ok: false, error: 'Respuesta inesperada del servidor.' };

  // Importar controles (local tiene prioridad — no sobreescribir)
  let importados = 0;
  for (const cd of data.controles) {
    const existe = await db.controles
      .where('[tamboId+fecha]').equals([tamboId, cd.fecha]).first();
    if (existe) continue;

    const controlId = await db.controles.add({ tamboId, fecha: cd.fecha });
    const regs = cd.registros || [];

    // Vacas con litros de mañana + pendientes → tanda mañana
    const paraMañana = regs.filter(r => r.litrosMañana != null || r.estado === 'pendiente');
    if (paraMañana.length > 0) {
      const tandaId = await db.tandas.add({ controlId, turno: 'mañana', numero: 1 });
      for (const r of paraMañana) {
        await db.registros.add({
          tandaId, rp: r.rp,
          litros: r.litrosMañana ?? null,
          estado: r.estado || 'normal',
        });
      }
    }

    // Vacas con litros de tarde → tanda tarde
    const paraTarde = regs.filter(r => r.litrosTarde != null);
    if (paraTarde.length > 0) {
      const tandaId = await db.tandas.add({ controlId, turno: 'tarde', numero: 1 });
      for (const r of paraTarde) {
        await db.registros.add({
          tandaId, rp: r.rp,
          litros: r.litrosTarde,
          estado: r.estado || 'normal',
        });
      }
    }

    // Vacas solo con estado (venta/secar sin litros) que no entraron en ninguna tanda
    const soloEstado = regs.filter(r =>
      r.litrosMañana == null && r.litrosTarde == null && r.estado !== 'pendiente'
    );
    if (soloEstado.length > 0) {
      // Agregar a mañana (o crear la tanda si no existía)
      let tandaMañana = await db.tandas
        .where('controlId').equals(controlId).filter(t => t.turno === 'mañana').first();
      if (!tandaMañana) {
        const tid = await db.tandas.add({ controlId, turno: 'mañana', numero: 1 });
        tandaMañana = { id: tid };
      }
      for (const r of soloEstado) {
        await db.registros.add({
          tandaId: tandaMañana.id, rp: r.rp,
          litros: null, estado: r.estado,
        });
      }
    }

    importados++;
  }

  // Importar padrón (solo agregar, nunca eliminar)
  if (Array.isArray(data.padron)) {
    for (const p of data.padron) {
      const existe = await db.vacas_registro
        .where('[tamboId+rp]').equals([tamboId, p.rp]).first();
      if (!existe) {
        await db.vacas_registro.add({
          tamboId, rp: p.rp,
          activa:    p.activa !== false,
          fechaAlta: p.fechaAlta || fechaHoy(),
          notas:     '',
        });
      }
    }
  }

  await db.tambos.update(tamboId, { syncedAt: new Date() });

  if (data.controles.length === 0) {
    _showToast('El Sheet aún no tiene controles registrados.');
  } else if (importados === 0) {
    _showToast('✓ Todo ya estaba sincronizado.');
  } else {
    _showToast(`✓ ${importados} control${importados !== 1 ? 'es' : ''} importado${importados !== 1 ? 's' : ''}`);
  }

  return { ok: true, importados };
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function _showToast(msg, tipo = 'ok') {
  const prev = document.getElementById('sync-toast');
  if (prev) prev.remove();

  const toast = document.createElement('div');
  toast.id        = 'sync-toast';
  toast.className = `sync-toast sync-toast--${tipo}`;
  toast.textContent = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('sync-toast--visible'));

  if (tipo !== 'loading') {
    setTimeout(() => {
      toast.classList.remove('sync-toast--visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3000);
  }
}

// ─── Indicadores de sync ──────────────────────────────────────────────────────

async function updateSyncBadges() {
  const badges = document.querySelectorAll('.sync-badge');
  if (!badges.length) return;

  let cls, label, title;
  if (!navigator.onLine) {
    cls = 'sync--offline'; label = '✗'; title = 'Sin conexión';
  } else {
    const pending = await getPendingSync();
    if (pending.length > 0) {
      cls   = 'sync--pending';
      label = '🔄';
      title = `${pending.length} control${pending.length !== 1 ? 'es' : ''} pendiente${pending.length !== 1 ? 's' : ''} de sync`;
    } else {
      cls = 'sync--ok'; label = '☁️'; title = 'Sincronizado';
    }
  }

  badges.forEach(b => {
    b.className = `sync-badge ${cls}`;
    b.textContent = label;
    b.title = title;
  });
}
