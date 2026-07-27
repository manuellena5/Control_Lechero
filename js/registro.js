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
  tags: [],                 // catálogo de tags (registros de la tabla tags)
  tagColor: {},             // { nombreLower → color }
  tagsSel: new Set(),       // tags seleccionados para la próxima carga
  editRegId: null,
  bsTags: new Set(),        // tags seleccionados en el bottom sheet de edición
  tandasExpandidas: new Set(), // IDs de tandas no-activas expandidas manualmente
  rpAlfanumerico: false,       // tipo de teclado para el input RP
  busquedaRP: '',              // filtro visual de búsqueda
  rpsDuplicados: new Set(),    // RPs con advertencia de duplicado activa
  ultimoRpWarning: null,       // RP que ya recibió advertencia (confirmar en segundo press)
};

let _pendingEliminarId     = null;
let _pendingEliminarRp     = '';
let _pendingEliminarTandaId = null;

// ─── Pantalla principal ───────────────────────────────────────────────────────

registerScreen('registro', async (el, params) => {
  R.el = el;
  R.tamboId = Number(params.tamboId);
  R.turno = 'mañana';
  R.tagsSel = new Set();
  await seedTagsIfEmpty();
  R.tags = await getTagsActivos();       // chips para asignar (solo habilitados)
  R.tagColor = await getTagColorMap();   // colores de todos (incluye deshabilitados)
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
  _ensureConfirmTandaSheet();
  _initTecladoWatcher();
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
          <input id="inp-litros" class="inp-litros" type="text" inputmode="decimal"
            placeholder="Litros" enterkeyhint="done" autocomplete="off"
            oninput="_filtrarLitros(this)">
          <button class="btn-agregar" onclick="agregarVaca()">+</button>
        </div>
        <div class="chips-row" id="chips-row">${_chipsHTML()}</div>
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
      if (r.litros != null) {
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
  const litros = regsAll.reduce((s, r) => r.litros != null ? s + r.litros : s, 0);
  const pend = regsAll.filter(r => r.litros == null && regTags(r).length === 0).length;

  // Tanda activa: mostrar más recientes primero
  const displayRegs = esActiva ? [...regs].reverse() : regs;

  const expandida = esActiva || R.tandasExpandidas.has(tanda.id);

  const estaVacia = regsAll.length === 0;

  const filasHTML = displayRegs.length === 0
    ? `<p class="text3 tanda-vacia-hint" style="padding:8px 16px;font-size:13px">Tanda vacía</p>`
    : displayRegs.map(r => _vacaRowHTML(r)).join('');

  // Botón de eliminar: solo en tandas sin vacas cargadas
  const btnEliminar = estaVacia ? _btnEliminarTandaHTML(tanda) : '';

  if (esActiva) {
    return `
      <div class="tanda-group tanda-group--active${estaVacia ? ' tanda-group--vacia' : ''}">
        <div class="tanda-header">
          <span class="tanda-title">Tanda ${tanda.numero}</span>
          <span class="badge badge--cargando">cargando acá</span>
          <span class="tanda-meta" id="tanda-meta-${tanda.id}">
            ${regsAll.length} vaca${regsAll.length !== 1 ? 's' : ''} · ${_fmtL(litros)} L
            ${pend > 0 ? `<span class="badge badge--pending"> ${pend} pend.</span>` : ''}
          </span>
          ${btnEliminar}
        </div>
        <div class="tanda-body" id="tanda-body-${tanda.id}">${filasHTML}</div>
      </div>
    `;
  }

  // Tandas anteriores: fila al pie para pasar a cargar en ellas
  const filaAgregar = `
    <button class="tanda-add-row" onclick="activarTanda(${tanda.id})">
      <span class="tanda-add-ico">+</span> Agregar vacas en esta tanda
    </button>`;

  return `
    <div class="tanda-group${estaVacia ? ' tanda-group--vacia' : ''}">
      <div class="tanda-header tanda-header--clickable" onclick="toggleTanda(${tanda.id})">
        <span class="tanda-title">Tanda ${tanda.numero}</span>
        <span class="tanda-meta" id="tanda-meta-${tanda.id}">
          ${regsAll.length} vaca${regsAll.length !== 1 ? 's' : ''} · ${_fmtL(litros)} L
          ${pend > 0 ? `<span class="badge badge--pending"> ${pend} pend.</span>` : ''}
          <svg class="tanda-chevron${expandida ? ' tanda-chevron--open' : ''}" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        ${btnEliminar}
      </div>
      <div class="tanda-body${expandida ? '' : ' tanda-body--collapsed'}" id="tanda-body-${tanda.id}">${filasHTML}${filaAgregar}</div>
    </div>
  `;
}

// Pasa a cargar vacas en una tanda anterior: la vuelve la tanda activa,
// la expande y deja el foco en el campo RP listo para tipear.
function activarTanda(tandaId) {
  R.tandaActivaId = tandaId;
  R.tandasExpandidas.add(tandaId);
  _renderTandas();
  const rp = document.getElementById('inp-rp');
  if (rp) {
    rp.focus();
    rp.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  const tanda = R.allTandas.find(t => t.id === tandaId);
  if (tanda) _showToast(`Cargando en Tanda ${tanda.numero}`);
}

// Botón ✕ para eliminar una tanda vacía. stopPropagation evita que en las
// tandas colapsables el toque además dispare el toggle del encabezado.
function _btnEliminarTandaHTML(tanda) {
  return `<button class="btn-del-tanda" id="btn-del-tanda-${tanda.id}"
      title="Eliminar tanda vacía" aria-label="Eliminar tanda ${tanda.numero}"
      onclick="event.stopPropagation();pedirConfirmEliminarTanda(${tanda.id},${tanda.numero})">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>`;
}

function _vacaRowHTML(reg) {
  const isDuplicate = R.rpsDuplicados.has(reg.rp);
  const tags = regTags(reg);
  const esPend = reg.litros == null && tags.length === 0;
  // Sin litros: "?" si está pendiente, "—" si tiene tags pero no se le cargó leche
  const litrosLabel = reg.litros != null ? _fmtL(reg.litros) : (esPend ? '?' : '—');
  const litrosCell = `<button class="litros-btn" onclick="abrirEdicion(${reg.id})">
         ${litrosLabel}
         <svg class="edit-icon" viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
           <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
         </svg>
       </button>`;

  const rowStyle = tags.length
    ? ` style="background:${_hexToRgba(R.tagColor[tags[0].toLowerCase()] || '#888888', 0.10)}"`
    : '';

  return `
    <div class="vaca-row${isDuplicate ? ' vaca-row--duplicado' : ''}"${rowStyle}>
      <span class="rp-display mono">${reg.rp}${isDuplicate ? ' <span class="badge badge--duplicado">×2</span>' : ''}</span>
      ${_tagBadges(tags)}
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

// ─── Render de chips de tags ──────────────────────────────────────────────────

function _tagChipStyle(color, active) {
  return active
    ? `background:${color};color:#fff;border:1px solid ${color};`
    : `background:${_hexToRgba(color, 0.14)};color:${color};border:1px solid ${_hexToRgba(color, 0.5)};`;
}

function _chipsHTML() {
  const chips = R.tags.map(t => {
    const active = R.tagsSel.has(t.nombre);
    return `<button class="chip" style="${_tagChipStyle(t.color, active)}"
      onclick="toggleChip('${t.nombre.replace(/'/g, "\\'")}')">${t.nombre}</button>`;
  }).join('');
  return chips + `<button class="chip chip--add" onclick="agregarTagRapido()" title="Nuevo tag">＋</button>`;
}

function _renderChips() {
  const row = document.getElementById('chips-row');
  if (row) row.innerHTML = _chipsHTML();
}

// Badges de tags para mostrar en una fila de vaca
function _tagBadges(tags) {
  if (!tags || !tags.length) return '<span></span>';
  return `<span class="tag-badges">` + tags.map(name => {
    const color = R.tagColor[name.toLowerCase()] || '#888888';
    return `<span class="badge" style="background:${color};color:#fff">${name}</span>`;
  }).join('') + `</span>`;
}

function toggleChip(name) {
  if (R.tagsSel.has(name)) R.tagsSel.delete(name);
  else R.tagsSel.add(name);
  _renderChips();
  const rp = document.getElementById('inp-rp');
  if (rp) rp.focus();
}

async function agregarTagRapido() {
  const nombre = prompt('Nombre del nuevo tag (ej: Tratamiento):');
  if (!nombre || !nombre.trim()) return;
  await addTag(nombre.trim());
  R.tags = await getTagsActivos();
  R.tagColor = await getTagColorMap();
  // Seleccionar automáticamente el tag recién creado
  const creado = R.tags.find(t => t.nombre.toLowerCase() === nombre.trim().toLowerCase());
  if (creado) R.tagsSel.add(creado.nombre);
  _renderChips();
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

  const litros = parseLitros(litrosInp.value);
  const tags = [...R.tagsSel];

  // Crear tanda si no hay ninguna para este turno
  if (!R.tandaActivaId) {
    const t = await addTanda(R.controlId, R.turno);
    R.allTandas.push(t);
    R.allRegistros[t.id] = [];
    R.tandaActivaId = t.id;
  }

  const tandaDestino = R.tandaActivaId;
  const reg = await addRegistro(tandaDestino, rp, litros, tags);
  R.allRegistros[tandaDestino].push(reg);
  if (!R.padron.find(v => v.rp === rp)) R.padron.push({ rp });

  rpInp.value = '';
  litrosInp.value = '';
  _hideAC();
  _renderStats();

  // Inserción incremental: agrega solo la fila nueva en lugar de reconstruir toda
  // la lista (clave con muchas vacas). Con búsqueda activa o si falta el nodo en
  // el DOM (tanda recién creada), cae al re-render completo.
  const body = document.getElementById('tanda-body-' + tandaDestino);
  if (!R.busquedaRP.trim() && body) {
    _insertarVacaRow(tandaDestino, reg, body);
  } else {
    _renderTandas();
  }

  enqueueControlSync(R.controlId, R.tamboId);
  rpInp.focus();
}

// Inserta la fila de una vaca al principio de la tanda activa (muestra las más
// recientes primero) y actualiza el encabezado de esa tanda, sin redibujar todo.
function _insertarVacaRow(tandaId, reg, body) {
  const hint = body.querySelector('.tanda-vacia-hint');
  if (hint) hint.remove();
  body.insertAdjacentHTML('afterbegin', _vacaRowHTML(reg));
  _actualizarMetaTanda(tandaId, true);
  const grupo = body.closest('.tanda-group');
  if (grupo) grupo.classList.remove('tanda-group--vacia');
  // Ya no está vacía: quitar el botón de eliminar tanda
  const btnDel = document.getElementById('btn-del-tanda-' + tandaId);
  if (btnDel) btnDel.remove();
}

function _actualizarMetaTanda(tandaId, esActiva) {
  const meta = document.getElementById('tanda-meta-' + tandaId);
  if (!meta) return;
  const regsAll = R.allRegistros[tandaId] || [];
  const litros = regsAll.reduce((s, r) => r.litros != null ? s + r.litros : s, 0);
  const pend = regsAll.filter(r => r.litros == null && regTags(r).length === 0).length;
  const pendBadge = pend > 0 ? ` <span class="badge badge--pending"> ${pend} pend.</span>` : '';
  const chevron = esActiva ? '' :
    `<svg class="tanda-chevron tanda-chevron--open" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  meta.innerHTML = `${regsAll.length} vaca${regsAll.length !== 1 ? 's' : ''} · ${_fmtL(litros)} L${pendBadge}${chevron}`;
}

async function nuevaTanda() {
  const t = await addTanda(R.controlId, R.turno);
  R.allTandas.push(t);
  R.allRegistros[t.id] = [];
  R.tandaActivaId = t.id;
  _renderTandas();
}

async function eliminarDeControl(regId) {
  // Guardar el RP antes de eliminar para poder limpiar estado de duplicado
  let rpEliminado = null;
  for (const regs of Object.values(R.allRegistros)) {
    const reg = regs.find(r => r.id === regId);
    if (reg) { rpEliminado = reg.rp; break; }
  }

  await deleteRegistro(regId);
  for (const tid in R.allRegistros) {
    R.allRegistros[tid] = R.allRegistros[tid].filter(r => r.id !== regId);
  }

  // Si ese RP ya no existe en ninguna tanda del turno, limpiar marca de duplicado
  if (rpEliminado) {
    const tandasDelTurno = R.allTandas.filter(t => t.turno === R.turno).map(t => t.id);
    const sigueExistiendo = tandasDelTurno.some(tid =>
      (R.allRegistros[tid] || []).some(r => r.rp === rpEliminado)
    );
    if (!sigueExistiendo) {
      R.rpsDuplicados.delete(rpEliminado);
      if (R.ultimoRpWarning === rpEliminado) R.ultimoRpWarning = null;
    }
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

// ─── Confirm eliminar tanda ──────────────────────────────────────────────────

function pedirConfirmEliminarTanda(tandaId, numero) {
  _pendingEliminarTandaId = tandaId;
  _ensureConfirmTandaSheet();
  const label = document.getElementById('confirm-tanda-label');
  if (label) label.textContent = numero;
  document.getElementById('confirm-tanda-overlay').classList.remove('hidden');
}

function _cerrarConfirmEliminarTanda() {
  const ov = document.getElementById('confirm-tanda-overlay');
  if (ov) ov.classList.add('hidden');
  _pendingEliminarTandaId = null;
}

async function _confirmarEliminarTanda() {
  if (!_pendingEliminarTandaId) return;
  const id = _pendingEliminarTandaId;
  _cerrarConfirmEliminarTanda();

  await deleteTanda(id);

  // Actualizar estado R
  R.allTandas = R.allTandas.filter(t => t.id !== id);
  delete R.allRegistros[id];

  // Si era la activa, reasignar
  if (R.tandaActivaId === id) {
    const del_turno = R.allTandas.filter(t => t.turno === R.turno);
    R.tandaActivaId = del_turno.length > 0 ? del_turno[del_turno.length - 1].id : null;
  }

  _renderStats();
  _renderTandas();
  enqueueControlSync(R.controlId, R.tamboId);
}

function _ensureConfirmTandaSheet() {
  if (document.getElementById('confirm-tanda-overlay')) return;
  const div = document.createElement('div');
  div.id = 'confirm-tanda-overlay';
  div.className = 'bs-overlay hidden';
  div.onclick = _cerrarConfirmEliminarTanda;
  div.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="bs-handle"></div>
      <div class="bs-header">
        <h3>Eliminar tanda</h3>
        <p class="text3">¿Eliminar la Tanda <strong id="confirm-tanda-label"></strong>? Está vacía.</p>
      </div>
      <div class="bs-actions">
        <button class="btn btn-secondary" onclick="_cerrarConfirmEliminarTanda()">Cancelar</button>
        <button class="btn btn-danger" onclick="_confirmarEliminarTanda()">Eliminar</button>
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
  if (litrosInp) litrosInp.focus();
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
      litrosInp.focus();
    }
  });
  litrosInp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); agregarVaca(); }
  });
}

// ─── Teclado en pantalla ─────────────────────────────────────────────────────

// En iOS el teclado NO achica la ventana, así que un elemento anclado al fondo
// (como el bottom sheet) queda tapado. visualViewport sí refleja el área que
// realmente ve el usuario: con eso calculamos la altura del teclado y la
// publicamos como --kb-height para que el CSS levante la hoja.
let _kbWatcherOn = false;

function _initTecladoWatcher() {
  if (_kbWatcherOn) return;
  const vv = window.visualViewport;
  if (!vv) return;                       // navegador viejo: queda como antes
  _kbWatcherOn = true;

  const aplicar = () => {
    const alto = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    // Umbral chico para ignorar barras del navegador que aparecen y desaparecen
    const kb = alto > 100 ? alto : 0;
    const raiz = document.documentElement;
    raiz.style.setProperty('--kb-height', kb + 'px');
    // Con el teclado abierto, la barra de inicio queda cubierta por el teclado
    raiz.style.setProperty('--sheet-safe-bottom', kb > 0 ? '0px' : '');
  };

  vv.addEventListener('resize', aplicar);
  vv.addEventListener('scroll', aplicar);
  aplicar();
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
        <input id="bs-litros" type="text" inputmode="decimal" autocomplete="off"
               enterkeyhint="done" class="bs-litros-input" placeholder="Litros"
               oninput="_filtrarLitros(this)"
               onkeydown="if(event.key==='Enter'){event.preventDefault();guardarEdicion();}">
        <div class="chips-row chips-row--centered" id="bs-chips"></div>
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
  R.bsTags = new Set(regTags(reg));

  document.getElementById('bs-title').textContent = 'RP ' + reg.rp;
  const tagsTxt = [...R.bsTags].join(', ');
  document.getElementById('bs-subtitle').textContent = tagsTxt || 'sin tags';
  const litrosInp = document.getElementById('bs-litros');
  litrosInp.value = reg.litros != null ? reg.litros : '';
  litrosInp.disabled = false;
  _renderBsChips();
  document.getElementById('bs-overlay').classList.remove('hidden');
  setTimeout(() => litrosInp.focus(), 100);
}

function _renderBsChips() {
  const cont = document.getElementById('bs-chips');
  if (!cont) return;
  // Tags habilitados + los que la vaca ya tenga aunque estén deshabilitados
  const lista = R.tags.map(t => ({ nombre: t.nombre, color: t.color }));
  const nombresActivos = new Set(R.tags.map(t => t.nombre));
  for (const name of R.bsTags) {
    if (!nombresActivos.has(name)) {
      lista.push({ nombre: name, color: R.tagColor[name.toLowerCase()] || '#888888' });
    }
  }
  cont.innerHTML = lista.map(t => {
    const active = R.bsTags.has(t.nombre);
    return `<button class="chip" style="${_tagChipStyle(t.color, active)}"
      onclick="bsToggleChip('${t.nombre.replace(/'/g, "\\'")}')">${t.nombre}</button>`;
  }).join('');
}

function cerrarEdicion() {
  const ov = document.getElementById('bs-overlay');
  if (ov) ov.classList.add('hidden');
  R.editRegId = null;
}

function bsToggleChip(name) {
  if (R.bsTags.has(name)) R.bsTags.delete(name);
  else R.bsTags.add(name);
  _renderBsChips();
  const sub = document.getElementById('bs-subtitle');
  if (sub) sub.textContent = [...R.bsTags].join(', ') || 'sin tags';
}

async function guardarEdicion() {
  if (!R.editRegId) return;
  const litros = parseLitros(document.getElementById('bs-litros').value);
  const tags = [...R.bsTags];

  const reg = await updateRegistro(R.editRegId, litros, tags);
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

// Los campos de litros son type="text" (para que iOS no descarte la coma del
// teclado decimal). Este filtro deja solo dígitos y un separador decimal.
function _filtrarLitros(inp) {
  let v = inp.value.replace(/[^0-9.,]/g, '');
  // Un solo separador: conservar el primero
  const i = v.search(/[.,]/);
  if (i !== -1) {
    v = v.slice(0, i + 1) + v.slice(i + 1).replace(/[.,]/g, '');
  }
  if (v !== inp.value) inp.value = v;
}

function _cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
