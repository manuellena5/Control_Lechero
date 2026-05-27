/* tambos.js — ABM Tambos + Detalle */

// ─── Lista de tambos ──────────────────────────────────────────────────────────

registerScreen('tambos', async (el) => {
  const tambos = await getTambos();

  // Para cada tambo, obtener el último control
  const items = await Promise.all(tambos.map(async t => {
    const controles = await getControlesDeTambo(t.id);
    const ultimo = controles[0] || null;
    return { tambo: t, ultimoControl: ultimo };
  }));

  el.innerHTML = `
    <div class="page-header page-header--top">
      <h1>Tambos</h1>
      <button class="btn btn-primary btn-sm" onclick="navigate('/tambos/nuevo')">+ Nuevo</button>
    </div>
    <div class="page-body">
      ${items.length === 0
        ? `<div class="empty-state">
             <p>No hay tambos cargados.</p>
             <p class="text3">Creá el primero con el botón + Nuevo.</p>
           </div>`
        : items.map(({ tambo, ultimoControl }) => `
          <div class="list-item" onclick="navigate('/tambos/${tambo.id}')">
            <div class="list-item__body">
              <div class="list-item__title">${tambo.nombre}</div>
              <div class="list-item__sub text2">${tambo.propietario}</div>
              <div class="list-item__meta text3">
                Último control: ${ultimoControl ? formatFecha(ultimoControl.fecha) : 'sin controles'}
              </div>
            </div>
            <div class="list-item__actions" onclick="event.stopPropagation()">
              <button class="btn btn-ghost btn-icon" title="Editar"
                onclick="navigate('/tambos/${tambo.id}/editar')">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn btn-ghost btn-icon btn-danger-ghost" title="Eliminar"
                onclick="confirmarEliminarTambo(${tambo.id}, '${tambo.nombre.replace(/'/g, "\\'")}')">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;
});

async function confirmarEliminarTambo(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"?\n\nSe borrarán todos sus controles y registros. Esta acción no se puede deshacer.`)) return;
  try {
    await deleteTambo(id);
    refresh();
  } catch(e) {
    alert('Error al eliminar: ' + e.message);
    console.error(e);
  }
}

// ─── Formulario crear / editar ────────────────────────────────────────────────

