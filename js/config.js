/* config.js — Pantalla de configuración */

const APP_VERSION = '1.40'; // Actualizar junto con CACHE en sw.js

registerScreen('config', async (el) => {
  await seedTagsIfEmpty();
  const [vet, tambos, tags] = await Promise.all([getVeterinario(), getTambos(), getTags()]);
  el.innerHTML = _configHTML(vet || {}, tambos, tags);
  updateSyncBadges();
  _mostrarEstadoPersistencia();
});

// Indica si el navegador se comprometió a no borrar los datos por inactividad.
async function _mostrarEstadoPersistencia() {
  const el = document.getElementById('persist-estado');
  if (!el) return;
  let ok = await estadoPersistencia();
  if (ok === false) ok = await solicitarPersistencia();   // reintentar

  if (ok === true) {
    el.textContent = '✓ Sí';
    el.style.color = 'var(--accent)';
  } else if (ok === false) {
    el.textContent = '⚠️ No — instalá la app';
    el.style.color = 'var(--pending)';
    el.title = 'Agregá la app a la pantalla de inicio para que el navegador no borre los datos por falta de uso.';
  } else {
    el.textContent = '—';
  }
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function _configHTML(vet, tambos, tags) {
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
            <label class="form-label">Teléfono</label>
            <input class="form-input" id="vet-telefono" type="tel" placeholder="Ej: 351 1234567"
              value="${vet.telefono || ''}" autocomplete="off">
            <span class="form-hint">Aparecerá en los reportes junto al nombre y la matrícula.</span>
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

      <!-- Tags de vacas -->
      <div class="card">
        <h3 class="card-title">Tags de vacas</h3>
        <p class="form-hint" style="margin-top:-4px;margin-bottom:12px">
          Etiquetas que podés ponerle a una vaca en el control (ej: Venta, Secar).
          No afectan los litros, son una marca visual.
        </p>
        <div class="tag-admin-list">
          ${tags.map(t => {
            const off = t.activo === 0;
            const esc = t.nombre.replace(/'/g, "\\'");
            return `
            <div class="tag-admin-row${off ? ' tag-admin-row--off' : ''}">
              <span class="tag-admin-dot" style="background:${t.color}"></span>
              <span class="tag-admin-name">${t.nombre}${off ? ' <span class="tag-off-lbl">(deshabilitado)</span>' : ''}</span>
              <button class="btn-tag-edit" onclick="cfgRenombrarTag(${t.id}, '${esc}')" title="Renombrar">✎</button>
              <button class="btn-tag-toggle" onclick="cfgToggleTag(${t.id}, ${off ? 1 : 0})">${off ? 'Habilitar' : 'Deshabilitar'}</button>
            </div>`;
          }).join('')}
        </div>
        <div class="tag-admin-add">
          <input class="form-input" id="tag-nuevo" type="text" placeholder="Nuevo tag (ej: Tratamiento)"
            autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();cfgAgregarTag();}">
          <button class="btn btn-secondary btn-sm" onclick="cfgAgregarTag()">+ Agregar</button>
        </div>
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

      <!-- Actualizaciones -->
      <div class="card">
        <h3 class="card-title">Versión de la app</h3>
        <div class="config-sync-row" style="margin-bottom:12px">
          <span class="text3">Versión instalada</span>
          <span class="mono" style="font-size:14px;font-weight:600;">${APP_VERSION}</span>
        </div>
        <button class="btn btn-secondary btn-full" id="btn-update" onclick="buscarActualizaciones()">
          🔄 Buscar actualizaciones
        </button>
        <p class="form-hint" style="margin-top:8px">
          Si hay una versión nueva se descarga e instala automáticamente.
        </p>
      </div>

      <!-- Backup -->
      <div class="card">
        <h3 class="card-title">Copia de seguridad</h3>
        <div class="config-sync-row" style="margin-bottom:12px">
          <span class="text3">Datos protegidos</span>
          <span id="persist-estado" class="text3">…</span>
        </div>
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
  const telefono  = document.getElementById('vet-telefono').value.trim();
  const url       = document.getElementById('vet-url').value.trim();

  const vetAnterior = await getVeterinario();
  const urlCambio   = url && url !== (vetAnterior?.appsScriptUrl || '');

  await saveVeterinario({ id: 1, nombre, matricula, telefono, appsScriptUrl: url });

  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = '✓ Guardado';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = 'Guardar'; btn.disabled = false; }, 1500);

  // Si el URL cambió y hay internet → buscar tambos en el script
  if (urlCambio && navigator.onLine) {
    await _buscarTambosEnScript(url);
  }
}

