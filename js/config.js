/* config.js — Pantalla de configuración */

registerScreen('config', async (el) => {
  const vet = (await getVeterinario()) || {};
  el.innerHTML = _configHTML(vet);
});

// ─── HTML ─────────────────────────────────────────────────────────────────────

function _configHTML(vet) {
  return `
    <div class="page-header">
      <div></div>
      <h2>Configuración</h2>
      <div></div>
    </div>
    <div class="page-body">

      <!-- Veterinario -->
      <div class="card">
        <h3 class="card-title">Veterinario</h3>
        <form id="form-vet" onsubmit="guardarVeterinario(event)">
          <div class="form-group">
            <label class="form-label">Nombre</label>
            <input class="form-input" id="vet-nombre" type="text" placeholder="Ej: Juan Pérez"
              value="${vet.nombre || ''}" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label">Matrícula</label>
            <input class="form-input" id="vet-matricula" type="text" placeholder="Ej: 1234"
              value="${vet.matricula || ''}" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label">URL de Apps Script</label>
            <input class="form-input" id="vet-url" type="url"
              placeholder="https://script.google.com/macros/s/…/exec"
              value="${vet.appsScriptUrl || ''}" autocomplete="off">
            <span class="form-hint">Se obtiene en Implementar → Implementación web dentro del Apps Script.</span>
          </div>
          <button type="submit" class="btn btn-primary btn-full">Guardar</button>
        </form>
      </div>

      <!-- Sincronización -->
      <div class="card">
        <h3 class="card-title">Sincronización</h3>
        <div class="config-sync-row">
          <span class="text3">Estado</span>
          <span class="sync-badge"></span>
        </div>
        <button class="btn btn-secondary btn-full" onclick="forzarSync()" id="btn-force-sync">
          Forzar sincronización
        </button>
      </div>

      <!-- Backup -->
      <div class="card">
        <h3 class="card-title">Copia de seguridad</h3>
        <div class="config-backup-btns">
          <button class="btn btn-secondary btn-full" onclick="exportarBackup()">
            Exportar datos (JSON)
          </button>
          <label class="btn btn-secondary btn-full" style="text-align:center;cursor:pointer;">
            Importar datos (JSON)
            <input type="file" accept=".json" style="display:none" onchange="importarBackup(event)">
          </label>
        </div>
        <p class="form-hint" style="margin-top:8px">
          La importación reemplaza todos los datos actuales. Hacé una exportación antes si querés conservar los datos existentes.
        </p>
      </div>

    </div>
  `;
}

// ─── Guardar veterinario ──────────────────────────────────────────────────────

async function guardarVeterinario(e) {
  e.preventDefault();
  const nombre    = document.getElementById('vet-nombre').value.trim();
  const matricula = document.getElementById('vet-matricula').value.trim();
  const url       = document.getElementById('vet-url').value.trim();

  await saveVeterinario({ id: 1, nombre, matricula, appsScriptUrl: url });

  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = '✓ Guardado';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = 'Guardar'; btn.disabled = false; }, 1500);
}

// ─── Forzar sync ──────────────────────────────────────────────────────────────

async function forzarSync() {
  if (!navigator.onLine) {
    alert('Sin conexión a internet.');
    return;
  }
  const btn = document.getElementById('btn-force-sync');
  if (btn) { btn.textContent = '⏳ Sincronizando…'; btn.disabled = true; }

  await procesarQueue();

  if (btn) { btn.textContent = 'Forzar sincronización'; btn.disabled = false; }
  await updateSyncBadges();
}

// ─── Backup export ────────────────────────────────────────────────────────────

async function exportarBackup() {
  const [veterinario, tambos, vacas, controles, tandas, registros] = await Promise.all([
    db.veterinario.toArray(),
    db.tambos.toArray(),
    db.vacas_registro.toArray(),
    db.controles.toArray(),
    db.tandas.toArray(),
    db.registros.toArray(),
  ]);

  const backup = {
    version:   1,
    exportadoAt: new Date().toISOString(),
    veterinario, tambos, vacas_registro: vacas, controles, tandas, registros,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `control-lechero-backup-${fechaHoy()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Backup import ────────────────────────────────────────────────────────────

async function importarBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    alert('El archivo no es un JSON válido.');
    return;
  }

  if (!data.version || !data.tambos) {
    alert('El archivo no parece ser un backup válido de Control Lechero.');
    return;
  }

  const ok = confirm(
    `¿Reemplazar todos los datos con los del backup?\n\n` +
    `Fecha del backup: ${data.exportadoAt ? new Date(data.exportadoAt).toLocaleString('es-AR') : 'desconocida'}\n` +
    `Tambos: ${data.tambos.length} — Controles: ${data.controles.length}\n\n` +
    `Esta acción no se puede deshacer.`
  );
  if (!ok) return;

  await db.transaction('rw',
    db.veterinario, db.tambos, db.vacas_registro,
    db.controles, db.tandas, db.registros, db.syncQueue,
    async () => {
      await db.veterinario.clear();
      await db.tambos.clear();
      await db.vacas_registro.clear();
      await db.controles.clear();
      await db.tandas.clear();
      await db.registros.clear();
      await db.syncQueue.clear();

      if (data.veterinario?.length)    await db.veterinario.bulkAdd(data.veterinario);
      if (data.tambos?.length)         await db.tambos.bulkAdd(data.tambos);
      if (data.vacas_registro?.length) await db.vacas_registro.bulkAdd(data.vacas_registro);
      if (data.controles?.length)      await db.controles.bulkAdd(data.controles);
      if (data.tandas?.length)         await db.tandas.bulkAdd(data.tandas);
      if (data.registros?.length)      await db.registros.bulkAdd(data.registros);
    }
  );

  alert('✅ Datos importados correctamente.');
  navigate('/config');
}
