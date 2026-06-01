/* registro.js — Pantalla de carga de control */

// ─── Estado ───────────────────────────────────────────────────────────────────

const R = {
  el: null,
  tamboId: null,
  tambo: null,
  controlId: null,
  turno: 'mañana',
  tandaActivaId: null,
  allTandas: [],
  allRegistros: {},         // { [tandaId]: Registro[] }
  padron: [],
  estadoChip: null,         // 'venta' | 'secar' | null
  editRegId: null,
  bsChip: null,
  tandasExpandidas: new Set(), // IDs de tandas no-activas expandidas manualmente
  rpAlfanumerico: false,       // tipo de teclado para el input RP
  busquedaRP: '',              // filtro visual de búsqueda
  rpsDuplicados: new Set(),    // RPs con advertencia de duplicado activa
  ultimoRpWarning: null,       // RP que ya recibió advertencia (confirmar en segundo press)
};

let _pendingEliminarId = null;
let _pendingEliminarRp = '';

// ─── Pantalla principal ───────────────────────────────────────────────────────

registerScreen('registro', async (el, params) => {
  R.el = el;
  R.tamboId = Number(params.tamboId);
  R.turno = 'mañana';
  R.estadoChip = null;
  R.tandasExpandidas = new Set();
  R.rpsDuplicados = new Set();
  R.ultimoRpWarning = null;
  R.busquedaRP = '';

  R.tambo = await getTambo(R.tamboId);
  if (!R.tambo) {
    el.innerHTML = '<div class="page-body"><p class="text2">Tambo no encontrado.</p></div>';
    return;
  }
  R.rpAlfanumerico = R.tambo.rpAlfanumerico || false;

  const fecha = params.fecha || fechaHoy();
  const control = await getOrCreateControl(R.tamboId, fecha);
  R.controlId = control.id;
  R.padron = await getPadronTambo(R.tamboId);

  await _regLoad();
  _renderFull();
  _ensureBottomSheet();
  _ensureConfirmSheet();
});

// ─── Carga de datos ───────────────────────────────────────────────────────────

async function _regLoad() {
  R.allTandas = await getTandasDeControl(R.controlId);
  R.allRegistros = {};
  for (const t of R.allTandas) {
    R.allRegistros[t.id] = await getRegistrosDeTanda(t.id);
  }
  _syncTandaActiva();
}

function _syncTandaActiva() {
  const del_turno = R.allTandas.filter(t => t.turno === R.turno);
  R.tandaActivaId = del_turno.length > 0 ? del_turno[del_turno.length - 1].id : null;
}

// ─── Render completo ──────────────────────────────────────────────────────────