// ─── ABM de tags ──────────────────────────────────────────────────────────────

async function cfgAgregarTag() {
  const inp = document.getElementById('tag-nuevo');
  const nombre = (inp?.value || '').trim();
  if (!nombre) { inp?.focus(); return; }
  const btn = document.querySelector('[onclick="cfgAgregarTag()"]');
  if (btn) btn.disabled = true;
  const existe = await getTagByNombre(nombre);
  if (existe && existe.activo !== 0) {
    if (btn) btn.disabled = false;
    alert('Ya existe un tag con ese nombre.');
    return;
  }
  await addTag(nombre); // si existía deshabilitado, lo re-habilita
  refresh();
}

async function cfgRenombrarTag(id, nombreActual) {
  const nuevo = prompt('Nuevo nombre para el tag:', nombreActual);
  if (nuevo === null) return;
  const nombre = nuevo.trim();
  if (!nombre || nombre === nombreActual) return;
  const existe = await getTagByNombre(nombre);
  if (existe && existe.id !== id) { alert('Ya existe otro tag con ese nombre.'); return; }
  await updateTagNombre(id, nombre);
  refresh();
}

async function cfgToggleTag(id, activo) {
  await setTagActivo(id, activo);
  refresh();
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

  const vet = await getVeterinario();
  if (!vet?.appsScriptUrl) {
    alert('Primero configurá la URL del Apps Script en la sección "Veterinario".');
    return;
  }

  const btn = document.getElementById('btn-force-sync');
  if (btn) { btn.textContent = '⏳ Sincronizando…'; btn.disabled = true; }

  // 1. Push: enviar controles pendientes
  await procesarQueue();
  await updateSyncBadges();

  // 2. Descubrir tambos en el script que no están en este dispositivo
  let tambosNuevos = [];
  let errorScript  = null;
  try {
    const res  = await fetch(`${vet.appsScriptUrl}?action=list`, { redirect: 'follow' });
    const data = await res.json();

    // Si el script devuelve error o no tiene "tambos", probablemente no fue redesplegado
    if (data.ok === false) {
      errorScript = 'El script devolvió un error: ' + data.error +
        '\n\n¿Redesplegaste el Apps Script con la versión nueva?';
    } else if (!Array.isArray(data.tambos)) {
      errorScript = 'El script no reconoce el comando "list".' +
        '\n\nNecesitás redesplegar el Apps Script:\n' +
        'Implementar → Administrar implementaciones → editar → Nueva versión → Implementar';
    } else {
      const locales = await getTambos();
      const sheetIdsLocales = new Set(locales.map(t => t.sheetId).filter(Boolean));
      tambosNuevos = data.tambos.filter(t => t.sheetId && !sheetIdsLocales.has(t.sheetId));
    }
  } catch (err) {
    errorScript = 'No se pudo conectar con el script: ' + err.message;
  }

  if (btn) { btn.textContent = 'Forzar sincronización ↑'; btn.disabled = false; }

  if (errorScript) {
    alert('⚠️ ' + errorScript);
    return;
  }

  // 3. Ofrecer importar los tambos nuevos
  if (tambosNuevos.length > 0) {
    const lista = tambosNuevos.map(t => `• ${t.nombre} (${t.propietario})`).join('\n');
    if (confirm(
      `Se encontraron ${tambosNuevos.length} tambo${tambosNuevos.length !== 1 ? 's' : ''} ` +
      `en el script que no están en este dispositivo:\n\n${lista}\n\n¿Importarlos?`
    )) {
      for (const t of tambosNuevos) {
        const tamboId = await saveTambo({
          nombre:      t.nombre,
          propietario: t.propietario,
          telefono:    '',
          sheetId:     t.sheetId,
        });
        await pullFromSheet(tamboId);
      }
      navigate('/config');
    }
  } else {
    _showToast('✓ Todo sincronizado. Sin tambos nuevos.');
  }
}

