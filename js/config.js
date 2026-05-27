/* config.js — Pantalla de configuración */

registerScreen('config', async (el) => {
  const [vet, tambos] = await Promise.all([getVeterinario(), getTambos()]);
  el.innerHTML = _configHTML(vet, tambos);
  updateSyncBadges();
});

// ─── HTML ─────────────────────────────────────────────────────────────────────

function _configHTML(vet, tambos) {
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
          <span class="text3">Pendientes</span>
          <span class="sync-badge"></span>
        </div>
        <button class="btn btn-secondary btn-full" onclick="forzarSync()" id="btn-force-sync">
          Forzar sincronización ↑
        </button>
      </div>

      <!-- Restaurar desde Sheets -->
      <div class="card">
        <h3 class="card-title">Restaurar desde Sheets</h3>
        ${tambos.length === 0
          ? `<p class="text3">No hay tambos configurados.</p>`
          : tambos.map(t => `
            <div class="config-sync-row" style="margin-bottom:10px">
              <div>
                <div style="font-weight:500">${t.nombre}</div>
                <div class="text3" style="font-size:12px">
                  ${t.sheetId
                    ? `Sheet: <span class="mono">${t.sheetId.slice(0, 16)}…</span>`
                    : 'Sin Sheet ID'}
                  ${t.syncedAt
                    ? ` · sync ${new Date(t.syncedAt).toLocaleDateString('es-AR')}`
                    : ''}
                </div>
              </div>
              ${t.sheetId
                ? `<button class="btn btn-secondary btn-sm" id="cfg-pull-${t.id}"
                           onclick="configPullTambo(${t.id})">↓ Restaurar</button>`
                : `<span class="text3" style="font-size:12px">—</span>`}
            </div>`).join('')
        }
        ${tambos.some(t => t.sheetId) ? `
        <button class="btn btn-secondary btn-full" style="margin-top:4px"
                onclick="configPullTodos()">
          ↓ Restaurar todos desde Sheets
        </button>` : ''}
        <p class="form-hint" style="margin-top:8px">
          Importa controles del Sheet que no existan localmente. Los datos locales no se modifican.
        </p>
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

  const vetAnterior = await getVeterinario();
  const urlCambio   = url && url !== (vetAnterior?.appsScriptUrl || '');

  await saveVeterinario({ id: 1, nombre, matricula, appsScriptUrl: url });

  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = '✓ Guardado';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = 'Guardar'; btn.disabled = false; }, 1500);

  // Si el URL cambió y hay internet → buscar tambos en el script
  if (urlCambio && navigator.onLine) {
    await _buscarTambosEnScript(url);
  }
}

async function _buscarTambosEnScript(url) {
  _showToast('🔍 Buscando tambos en el script…', 'loading');
  let data;
  try {
    const res = await fetch(`${url}?action=list`, { redirect: 'follow' });
    data = await res.json();
  } catch(err) {
    _showToast('No se pudo conectar con el script.');
    return;
  }

  const tambosRemote = data.tambos || [];
  if (!tambosRemote.length) {
    _showToast('El script no tiene tambos registrados todavía.');
    return;
  }

  // Filtrar los que no existen localmente (por sheetId)
  const tambosLocales = await getTambos();
  const sheetIdsLocales = new Set(tambosLocales.map(t => t.sheetId).filter(Boolean));
  const nuevos = tambosRemote.filter(t => !sheetIdsLocales.has(t.sheetId));

  if (!nuevos.length) {
    _showToast('✓ Todos los tambos ya están en el dispositivo.');
    return;
  }

  const lista = nuevos.map(t => `• ${t.nombre} (${t.propietario})`).join('\n');
  if (!confirm(
    `Se encontraron ${nuevos.length} tambo${nuevos.length !== 1 ? 's' : ''} en el script:\n\n` +
    `${lista}\n\n¿Importarlos a este dispositivo?`
  )) return;

  for (const t of nuevos) {
    const tamboId = await saveTambo({
      nombre:      t.nombre,
      propietario: t.propietario,
      telefono:    '',
      sheetId:     t.sheetId,
    });
    await pullFromSheet(tamboId);
  }

  _showToast(`✓ ${nuevos.length} tambo${nuevos.length !== 1 ? 's' : ''} importado${nuevos.length !== 1 ? 's' : ''}`);
  navigate('/config');
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

// ─── Pull por tambo desde Config ─────────────────────────────────────────────

async function configPullTambo(tamboId) {
  if (!navigator.onLine) { alert('Sin conexión a internet.'); return; }
  const btn = document.getElementById('cfg-pull-' + tamboId);
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  const r = await pullFromSheet(tamboId);

  if (btn) { btn.textContent = '↓ Restaurar'; btn.disabled = false; }
  if (!r.ok) alert('❌ Error al importar:\n' + r.error);
}

async function configPullTodos() {
  if (!navigator.onLine) { alert('Sin conexión a internet.'); return; }
  const tambos = (await getTambos()).filter(t => t.sheetId);
  if (!tambos.length) return;

  const btn = document.querySelector('[onclick="configPullTodos()"]');
  if (btn) { btn.textContent = '⏳ Importando…'; btn.disabled = true; }

  let totalImportados = 0;
  for (const t of tambos) {
    const r = await pullFromSheet(t.id);
    if (r.ok) totalImportados += r.importados;
  }

  if (btn) { btn.textContent = '↓ Restaurar todos desde Sheets'; btn.disabled = false; }
  _showToast(`✓ ${totalImportados} control${totalImportados !== 1 ? 'es' : ''} importado${totalImportados !== 1 ? 's' : ''} en total`);
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