function _renderFull() {
  const turnosConTandas = [...new Set(R.allTandas.map(t => t.turno))];
  const extraTurnos = turnosConTandas.filter(t => t !== 'mañana' && t !== 'tarde');
  const allTurnos = ['mañana', 'tarde', ...extraTurnos];
  // Incluir siempre el turno activo aunque no tenga tandas aún (turno recién creado)
  if (!allTurnos.includes(R.turno)) allTurnos.push(R.turno);
  const turnoIconos = { mañana: '🌅', tarde: '🌇' };
  const syncClass = 'sync--pending';
  const syncLabel = '…';
  const rpInputMode = R.rpAlfanumerico ? 'text' : 'numeric';
  const rpModeLabel = R.rpAlfanumerico ? 'ABC' : '#';

  R.el.innerHTML = `
    <div class="reg-wrap">
      <div class="reg-header">
        <button class="btn btn-ghost btn-icon" onclick="navigate('/tambos/${R.tamboId}')">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="reg-header__info">
          <span class="reg-header__tambo">${R.tambo.nombre}</span>
          <span class="reg-header__fecha">${formatFecha(fechaHoy())}</span>
        </div>
        <span class="sync-badge ${syncClass}" title="${syncClass === 'sync--offline' ? 'Sin conexión' : 'Pendiente de sync'}">${syncLabel}</span>
      </div>

      <div id="reg-stats" class="stats-bar"></div>

      <div class="turno-tabs">
        ${allTurnos.map(t => `
          <button class="turno-tab${t === R.turno ? ' active' : ''}" data-turno="${t}"
            onclick="cambiarTurno('${t}')">
            ${turnoIconos[t] || '🕐'} ${_cap(t)}
          </button>`).join('')}
        <button class="turno-tab turno-tab--add" onclick="_pedirTurnoExtra()" title="Agregar turno">＋</button>
      </div>

      <div class="entrada-wrap">
        <div class="entrada-row">
          <div class="rp-wrap" onfocusout="setTimeout(_hideAC, 150)">
            <input id="inp-rp" class="inp-rp" type="text" inputmode="${rpInputMode}"
              placeholder="RP" autocomplete="off" enterkeyhint="next">
            <div id="ac-list" class="ac-list hidden"></div>
          </div>
          <button id="btn-rp-mode" class="btn-rp-mode${R.rpAlfanumerico ? ' active' : ''}"
            onclick="toggleRpMode()" title="Cambiar tipo de teclado">${rpModeLabel}</button>
          <input id="inp-litros" class="inp-litros" type="number" inputmode="decimal"
            step="0.5" min="0" placeholder="Litros" enterkeyhint="done">
          <button class="btn-agregar" onclick="agregarVaca()">+</button>
        </div>
        <div class="chips-row">
          <button id="chip-venta" class="chip chip--venta${R.estadoChip === 'venta' ? ' active' : ''}"
            onclick="toggleChip('venta')">Venta</button>
          <button id="chip-secar" class="chip chip--secar${R.estadoChip === 'secar' ? ' active' : ''}"
            onclick="toggleChip('secar')">Secar</button>
        </div>
      </div>

      <div class="busqueda-rp-wrap">
        <svg class="lupa-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="inp-busqueda" class="inp-busqueda" type="text" inputmode="search"
          placeholder="Buscar RP…" autocomplete="off"
          value="${R.busquedaRP}"
          oninput="_onBusquedaInput(this.value)">
      </div>

      <div id="tandas-list"></div>

      <div class="reg-footer">
        <button class="btn btn-secondary btn-sm" onclick="nuevaTanda()">+ Nueva tanda</button>
        <button class="btn btn-ghost btn-sm" onclick="verPlanilla()">Ver planilla →</button>
      </div>
    </div>
  `;

  _renderStats();
  _renderTandas();
  _attachEntradaListeners();
  updateSyncBadges();
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function _computeStats() {
  const rps = new Set();
  let litros = 0, conLitros = 0;
  for (const regs of Object.values(R.allRegistros)) {
    for (const r of regs) {
      rps.add(r.rp);
      if (r.estado !== 'venta' && r.estado !== 'pendiente' && r.litros != null) {
        litros += r.litros;
        conLitros++;
      }
    }
  }
  return { vacas: rps.size, litros, promedio: conLitros > 0 ? litros / conLitros : 0 };
}

function _renderStats() {
  const el = document.getElementById('reg-stats');
  if (!el) return;
  const s = _computeStats();
  el.innerHTML = `
    <div class="stat-card"><span class="stat-val">${s.vacas}</span><span class="stat-lbl">Vacas</span></div>
    <div class="stat-card"><span class="stat-val">${_fmtL(s.litros)}</span><span class="stat-lbl">Litros</span></div>
    <div class="stat-card"><span class="stat-val">${s.promedio > 0 ? s.promedio.toFixed(1) : '—'}</span><span class="stat-lbl">Prom.</span></div>
  `;
}

// ─── Tandas ───────────────────────────────────────────────────────────────────

function _renderTandas() {
  const el = document.getElementById('tandas-list');
  if (!el) return;
  const tandasTurno = R.allTandas.filter(t => t.turno === R.turno);
  if (tandasTurno.length === 0) {
    el.innerHTML = '<p class="text3 empty-turno">Sin vacas en este turno. Ingresá el primer RP arriba.</p>';
    return;
  }

  // Tanda activa primero, luego el resto en orden
  const sorted = [
    ...tandasTurno.filter(t => t.id === R.tandaActivaId),
    ...tandasTurno.filter(t => t.id !== R.tandaActivaId),
  ];

  const html = sorted.map(t => _tandaHTML(t)).join('');
  el.innerHTML = html || '<p class="text3 empty-turno">Sin resultados para la búsqueda.</p>';
}

function _tandaHTML(tanda) {
  const regsAll = R.allRegistros[tanda.id] || [];
  const esActiva = tanda.id === R.tandaActivaId;

  // Filtrar por búsqueda (visual only, no toca R)
  const q = R.busquedaRP.trim().toUpperCase();
  const regs = q ? regsAll.filter(r => r.rp.toUpperCase().includes(q)) : regsAll;

  // Si hay búsqueda activa y ninguna vaca coincide → ocultar tanda
  if (q && regs.length === 0) return '';

  // Stats del header basados en todos los registros (no filtrados)
  const litros = regsAll.reduce((s, r) =>
    r.estado !== 'venta' && r.estado !== 'pendiente' && r.litros != null ? s + r.litros : s, 0);
  const pend = regsAll.filter(r => r.estado === 'pendiente').length;

  // Tanda activa: mostrar más recientes primero
  const displayRegs = esActiva ? [...regs].reverse() : regs;

  const expandida = esActiva || R.tandasExpandidas.has(tanda.id);

  const bodyHTML = displayRegs.length === 0
    ? '<p class="text3" style="padding:8px 16px;font-size:13px">Tanda vacía</p>'
    : displayRegs.map(r => _vacaRowHTML(r)).join('');

  if (esActiva) {
    return `
      <div class="tanda-group tanda-group--active">
        <div class="tanda-header">
          <span class="tanda-title">Tanda ${tanda.numero}</span>
          <span class="tanda-meta">
            ${regsAll.length} vaca${regsAll.length !== 1 ? 's' : ''} · ${_fmtL(litros)} L
            ${pend > 0 ? `<span class="badge badge--pending"> ${pend} pend.</span>` : ''}
          </span>
        </div>
        <div class="tanda-body">${bodyHTML}</div>
      </div>
    `;
  }

  return `
    <div class="tanda-group">
      <div class="tanda-header tanda-header--clickable" onclick="toggleTanda(${tanda.id})">
        <span class="tanda-title">Tanda ${tanda.numero}</span>
        <span class="tanda-meta">
          ${regsAll.length} vaca${regsAll.length !== 1 ? 's' : ''} · ${_fmtL(litros)} L
          ${pend > 0 ? `<span class="badge badge--pending"> ${pend} pend.</span>` : ''}
          <svg class="tanda-chevron${expandida ? ' tanda-chevron--open' : ''}" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
      </div>
      <div class="tanda-body${expandida ? '' : ' tanda-body--collapsed'}">${bodyHTML}</div>
    </div>
  `;
}

function _vacaRowHTML(reg) {
  const isDuplicate = R.rpsDuplicados.has(reg.rp);
  const badges = {
    venta:    `<span class="badge badge--venta">VENTA</span>`,
    secar:    `<span class="badge badge--secar">SECAR</span>`,
    pendiente:`<span class="badge badge--pending">Pend.</span>`,
    normal:   `<span></span>`,
  };
  const litrosCell = reg.estado === 'venta'
    ? `<span class="litros-btn litros-btn--disabled">—</span>`
    : `<button class="litros-btn" onclick="abrirEdicion(${reg.id})">
         ${reg.litros != null ? _fmtL(reg.litros) : '?'}
         <svg class="edit-icon" viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
           <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
         </svg>
       </button>`;

  return `
    <div class="vaca-row vaca-row--${reg.estado}${isDuplicate ? ' vaca-row--duplicado' : ''}">
      <span class="rp-display mono">${reg.rp}${isDuplicate ? ' <span class="badge badge--duplicado">×2</span>' : ''}</span>
      ${badges[reg.estado] || badges.normal}
      <span class="vaca-litros">${litrosCell}</span>
      <button class="btn-del" onclick="pedirConfirmEliminar(${reg.id}, '${reg.rp.replace(/'/g, "\\'")}')" title="Eliminar">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;
}

// ─── Acciones ─────────────────────────────────────────────────────────────────

function toggleChip(chip) {
  R.estadoChip = R.estadoChip === chip ? null : chip;
  document.getElementById('chip-venta').classList.toggle('active', R.estadoChip === 'venta');
  document.getElementById('chip-secar').classList.toggle('active', R.estadoChip === 'secar');
  const litrosInp = document.getElementById('inp-litros');
  if (litrosInp) litrosInp.disabled = R.estadoChip === 'venta';
  document.getElementById('inp-rp').focus();
}

async function agregarVaca() {
  const rpInp     = document.getElementById('inp-rp');
  const litrosInp = document.getElementById('inp-litros');
  const rp = rpInp.value.trim();
  if (!rp) { rpInp.focus(); return; }

  // Validar duplicado solo dentro del mismo turno (distinto turno = ordeñe distinto, es normal)
  const tandasDelTurno = R.allTandas.filter(t => t.turno === R.turno).map(t => t.id);
  const yaExiste = tandasDelTurno.some(tid => (R.allRegistros[tid] || []).some(r => r.rp === rp));
  if (yaExiste && R.ultimoRpWarning !== rp) {
    R.ultimoRpWarning = rp;
    R.rpsDuplicados.add(rp);
    _showToast(`RP ${rp} ya está en este control. Presioná + de nuevo para confirmar.`, 'warning');
    _renderTandas();
    return;
  }
  R.ultimoRpWarning = null; // Confirmado (segundo press) o RP nuevo

  const litros = litrosInp.value !== '' ? parseFloat(litrosInp.value) : null;
  const estado = R.estadoChip || (litros != null ? 'normal' : 'pendiente');

  // Crear tanda si no hay ninguna para este turno
  if (!R.tandaActivaId) {
    const t = await addTanda(R.controlId, R.turno);
    R.allTandas.push(t);
    R.allRegistros[t.id] = [];
    R.tandaActivaId = t.id;
  }

  const reg = await addRegistro(R.tandaActivaId, rp, litros, estado);
  R.allRegistros[R.tandaActivaId].push(reg);
  if (!R.padron.find(v => v.rp === rp)) R.padron.push({ rp });

  rpInp.value = '';
  litrosInp.value = '';
  _hideAC();
  _renderStats();
  _renderTandas();
  enqueueControlSync(R.controlId, R.tamboId);
  rpInp.focus();
}

async function nuevaTanda() {
  const t = await addTanda(R.controlId, R.turno);
  R.allTandas.push(t);
  R.allRegistros[t.id] = [];
  R.tandaActivaId = t.id;
  _renderTandas();
}

async function eliminarDeControl(regId) {
  await deleteRegistro(regId);
  for (const tid in R.allRegistros) {
    R.allRegistros[tid] = R.allRegistros[tid].filter(r => r.id !== regId);
  }
  _renderStats();
  _renderTandas();
  enqueueControlSync(R.controlId, R.tamboId);
}

function cambiarTurno(turno) {
  R.turno = turno;
  _syncTandaActiva();
  document.querySelectorAll('.turno-tab[data-turno]').forEach(el => {
    el.classList.toggle('active', el.dataset.turno === turno);
  });
  _renderTandas();
}

function verPlanilla() {
  navigate('/tambos/' + R.tamboId + '/control/' + R.controlId + '/planilla');
}

function _pedirTurnoExtra() {
  const nombre = prompt('Nombre del turno adicional (ej: noche):');
  if (!nombre || !nombre.trim()) return;
  const turno = nombre.trim().toLowerCase();
  if (!R.allTandas.find(t => t.turno === turno)) {
    // El turno no existe aún, solo cambiar UI; la tanda se crea al agregar la primera vaca
  }
  R.turno = turno;
  _syncTandaActiva();
  _renderFull();
}

// ─── Toggle colapso de tanda ──────────────────────────────────────────────────

function toggleTanda(tandaId) {
  if (R.tandasExpandidas.has(tandaId)) {
    R.tandasExpandidas.delete(tandaId);
  } else {
    R.tandasExpandidas.add(tandaId);
  }
  _renderTandas();
}

// ─── Toggle teclado RP ────────────────────────────────────────────────────────

function toggleRpMode() {
  R.rpAlfanumerico = !R.rpAlfanumerico;
  const inp = document.getElementById('inp-rp');
  const btn = document.getElementById('btn-rp-mode');
  if (inp) inp.inputMode = R.rpAlfanumerico ? 'text' : 'numeric';
  if (btn) {
    btn.textContent = R.rpAlfanumerico ? 'ABC' : '#';
    btn.classList.toggle('active', R.rpAlfanumerico);
  }
}

// ─── Buscador RP ──────────────────────────────────────────────────────────────

function _onBusquedaInput(val) {
  R.busquedaRP = val;
  _renderTandas();
}

// ─── Confirm eliminar (bottom sheet) ─────────────────────────────────────────

function pedirConfirmEliminar(regId, rp) {
  _pendingEliminarId = regId;
  _pendingEliminarRp = rp;
  _ensureConfirmSheet();
  const label = document.getElementById('confirm-rp-label');
  if (label) label.textContent = rp;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}

function _cerrarConfirmEliminar() {
  const ov = document.getElementById('confirm-overlay');
  if (ov) ov.classList.add('hidden');
  _pendingEliminarId = null;
  _pendingEliminarRp = '';
}

async function _confirmarEliminar() {
  if (!_pendingEliminarId) return;
  const id = _pendingEliminarId;
  _cerrarConfirmEliminar();
  await eliminarDeControl(id);
}

function _ensureConfirmSheet() {
  if (document.getElementById('confirm-overlay')) return;
  const div = document.createElement('div');
  div.id = 'confirm-overlay';
  div.className = 'bs-overlay hidden';
  div.onclick = _cerrarConfirmEliminar;
  div.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="bs-handle"></div>
      <div class="bs-header">
        <h3>Eliminar vaca</h3>
        <p class="text3">¿Eliminar RP <strong id="confirm-rp-label"></strong> de este control?</p>
      </div>
      <div class="bs-actions">
        <button class="btn btn-secondary" onclick="_cerrarConfirmEliminar()">Cancelar</button>
        <button class="btn btn-danger" onclick="_confirmarEliminar()">Eliminar</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────

function _onRpInput(val) {
  const q = val.trim();
  if (!q) { _hideAC(); return; }
  const matches = R.padron.filter(v => v.rp.startsWith(q) && v.rp !== q).slice(0, 6);
  const list = document.getElementById('ac-list');
  if (!list) return;
  if (matches.length === 0) { _hideAC(); return; }
  list.innerHTML = matches.map(v =>
    `<div class="ac-item mono" onmousedown="_selectRp('${v.rp}')">${v.rp}</div>`
  ).join('');
  list.classList.remove('hidden');
}

function _selectRp(rp) {
  const rpInp = document.getElementById('inp-rp');
  if (rpInp) rpInp.value = rp;
  _hideAC();
  const litrosInp = document.getElementById('inp-litros');
  if (litrosInp && R.estadoChip !== 'venta') litrosInp.focus();
  else if (rpInp) rpInp.focus();
}

function _hideAC() {
  const list = document.getElementById('ac-list');
  if (list) list.classList.add('hidden');
}

function _attachEntradaListeners() {
  const rpInp    = document.getElementById('inp-rp');
  const litrosInp = document.getElementById('inp-litros');
  if (!rpInp || !litrosInp) return;

  rpInp.addEventListener('input', e => _onRpInput(e.target.value));
  rpInp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      _hideAC();
      if (R.estadoChip !== 'venta') litrosInp.focus();
      else agregarVaca();
    }
  });
  litrosInp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); agregarVaca(); }
  });
}

// ─── Bottom sheet — edición de vaca ──────────────────────────────────────────

function _ensureBottomSheet() {
  if (document.getElementById('bs-overlay')) return;
  const div = document.createElement('div');
  div.id = 'bs-overlay';
  div.className = 'bs-overlay hidden';
  div.onclick = cerrarEdicion;
  div.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="bs-handle"></div>
      <div class="bs-header">
        <h3 id="bs-title"></h3>
        <p id="bs-subtitle" class="text3"></p>
      </div>
      <div class="bs-body">
        <input id="bs-litros" type="number" inputmode="decimal" step="0.5" min="0"
               class="bs-litros-input" placeholder="Litros">
        <div class="chips-row chips-row--centered">
          <button id="bs-chip-venta" class="chip chip--venta" onclick="bsToggleChip('venta')">Venta</button>
          <button id="bs-chip-secar" class="chip chip--secar" onclick="bsToggleChip('secar')">Secar</button>
        </div>
      </div>
      <div class="bs-actions">
        <button class="btn btn-secondary" onclick="cerrarEdicion()">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarEdicion()">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
}

function abrirEdicion(regId) {
  let reg = null;
  for (const regs of Object.values(R.allRegistros)) {
    reg = regs.find(r => r.id === regId);
    if (reg) break;
  }
  if (!reg) return;

  R.editRegId = regId;
  R.bsChip = reg.estado === 'venta' ? 'venta' : reg.estado === 'secar' ? 'secar' : null;

  document.getElementById('bs-title').textContent = 'RP ' + reg.rp;
  document.getElementById('bs-subtitle').textContent = reg.estado;
  const litrosInp = document.getElementById('bs-litros');
  litrosInp.value = reg.litros != null ? reg.litros : '';
  litrosInp.disabled = reg.estado === 'venta';
  document.getElementById('bs-chip-venta').classList.toggle('active', R.bsChip === 'venta');
  document.getElementById('bs-chip-secar').classList.toggle('active', R.bsChip === 'secar');
  document.getElementById('bs-overlay').classList.remove('hidden');
  setTimeout(() => litrosInp.focus(), 100);
}

function cerrarEdicion() {
  const ov = document.getElementById('bs-overlay');
  if (ov) ov.classList.add('hidden');
  R.editRegId = null;
}

function bsToggleChip(chip) {
  R.bsChip = R.bsChip === chip ? null : chip;
  document.getElementById('bs-chip-venta').classList.toggle('active', R.bsChip === 'venta');
  document.getElementById('bs-chip-secar').classList.toggle('active', R.bsChip === 'secar');
  document.getElementById('bs-litros').disabled = R.bsChip === 'venta';
}

async function guardarEdicion() {
  if (!R.editRegId) return;
  const litrosVal = document.getElementById('bs-litros').value;
  const litros = litrosVal !== '' ? parseFloat(litrosVal) : null;
  const estado = R.bsChip || (litros != null ? 'normal' : 'pendiente');

  const reg = await updateRegistro(R.editRegId, litros, estado);
  for (const tid in R.allRegistros) {
    const idx = R.allRegistros[tid].findIndex(r => r.id === R.editRegId);
    if (idx !== -1) { R.allRegistros[tid][idx] = reg; break; }
  }
  cerrarEdicion();
  _renderStats();
  _renderTandas();
  enqueueControlSync(R.controlId, R.tamboId);
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function _fmtL(n) {
  if (n == null) return '0';
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function _cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