// ─── Modal bloqueante de actualización ───────────────────────────────────────

function _mostrarModalActualizando(texto) {
  // Crear si no existe
  let modal = document.getElementById('update-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'update-modal';
    modal.className = 'update-modal';
    modal.innerHTML = `
      <div class="update-modal__box">
        <div class="update-modal__spinner"></div>
        <div class="update-modal__title" id="update-modal-title">Actualizando…</div>
        <div class="update-modal__sub">
          No cerrés la app. La página se va a recargar automáticamente cuando termine.
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Actualizar texto si se pasa uno
  if (texto) {
    const title = document.getElementById('update-modal-title');
    if (title) title.textContent = texto;
  }

  return modal;
}

// ─── Buscar actualizaciones ───────────────────────────────────────────────────

async function buscarActualizaciones() {
  const btn = document.getElementById('btn-update');
  const restaurarBtn = () => {
    if (btn) { btn.textContent = '🔄 Buscar actualizaciones'; btn.disabled = false; }
  };

  if (!('serviceWorker' in navigator)) {
    alert('Tu browser no soporta Service Workers. Abrí la app desde su URL en GitHub Pages.');
    return;
  }

  if (btn) { btn.textContent = '⏳ Verificando…'; btn.disabled = true; }

  // 1. Leer la versión publicada en el servidor, sin pasar por la caché HTTP.
  let remoteV = null;
  try {
    // El query único evita cualquier copia cacheada (HTTP o del Service Worker)
    const res  = await fetch(`./sw.js?_=${Date.now()}`, { cache: 'no-store' });
    const text = await res.text();
    remoteV = text.match(/const CACHE = '(control-lechero-v\d+)'/)?.[1] || null;
  } catch (_) {
    _showToast('Sin conexión. Conectate a internet para actualizar.');
    restaurarBtn();
    return;
  }

  // 2. Compararla con lo que ya está instalado en este dispositivo.
  const localCaches = await caches.keys();
  const hayVersionNueva = remoteV && !localCaches.includes(remoteV);

  if (!hayVersionNueva) {
    _showToast('✓ Ya tenés la última versión instalada.');
    restaurarBtn();
    return;
  }

  // 3. Hay versión nueva → forzar la actualización de la forma más directa:
  //    borrar la caché vieja, desregistrar el Service Worker y recargar.
  //    Al recargar, la app baja los archivos nuevos desde la red y el SW se
  //    vuelve a registrar con la versión publicada. Sin esperar eventos del
  //    ciclo de vida del SW (que en mobile pueden tardar o no dispararse).
  _mostrarModalActualizando('Instalando actualización…');
  try {
    await Promise.all(localCaches.map(k => caches.delete(k)));
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.unregister();
  } catch (_) { /* la recarga resuelve igual */ }
  setTimeout(() => window.location.reload(), 300);
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

  const texto  = JSON.stringify(backup, null, 2);
  const nombre = `control-lechero-backup-${fechaHoy()}.json`;

  // En iOS el truco de <a download> no funciona bien (sobre todo con la app
  // instalada en la pantalla de inicio): puede abrir el JSON en pantalla o no
  // hacer nada. Si el dispositivo tiene menú de compartir, lo usamos para que
  // el archivo se pueda guardar en Archivos, iCloud, mail, WhatsApp, etc.
  try {
    const file = new File([texto], nombre, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup Control Lechero' });
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;  // el usuario canceló
    // cualquier otro error: seguimos con la descarga clásica
  }

  const blob = new Blob([texto], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