registerScreen('tambo-form', async (el, params) => {
  const esEdicion = !!params.tamboId;
  const tambo = esEdicion ? await getTambo(Number(params.tamboId)) : null;

  el.innerHTML = `
    <div class="page-header">
      <button class="btn btn-ghost btn-icon" onclick="history.back()">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2>${esEdicion ? 'Editar tambo' : 'Nuevo tambo'}</h2>
      <div></div>
    </div>
    <div class="page-body">
      <form id="form-tambo" class="form" onsubmit="guardarTambo(event, ${esEdicion ? tambo.id : 'null'})">
        <div class="form-group">
          <label for="f-nombre">Establecimiento <span class="required">*</span></label>
          <input id="f-nombre" type="text" name="nombre" required
            value="${tambo?.nombre || ''}" placeholder="Ej: Tambo Marcucci">
        </div>
        <div class="form-group">
          <label for="f-propietario">Propietario <span class="required">*</span></label>
          <input id="f-propietario" type="text" name="propietario" required
            value="${tambo?.propietario || ''}" placeholder="Nombre completo">
        </div>
        <div class="form-group">
          <label for="f-telefono">Teléfono</label>
          <input id="f-telefono" type="tel" name="telefono" inputmode="numeric"
            value="${tambo?.telefono || ''}" placeholder="Ej: 2215551234">
        </div>
        <div class="form-group">
          <label for="f-sheetId">ID del Google Sheet</label>
          <input id="f-sheetId" type="text" name="sheetId"
            value="${tambo?.sheetId || ''}" placeholder="1BxiMVs0XRA5nFMdKvBdBZjgm…">
          <p class="form-helper">Copiá el ID de la URL de tu Sheet:<br>
            <span class="mono text3">docs.google.com/spreadsheets/d/<strong>[ID]</strong>/edit</span>
          </p>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="history.back()">Cancelar</button>
          <button type="submit" class="btn btn-primary">${esEdicion ? 'Guardar cambios' : 'Crear tambo'}</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('f-nombre').focus();
});

async function guardarTambo(event, id) {
  event.preventDefault();
  const form = event.target;
  const data = {
    nombre:      form.nombre.value.trim(),
    propietario: form.propietario.value.trim(),
    telefono:    form.telefono.value.trim(),
    sheetId:     form.sheetId.value.trim() || null,
  };
  if (id) data.id = id;
  const tamboId = await saveTambo(data);

  // Registrar el tambo en el script para que otros dispositivos lo descubran
  if (data.sheetId && navigator.onLine) {
    _registrarTamboEnScript(data.sheetId, data.nombre, data.propietario).catch(() => {});
  }

  // Si tiene sheetId y no hay controles locales → ofrecer pull
  if (data.sheetId) {
    const count = await db.controles.where('tamboId').equals(tamboId).count();
    if (count === 0) {
      navigate('/tambos/' + tamboId);
      if (confirm(
        '¿Restaurar datos desde Google Sheets?\n\n' +
        'Este tambo tiene un Sheet vinculado. ' +
        '¿Querés importar el historial existente?'
      )) {
        const r = await pullFromSheet(tamboId);
        if (!r.ok) alert('❌ Error al importar:\n' + r.error);
        else refresh();
      }
      return;
    }
  }

  navigate('/tambos/' + tamboId);
}

// ─── Detalle del tambo ────────────────────────────────────────────────────────

registerScreen('tambo-detalle', async (el, params) => {
  const tamboId = Number(params.tamboId);
  const tambo = await getTambo(tamboId);
  if (!tambo) { el.innerHTML = '<div class="page-body"><p class="text2">Tambo no encontrado.</p></div>'; return; }

  const controles = await getControlesDeTambo(tamboId);
  const hoy = fechaHoy();
  const controlHoy = controles.find(c => c.fecha === hoy);

  // Total litros por control (para mostrar en historial)
  const controlesConTotal = await Promise.all(controles.map(async c => ({
    ...c,
    total: await getLitrosControl(c.id)
  })));

  el.innerHTML = `
    <div class="page-header">
      <button class="btn btn-ghost btn-icon" onclick="navigate('/tambos')">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="page-header__title-truncate">${tambo.nombre}</h2>
      <button class="btn btn-ghost btn-icon" onclick="navigate('/tambos/${tamboId}/editar')" title="Editar">
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>

    <div class="page-body">
      <!-- Datos del tambo -->
      <div class="card card--info">
        <div class="info-row"><span class="text3">Propietario</span><span>${tambo.propietario}</span></div>
        ${tambo.telefono ? `<div class="info-row"><span class="text3">Teléfono</span><span>${tambo.telefono}</span></div>` : ''}
        ${tambo.sheetId ? `<div class="info-row"><span class="text3">Sheet ID</span><span class="mono text3 truncate">${tambo.sheetId}</span></div>` : ''}
      </div>

      <!-- Acción principal -->
      <div class="control-fecha-wrap">
        <input type="date" id="fecha-control" class="fecha-control-input" value="${hoy}"
               oninput="actualizarBotonControl(${tamboId}, this.value)">
        <button id="btn-control" class="btn btn-primary btn-full btn-lg"
                onclick="iniciarControl(${tamboId})">
          ${controlHoy ? '▶ Continuar control' : '+ Nuevo control'}
        </button>
      </div>

      <!-- Padrón -->
      <button class="btn btn-secondary btn-full" onclick="navigate('/tambos/${tamboId}/padron')">
        Ver padrón de vacas
      </button>

      ${tambo.sheetId ? `
      <!-- Restaurar desde Sheets -->
      <button class="btn btn-secondary btn-full" id="btn-pull-${tamboId}"
              onclick="restaurarDesdeSheetsDetalle(${tamboId})">
        ☁️ Restaurar desde Sheets
      </button>` : ''}

      <!-- Historial de controles -->
      <div class="section-title">Historial</div>
      ${controlesConTotal.length === 0
        ? '<p class="text3" style="text-align:center;padding:16px 0">Sin controles registrados</p>'
        : controlesConTotal.map(c => `
          <div class="list-item list-item--compact">
            <div class="list-item__body">
              <div class="list-item__title">${formatFecha(c.fecha)}</div>
              <div class="list-item__meta text3">${c.total > 0 ? c.total.toFixed(1) + ' L totales' : 'sin litros'}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="navigate('/tambos/${tamboId}/control/${c.id}/planilla')">
              Ver planilla
            </button>
          </div>
        `).join('')
      }
    </div>
  `;
});

async function _registrarTamboEnScript(sheetId, nombre, propietario) {
  const vet = await getVeterinario();
  if (!vet?.appsScriptUrl) return;
  await fetch(vet.appsScriptUrl, {
    method:   'POST',
    headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
    body:     JSON.stringify({ action: 'register', sheetId, nombre, propietario }),
    redirect: 'follow',
  });
}

async function restaurarDesdeSheetsDetalle(tamboId) {
  if (!navigator.onLine) {
    alert('Sin conexión a internet.');
    return;
  }
  if (!confirm(
    'Esto importará los controles del Sheet que no existan localmente.\n' +
    'Los datos locales no se modificarán.\n\n¿Continuar?'
  )) return;

  const btn = document.getElementById('btn-pull-' + tamboId);
  if (btn) { btn.textContent = '⏳ Importando…'; btn.disabled = true; }

  const r = await pullFromSheet(tamboId);

  if (btn) { btn.textContent = '☁️ Restaurar desde Sheets'; btn.disabled = false; }

  if (!r.ok) {
    alert('❌ Error al importar:\n' + r.error);
  } else if (r.importados > 0) {
    refresh();
  }
}

async function iniciarControl(tamboId) {
  const fechaInput = document.getElementById('fecha-control');
  const fecha = (fechaInput && fechaInput.value) ? fechaInput.value : fechaHoy();
  await getOrCreateControl(tamboId, fecha);
  navigate('/tambos/' + tamboId + '/control/' + fecha);
}

async function actualizarBotonControl(tamboId, fecha) {
  const btn = document.getElementById('btn-control');
  if (!btn || !fecha) return;
  const control = await db.controles.where('[tamboId+fecha]').equals([tamboId, fecha]).first();
  btn.textContent = control ? '▶ Continuar control' : '+ Nuevo control';
}
