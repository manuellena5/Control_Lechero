/* planilla.js — Planilla final e histórica del control */

let _pd = {}; // datos en memoria para los botones de acción

// ─── Screen ───────────────────────────────────────────────────────────────────

registerScreen('planilla', async (el, params) => {
  const tamboId  = Number(params.tamboId);
  const controlId = Number(params.controlId);

  const [tambo, vet, control] = await Promise.all([
    getTambo(tamboId),
    getVeterinario(),
    db.controles.get(controlId),
  ]);

  if (!tambo || !control) {
    el.innerHTML = '<div class="page-body"><p class="text2">Control no encontrado.</p></div>';
    return;
  }

  await seedTagsIfEmpty();
  const tagColor = await getTagColorMap();
  const tandas = await getTandasDeControl(controlId);
  const vacas  = await _buildVacaData(tandas);
  const stats  = _calcStats(vacas);
  _pd = { tambo, vet, control, vacas, stats, tamboId, controlId, tagColor };

  el.innerHTML = _planillaHTML();
});

// ─── Construcción de datos ────────────────────────────────────────────────────

async function _buildVacaData(tandas) {
  const map = new Map(); // rp → entry

  for (const tanda of tandas) {
    const regs = await getRegistrosDeTanda(tanda.id);
    for (const reg of regs) {
      if (!map.has(reg.rp)) {
        map.set(reg.rp, {
          rp: reg.rp,
          litrosMañana: 0, hasMañana: false,
          litrosTarde:  0, hasTarde: false,
          litrosExtra: {}, hasExtra: {},
          tags: [],
        });
      }
      const v = map.get(reg.rp);

      // Unir los tags de todas las tandas de esta vaca (sin duplicar)
      for (const name of regTags(reg)) {
        if (!v.tags.includes(name)) v.tags.push(name);
      }

      const l = reg.litros || 0;
      if (tanda.turno === 'mañana') {
        v.hasMañana = true;
        v.litrosMañana += l;
      } else if (tanda.turno === 'tarde') {
        v.hasTarde = true;
        v.litrosTarde += l;
      } else {
        v.hasExtra[tanda.turno] = true;
        v.litrosExtra[tanda.turno] = (v.litrosExtra[tanda.turno] || 0) + l;
      }
    }
  }

  // Ordenar por RP numérico
  return [...map.values()].sort((a, b) => parseInt(a.rp) - parseInt(b.rp) || a.rp.localeCompare(b.rp));
}

function _calcStats(vacas) {
  // Los tags ya no afectan el total: cuenta cualquier vaca con litros.
  const totalMañana = vacas.reduce((s, v) => s + v.litrosMañana, 0);
  const totalTarde  = vacas.reduce((s, v) => s + v.litrosTarde, 0);
  const totalDia    = totalMañana + totalTarde;
  const conLitros   = vacas.filter(v => v.litrosMañana + v.litrosTarde > 0).length;
  // Pendiente = sin litros y sin ningún tag
  const cantPendiente = vacas.filter(v => !v.hasMañana && !v.hasTarde && v.tags.length === 0).length;
  // Conteo por tag (para el resumen)
  const tagCounts = {};
  for (const v of vacas) for (const t of v.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
  return {
    totalMañana, totalTarde, totalDia,
    promedio:  conLitros > 0 ? totalDia / conLitros : 0,
    cantVacas: vacas.length,
    cantPendiente,
    tagCounts,
  };
}

// Chips de tags para la planilla en pantalla
function _plTagChips(tags) {
  if (!tags || !tags.length) return '';
  const map = _pd.tagColor || {};
  return ' ' + tags.map(name => {
    const color = map[name.toLowerCase()] || '#888888';
    return `<span class="badge" style="background:${color};color:#fff">${name}</span>`;
  }).join(' ');
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function _planillaHTML() {
  const { tambo, vet, control, vacas, stats } = _pd;

  const filas = vacas.map((v, i) => {
    const esPend = !v.hasMañana && !v.hasTarde && v.tags.length === 0;
    const sinLitros = !v.hasMañana && !v.hasTarde;
    const mCell = esPend ? '<span class="pend-cell">?</span>' : (v.hasMañana ? _fmtLp(v.litrosMañana) : '—');
    const tCell = esPend ? '<span class="pend-cell">?</span>' : (v.hasTarde  ? _fmtLp(v.litrosTarde)  : '—');
    const total  = v.litrosMañana + v.litrosTarde;
    const totCell = esPend ? '?' : (sinLitros ? '—' : _fmtLp(total));
    const rowStyle = v.tags.length
      ? ` style="background:${_hexToRgba((_pd.tagColor || {})[v.tags[0].toLowerCase()] || '#888888', 0.10)}"`
      : '';
    return `<tr${rowStyle}>
      <td>${i + 1}</td>
      <td class="rp-cell"><span class="mono">${v.rp}</span>${_plTagChips(v.tags)}</td>
      <td>${mCell}</td>
      <td>${tCell}</td>
      <td><strong>${totCell}</strong></td>
    </tr>`;
  }).join('');

  const vetLinea = vet ? `${vet.nombre}${vet.matricula ? ' — Mat. ' + vet.matricula : ''}${vet.telefono ? ' — Tel. ' + vet.telefono : ''}` : '';

  return `
    <div class="pl-wrap">

      <!-- Cabecera de navegación (no se imprime) -->
      <div class="page-header no-print">
        <button class="btn btn-ghost btn-icon" onclick="navigateUp('/tambos/${_pd.tamboId}')">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2>Planilla</h2>
        <div></div>
      </div>

      <div class="pl-body">

        <!-- Encabezado visible solo en impresión -->
        <div class="print-header print-only">
          <h2>Control Lechero — ${tambo.nombre}</h2>
          <p>${vetLinea}</p>
        </div>

        <!-- Card datos del control -->
        <div class="card card--info">
          <div class="info-row"><span class="text3">Establecimiento</span><span><strong>${tambo.nombre}</strong></span></div>
          <div class="info-row"><span class="text3">Propietario</span><span>${tambo.propietario}</span></div>
          <div class="info-row"><span class="text3">Fecha</span><span>${formatFecha(control.fecha)}</span></div>
          ${vet ? `<div class="info-row"><span class="text3">Veterinario</span><span>${vet.nombre}</span></div>` : ''}
          ${vet?.matricula ? `<div class="info-row"><span class="text3">Matrícula</span><span>${vet.matricula}</span></div>` : ''}
          ${vet?.telefono ? `<div class="info-row"><span class="text3">Teléfono</span><span>${vet.telefono}</span></div>` : ''}
        </div>

        <!-- Card resumen -->
        <div class="card">
          <div class="resumen-grid">
            <div class="resumen-item">
              <span class="resumen-val">${stats.cantVacas}</span>
              <span class="resumen-lbl">Vacas totales</span>
            </div>
            <div class="resumen-item resumen-item--mañana">
              <span class="resumen-val">${_fmtLp(stats.totalMañana)}</span>
              <span class="resumen-lbl">Mañana (L)</span>
            </div>
            <div class="resumen-item resumen-item--tarde">
              <span class="resumen-val">${_fmtLp(stats.totalTarde)}</span>
              <span class="resumen-lbl">Tarde (L)</span>
            </div>
            <div class="resumen-item resumen-item--dia">
              <span class="resumen-val">${_fmtLp(stats.totalDia)}</span>
              <span class="resumen-lbl">Total día</span>
            </div>
            <div class="resumen-item">
              <span class="resumen-val">${stats.promedio > 0 ? stats.promedio.toFixed(1) : '—'}</span>
              <span class="resumen-lbl">Prom. L/vaca</span>
            </div>
            ${Object.entries(stats.tagCounts).map(([name, count]) => {
              const color = (_pd.tagColor || {})[name.toLowerCase()] || '#888888';
              return `<div class="resumen-item">
              <span class="resumen-val" style="color:${color}">${count}</span>
              <span class="resumen-lbl">${name}</span>
            </div>`;
            }).join('')}
            ${stats.cantPendiente > 0 ? `
            <div class="resumen-item">
              <span class="resumen-val" style="color:var(--pending)">${stats.cantPendiente}</span>
              <span class="resumen-lbl">Pendientes</span>
            </div>` : ''}
          </div>
        </div>

        <!-- Tabla planilla -->
        <div class="pl-table-wrap">
          <table class="pl-table">
            <thead>
              <tr>
                <th>#</th>
                <th>RP</th>
                <th>Mañana</th>
                <th>Tarde</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="2">TOTAL</td>
                <td>${_fmtLp(stats.totalMañana)}</td>
                <td>${_fmtLp(stats.totalTarde)}</td>
                <td><strong>${_fmtLp(stats.totalDia)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Firma en impresión -->
        <div class="print-firma print-only">
          <div class="firma-linea"></div>
          <p>${vetLinea}</p>
        </div>

        <!-- Botones de acción (no se imprimen) -->
        <div class="pl-actions no-print">
          <button class="btn btn-primary btn-full btn-lg" onclick="compartirWhatsApp()">
            📱 Compartir por WhatsApp
          </button>
          <button class="btn btn-secondary btn-full" id="btn-pdf-share" onclick="descargarCompartirPDF()">
            📤 Descargar / Compartir PDF
          </button>
          <button class="btn btn-secondary btn-full" id="btn-pdf" onclick="generarPDF()">
            🖨 Imprimir
          </button>
          <button class="btn btn-secondary btn-full" onclick="sincronizarSheets()">
            ☁️ Sincronizar con Sheets
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─── Acciones ─────────────────────────────────────────────────────────────────

async function compartirWhatsApp() {
  // Si ya hay imágenes generadas esperando (ver _mostrarBotonCompartirListo),
  // este toque es el que abre el menú de compartir.
  if (_pd.pendingShareFiles) { await enviarImagenesListas(); return; }

  // Intentar compartir como imagen si el browser lo soporta
  const testFile = new File([''], 'test.png', { type: 'image/png' });
  const puedeImagen = typeof html2canvas !== 'undefined' &&
    typeof navigator.share === 'function' &&
    navigator.canShare?.({ files: [testFile] });

  if (puedeImagen) {
    await _compartirImagen();
  } else {
    _compartirTexto();
  }
}

// Las imágenes ya están listas; el botón pasa a pedir un toque para compartir.
// Esto satisface la exigencia de iOS de que share() nazca de un gesto reciente.
function _mostrarBotonCompartirListo(cant) {
  const btn = document.querySelector('.pl-actions button');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = cant > 1
    ? `📤 Enviar ${cant} hojas por WhatsApp`
    : '📤 Enviar por WhatsApp';
  btn.classList.add('btn-share-listo');
}

async function enviarImagenesListas() {
  const files = _pd.pendingShareFiles;
  if (!files) return;
  const btn = document.querySelector('.pl-actions button');
  try {
    await navigator.share({ files, title: `Control Lechero — ${_pd.tambo.nombre}` });
    _resetBotonCompartir();
  } catch (err) {
    // AbortError = el usuario cerró el menú: dejamos el botón listo para reintentar
    if (err.name !== 'AbortError') {
      _resetBotonCompartir();
      _compartirTexto();
    }
  }
}

function _resetBotonCompartir() {
  _pd.pendingShareFiles = null;
  const btn = document.querySelector('.pl-actions button');
  if (btn) {
    btn.textContent = '📱 Compartir por WhatsApp';
    btn.disabled = false;
    btn.classList.remove('btn-share-listo');
  }
}

async function _compartirImagen() {
  const { tambo, vet, control, vacas, stats } = _pd;
  const COLS      = 2;
  const FILAS_COL = 40;
  const POR_PAG   = COLS * FILAS_COL;
  const totalPags = Math.max(1, Math.ceil(vacas.length / POR_PAG));

  // Escala adaptativa: en controles grandes (varias hojas) bajamos a 1.5 para
  // no saturar la memoria del celular. Sigue siendo nítido para WhatsApp.
  const scale = totalPags >= 3 ? 1.5 : 2;

  const btn = document.querySelector('.pl-actions button');
  const setBtn = txt => { if (btn) btn.textContent = txt; };
  if (btn) btn.disabled = true;
  setBtn(totalPags > 1 ? `⏳ Generando hoja 1 de ${totalPags}…` : '⏳ Generando imagen…');

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
  document.body.appendChild(container);

  const t0 = Date.now();
  const files = [];

  try {
    for (let p = 0; p < totalPags; p++) {
      if (totalPags > 1) setBtn(`⏳ Generando hoja ${p + 1} de ${totalPags}…`);
      // Ceder un frame: deja que el navegador pinte el progreso y recicle memoria
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

      const startIdx  = p * POR_PAG;
      const pageVacas = vacas.slice(startIdx, startIdx + POR_PAG);
      container.innerHTML = _buildPagHTML(tambo, vet, control, pageVacas, startIdx, p + 1, totalPags, stats);

      let canvas = await html2canvas(container.firstElementChild, {
        backgroundColor: '#ffffff',
        scale,
        useCORS: true,
        logging: false,
      });

      const file = await new Promise(res => {
        canvas.toBlob(blob => {
          const suf  = totalPags > 1 ? `-hoja${p + 1}` : '';
          const name = `control-${tambo.nombre}-${control.fecha}${suf}.png`.replace(/\s+/g, '-');
          res(new File([blob], name, { type: 'image/png' }));
        }, 'image/png');
      });
      files.push(file);

      // Liberar el canvas y el DOM antes de la próxima hoja
      canvas.width = 0; canvas.height = 0; canvas = null;
      container.innerHTML = '';
    }

    // iOS exige que navigator.share() se dispare dentro del gesto del usuario.
    // Generar las imágenes puede tardar varios segundos y ese permiso vence, así
    // que si tardamos mucho pedimos un segundo toque en vez de fallar.
    const tardo = Date.now() - t0;
    if (tardo > 1500) {
      _pd.pendingShareFiles = files;
      _mostrarBotonCompartirListo(files.length);
      return;
    }

    setBtn('⏳ Abriendo para compartir…');
    await navigator.share({ files, title: `Control Lechero — ${tambo.nombre}` });

  } catch (err) {
    if (err.name === 'AbortError') {
      // El usuario cerró el menú de compartir: no hacer nada
    } else if (err.name === 'NotAllowedError' && files.length) {
      // Permiso de gesto vencido → ofrecer el segundo toque
      _pd.pendingShareFiles = files;
      _mostrarBotonCompartirListo(files.length);
      return;
    } else {
      _compartirTexto();
    }
  } finally {
    if (container.parentNode) document.body.removeChild(container);
    if (btn && !_pd.pendingShareFiles) { btn.textContent = '📱 Compartir por WhatsApp'; btn.disabled = false; }
  }
}

// ─── Construcción de la página imagen ────────────────────────────────────────

function _buildPagHTML(tambo, vet, control, pageVacas, startIdx, pagNum, totalPags, stats) {
  const FILAS_COL = 40;
  const colA = pageVacas.slice(0, FILAS_COL);
  const colB = pageVacas.slice(FILAS_COL);
  const filas = Math.max(colA.length, colB.length);
  const isLast = pagNum === totalPags;

  const [y, m, d] = control.fecha.split('-');
  const vetLinea  = vet ? `${vet.nombre}${vet.matricula ? '   Mat. ' + vet.matricula : ''}${vet.telefono ? '   Tel. ' + vet.telefono : ''}` : '';

  const TH = 'padding:4px 3px;background:#2D6A4F;color:#fff;font-weight:700;font-size:10.5px;text-align:center;border:1px solid #1a5c3a;';
  const TD = 'padding:3px 4px;font-size:11px;border:1px solid #ddd;text-align:center;';
  const SEP = 'width:8px;background:#f0f0f0;border:none;';

  let rows = '';
  for (let i = 0; i < filas; i++) {
    const a = colA[i], b = colB[i];
    rows += `<tr>
      ${a ? _imgCeldas(a, startIdx + i + 1, TD) : `<td colspan="5" style="${TD}"></td>`}
      <td style="${SEP}"></td>
      ${b ? _imgCeldas(b, startIdx + FILAS_COL + i + 1, TD) : `<td colspan="5" style="${TD}"></td>`}
    </tr>`;
  }

  const totalRow = isLast ? `<tr>
    <td colspan="2" style="${TD}background:#D8EFDF;font-weight:700;text-align:right;">TOTAL</td>
    <td style="${TD}background:#D8EFDF;font-weight:700;">${_fmtLp(stats.totalMañana)}</td>
    <td style="${TD}background:#D8EFDF;font-weight:700;">${_fmtLp(stats.totalTarde)}</td>
    <td style="${TD}background:#D8EFDF;font-weight:700;">${_fmtLp(stats.totalDia)}</td>
    <td style="${SEP}"></td>
    <td colspan="5" style="${TD}background:#D8EFDF;font-size:10px;color:#2D6A4F;">
      ${stats.cantVacas} vacas · prom. ${stats.promedio > 0 ? stats.promedio.toFixed(1) : '—'} L/vaca${_tagCountsText(stats)}
    </td>
  </tr>` : '';

  return `
  <div style="width:760px;padding:14px 16px;background:#fff;font-family:Arial,sans-serif;box-sizing:border-box;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;padding-bottom:8px;border-bottom:2.5px solid #2D6A4F;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#1A1A18;letter-spacing:.03em;">PLANILLA CONTROL LECHERO</div>
        <div style="font-size:11px;color:#6B6560;margin-top:2px;">${vetLinea}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#4A4A48;line-height:1.6;">
        <div><strong>${tambo.nombre}</strong></div>
        <div>Propietario: ${tambo.propietario}</div>
        <div>Fecha: ${d}/${m}/${y}${totalPags > 1 ? `   ·   Hoja ${pagNum} / ${totalPags}` : ''}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="${TH}width:26px;">#</th>
        <th style="${TH}width:52px;">RP</th>
        <th style="${TH}width:68px;">Lts. Mañana</th>
        <th style="${TH}width:64px;">Lts. Tarde</th>
        <th style="${TH}width:58px;">Total</th>
        <th style="${SEP}"></th>
        <th style="${TH}width:26px;">#</th>
        <th style="${TH}width:52px;">RP</th>
        <th style="${TH}width:68px;">Lts. Mañana</th>
        <th style="${TH}width:64px;">Lts. Tarde</th>
        <th style="${TH}width:58px;">Total</th>
      </tr></thead>
      <tbody>${rows}${totalRow}</tbody>
    </table>
  </div>`;
}

function _tagCountsText(stats) {
  return Object.entries(stats.tagCounts || {})
    .map(([n, c]) => ` · ${n.toLowerCase()}: ${c}`).join('');
}

function _imgCeldas(v, idx, TD) {
  const tags = v.tags || [];
  const color = tags.length ? ((_pd.tagColor || {})[tags[0].toLowerCase()] || '#888888') : null;
  const bg = tags.length ? `background:${_hexToRgba(color, 0.16)};`
           : idx % 2 === 0 ? 'background:#fafaf8;'
           : '';
  const td = TD + bg;
  const sinLitros = !v.hasMañana && !v.hasTarde;
  const esPend = sinLitros && tags.length === 0;
  const m = esPend ? '?' : (v.hasMañana ? _fmtLp(v.litrosMañana) : '—');
  const t = esPend ? '?' : (v.hasTarde  ? _fmtLp(v.litrosTarde)  : '—');
  const tot = esPend ? '?' : (sinLitros ? '—' : _fmtLp(v.litrosMañana + v.litrosTarde));
  const tagTxt = tags.length
    ? `<div style="font-size:8px;line-height:1.15;color:${color};font-weight:700;">${tags.join(', ')}</div>`
    : '';
  return `<td style="${td}">${idx}</td>
          <td style="${td}">${v.rp}${tagTxt}</td>
          <td style="${td}">${m}</td>
          <td style="${td}">${t}</td>
          <td style="${TD + bg}font-weight:600;">${tot}</td>`;
}

function _compartirTexto() {
  const { tambo, vet, control, stats } = _pd;
  const lineas = [
    `*Control lechero — ${tambo.nombre}*`,
    `📅 ${formatFecha(control.fecha)}`,
    ``,
    `🐄 Vacas: ${stats.cantVacas}`,
    `🌅 Mañana: ${_fmtLp(stats.totalMañana)} L`,
    `🌇 Tarde: ${_fmtLp(stats.totalTarde)} L`,
    `📊 *Total día: ${_fmtLp(stats.totalDia)} L*`,
    `📈 Promedio: ${stats.promedio > 0 ? stats.promedio.toFixed(1) : '—'} L/vaca`,
  ];
  for (const [name, count] of Object.entries(stats.tagCounts || {})) {
    lineas.push(`🏷️ ${name}: ${count}`);
  }
  if (stats.cantPendiente > 0) lineas.push(`⏳ Pendientes: ${stats.cantPendiente}`);
  if (vet) lineas.push(``, `_${vet.nombre}${vet.matricula ? ' — Mat. ' + vet.matricula : ''}${vet.telefono ? ' — Tel. ' + vet.telefono : ''}_`);

  const texto = encodeURIComponent(lineas.join('\n'));
  const tel   = tambo.telefono ? tambo.telefono.replace(/\D/g, '') : '';
  window.open(`https://wa.me/${tel}?text=${texto}`, '_blank');
}

// ─── PDF como archivo (descargar / compartir) ────────────────────────────────

// jsPDF pesa ~400 KB: se descarga recién cuando se usa por primera vez y el
// Service Worker lo deja cacheado para los usos siguientes (también offline).
function _cargarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './js/jspdf.umd.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar el generador de PDF.'));
    document.head.appendChild(s);
  });
}

async function descargarCompartirPDF() {
  const { tambo, vet, control, vacas, stats } = _pd;
  const FILAS_COL = 40;
  const POR_PAG   = FILAS_COL * 2;
  const totalPags = Math.max(1, Math.ceil(vacas.length / POR_PAG));

  const btn = document.getElementById('btn-pdf-share');
  const setBtn = txt => { if (btn) btn.textContent = txt; };
  if (btn) btn.disabled = true;

  // Si ya se generó y quedó esperando, este toque comparte (igual que las imágenes)
  if (_pd.pendingPdfFile) { await _enviarPDF(); return; }

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
  document.body.appendChild(container);

  const t0 = Date.now();
  try {
    setBtn('⏳ Preparando…');
    await _cargarJsPDF();

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const MARGEN = 8;
    const anchoUtil = 210 - MARGEN * 2;

    for (let p = 0; p < totalPags; p++) {
      setBtn(totalPags > 1 ? `⏳ Hoja ${p + 1} de ${totalPags}…` : '⏳ Generando PDF…');
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

      const startIdx  = p * POR_PAG;
      const pageVacas = vacas.slice(startIdx, startIdx + POR_PAG);
      container.innerHTML = _buildPagHTML(tambo, vet, control, pageVacas, startIdx, p + 1, totalPags, stats);

      let canvas = await html2canvas(container.firstElementChild, {
        backgroundColor: '#ffffff',
        scale: totalPags >= 3 ? 1.5 : 2,
        useCORS: true,
        logging: false,
      });

      // JPEG con buena calidad: mantiene el archivo liviano para WhatsApp
      const img = canvas.toDataURL('image/jpeg', 0.92);
      const alto = (canvas.height / canvas.width) * anchoUtil;

      if (p > 0) pdf.addPage();
      pdf.addImage(img, 'JPEG', MARGEN, MARGEN, anchoUtil, alto);

      canvas.width = 0; canvas.height = 0; canvas = null;
      container.innerHTML = '';
    }

    const nombre = `control-${tambo.nombre}-${control.fecha}.pdf`.replace(/\s+/g, '-');
    const blob   = pdf.output('blob');
    _pd.pendingPdfFile = new File([blob], nombre, { type: 'application/pdf' });

    // Igual que con las imágenes: si tardó, iOS ya invalidó el permiso de
    // compartir y hace falta un segundo toque del usuario.
    if (Date.now() - t0 > 1500) {
      if (btn) { btn.disabled = false; btn.classList.add('btn-share-listo'); }
      setBtn('📤 Enviar PDF');
      return;
    }
    await _enviarPDF();

  } catch (err) {
    _pd.pendingPdfFile = null;
    _showToast('No se pudo generar el PDF: ' + err.message);
    if (btn) { btn.textContent = '📤 Descargar / Compartir PDF'; btn.disabled = false; }
  } finally {
    if (container.parentNode) document.body.removeChild(container);
  }
}

async function _enviarPDF() {
  const file = _pd.pendingPdfFile;
  if (!file) return;
  const btn = document.getElementById('btn-pdf-share');

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Control Lechero — ${_pd.tambo.nombre}` });
      _resetBotonPDF();
      return;
    }
    // Sin menú de compartir (escritorio): descarga directa
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    _resetBotonPDF();
  } catch (err) {
    // El usuario cerró el menú: dejamos el PDF listo para reintentar
    if (err.name !== 'AbortError') {
      _showToast('No se pudo compartir: ' + err.message);
      _resetBotonPDF();
    } else if (btn) {
      btn.disabled = false;
    }
  }
}

function _resetBotonPDF() {
  _pd.pendingPdfFile = null;
  const btn = document.getElementById('btn-pdf-share');
  if (btn) {
    btn.textContent = '📤 Descargar / Compartir PDF';
    btn.disabled = false;
    btn.classList.remove('btn-share-listo');
  }
}

function generarPDF() {
  const { tambo, vet, control, vacas, stats } = _pd;
  const FILAS_COL = 40;
  const POR_PAG   = FILAS_COL * 2;
  const totalPags = Math.max(1, Math.ceil(vacas.length / POR_PAG));

  // Construir páginas de forma sincrónica (los datos ya están en _pd)
  let pagesHtml = '';
  for (let p = 0; p < totalPags; p++) {
    const startIdx  = p * POR_PAG;
    const pageVacas = vacas.slice(startIdx, startIdx + POR_PAG);
    pagesHtml += _buildPrintPage(tambo, vet, control, pageVacas, startIdx, p + 1, totalPags, stats);
  }

  const [y, m, d] = control.fecha.split('-');
  const docTitle  = `Control Lechero — ${tambo.nombre} — ${d}/${m}/${y}`;

  // Solo en iPhone/iPad instalado en la pantalla de inicio: ahí la ventana
  // nueva se abre SIN barra de navegación y el usuario queda sin forma de
  // volver, así que imprimimos desde la misma pantalla. En Android y en la
  // computadora la ventana nueva funciona bien y tiene su botón "Volver".
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
             || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = window.matchMedia?.('(display-mode: standalone)').matches
                 || navigator.standalone === true;
  if (esIOS && instalada) {
    _imprimirEnPagina(pagesHtml);
    return;
  }

  // Abrir nueva ventana de forma sincrónica (gesto de usuario activo).
  // Esto evita todos los problemas de timing de @media print en mobile.
  const printWin = window.open('', '_blank');

  if (printWin) {
    printWin.document.open();
    printWin.document.write(_buildPrintDoc(docTitle, pagesHtml));
    printWin.document.close();
    return;
  }

  // Fallback si el browser bloquea popups: descargar el HTML para imprimir desde el explorador
  const blob = new Blob([_buildPrintDoc(docTitle, pagesHtml)], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `control-${tambo.nombre}-${control.fecha}.html`.replace(/\s+/g, '-');
  a.click();
  URL.revokeObjectURL(url);
}

// Imprime sin abrir ventana nueva: monta las hojas en un contenedor oculto que
// las reglas @media print de app.css muestran (ocultando el resto de la app).
function _imprimirEnPagina(pagesHtml) {
  document.getElementById('print-layout')?.remove();

  const cont = document.createElement('div');
  cont.id = 'print-layout';
  cont.innerHTML = pagesHtml;
  document.body.appendChild(cont);

  const limpiar = () => {
    document.getElementById('print-layout')?.remove();
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  // Red de seguridad: si el navegador no dispara afterprint, limpiar igual
  setTimeout(limpiar, 60000);

  // Dejar que el navegador pinte el contenedor antes de abrir el diálogo
  requestAnimationFrame(() => setTimeout(() => window.print(), 100));
}

function _buildPrintDoc(title, pagesHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
<title>${title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; }
  .print-pag { display: flex; justify-content: center; page-break-after: always; break-after: page; }
  .print-pag:last-child { page-break-after: auto; break-after: auto; }

  /* Barra propia: en iOS con la app instalada esta ventana se abre SIN barra
     de navegación, así que sin estos botones el usuario queda sin salida. */
  .pdf-bar {
    position: sticky; top: 0; z-index: 10;
    display: flex; gap: 10px; align-items: center;
    padding: calc(10px + env(safe-area-inset-top)) 12px 10px;
    background: #2D6A4F; color: #fff;
  }
  .pdf-bar button {
    font-family: inherit; font-size: 14px; font-weight: 600;
    padding: 10px 14px; min-height: 42px;
    border: none; border-radius: 8px; cursor: pointer;
    background: rgba(255,255,255,.16); color: #fff;
  }
  .pdf-bar .pdf-print { background: #fff; color: #2D6A4F; margin-left: auto; }
  .pdf-hint {
    display: none; padding: 10px 14px; margin: 10px 12px 0;
    background: #FFF8DC; color: #6B5A0A; font-size: 13px; border-radius: 8px;
  }

  @media screen {
    .print-pag { overflow-x: auto; margin-bottom: 24px; }
    .pdf-body { padding: 12px; }
  }
  @media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { padding: 0; }
    .pdf-bar, .pdf-hint { display: none !important; }
    .pdf-body { padding: 0; }
    @page { size: A4 portrait; margin: 10mm; }
  }
</style>
</head>
<body>
<div class="pdf-bar">
  <button type="button" onclick="volver()">← Volver</button>
  <button type="button" class="pdf-print" onclick="window.print()">🖨 Imprimir / PDF</button>
</div>
<div class="pdf-hint" id="hint">
  Para volver a la app, cerrá esta pestaña desde el navegador.
</div>
<div class="pdf-body">
${pagesHtml}
</div>
<script>
  function volver() {
    window.close();
    // Si el navegador no permite cerrarla (pasa en iOS), intentamos volver
    // atrás y, si tampoco se puede, mostramos la ayuda.
    setTimeout(function () {
      if (!window.closed) {
        if (history.length > 1) { history.back(); return; }
        document.getElementById('hint').style.display = 'block';
      }
    }, 300);
  }
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 400);
  });
<\/script>
</body>
</html>`;
}

function _buildPrintPage(tambo, vet, control, pageVacas, startIdx, pagNum, totalPags, stats) {
  const FILAS_COL = 40;
  const colA   = pageVacas.slice(0, FILAS_COL);
  const colB   = pageVacas.slice(FILAS_COL);
  const filas  = Math.max(colA.length, colB.length);
  const isLast = pagNum === totalPags;

  const [y, m, d] = control.fecha.split('-');
  const vetLinea  = vet ? `${vet.nombre}${vet.matricula ? ' — Mat. ' + vet.matricula : ''}${vet.telefono ? ' — Tel. ' + vet.telefono : ''}` : '';

  const TH  = 'padding:2pt 3pt;background:#2D6A4F;color:#fff;font-weight:700;font-size:8pt;text-align:center;border:0.5pt solid #1a5c3a;';
  const TD  = 'padding:2pt 3pt;font-size:8.5pt;border:0.5pt solid #ddd;text-align:center;';
  const SEP = 'width:4mm;background:#f0f0f0;border:none;';

  let rows = '';
  for (let i = 0; i < filas; i++) {
    const a = colA[i], b = colB[i];
    rows += `<tr>
      ${a ? _printCeldas(a, startIdx + i + 1, TD) : `<td colspan="5" style="${TD}"></td>`}
      <td style="${SEP}"></td>
      ${b ? _printCeldas(b, startIdx + FILAS_COL + i + 1, TD) : `<td colspan="5" style="${TD}"></td>`}
    </tr>`;
  }

  const totalRow = isLast ? `<tr>
    <td colspan="2" style="${TD}background:#D8EFDF;font-weight:700;text-align:right;">TOTAL</td>
    <td style="${TD}background:#D8EFDF;font-weight:700;">${_fmtLp(stats.totalMañana)}</td>
    <td style="${TD}background:#D8EFDF;font-weight:700;">${_fmtLp(stats.totalTarde)}</td>
    <td style="${TD}background:#D8EFDF;font-weight:700;">${_fmtLp(stats.totalDia)}</td>
    <td style="${SEP}"></td>
    <td colspan="4" style="${TD}background:#D8EFDF;font-size:7.5pt;color:#2D6A4F;">
      ${stats.cantVacas} vacas · prom. ${stats.promedio > 0 ? stats.promedio.toFixed(1) : '—'} L/vaca${_tagCountsText(stats)}
    </td>
    <td style="${TD}background:#D8EFDF;"></td>
  </tr>` : '';

  const firmaRow = isLast && vetLinea ? `
    <div style="margin-top:20mm;border-top:0.5pt solid #000;width:70mm;padding-top:3pt;font-size:8pt;color:#555;">
      ${vetLinea}
    </div>` : '';

  return `
  <div class="print-pag">
    <div style="font-family:Arial,sans-serif;width:190mm;box-sizing:border-box;padding:8mm 0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6pt;padding-bottom:5pt;border-bottom:1.5pt solid #2D6A4F;">
        <div>
          <div style="font-size:11pt;font-weight:700;color:#1A1A18;">PLANILLA CONTROL LECHERO</div>
          <div style="font-size:8pt;color:#6B6560;margin-top:2pt;">${vetLinea}</div>
        </div>
        <div style="text-align:right;font-size:8.5pt;color:#4A4A48;line-height:1.6;">
          <div><strong>${tambo.nombre}</strong></div>
          <div>Propietario: ${tambo.propietario}</div>
          <div>Fecha: ${d}/${m}/${y}${totalPags > 1 ? `   ·   Hoja ${pagNum} / ${totalPags}` : ''}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="${TH}width:7mm;">#</th>
          <th style="${TH}width:15mm;">RP</th>
          <th style="${TH}width:19mm;">Lts. Mañana</th>
          <th style="${TH}width:17mm;">Lts. Tarde</th>
          <th style="${TH}width:15mm;">Total</th>
          <th style="${SEP}"></th>
          <th style="${TH}width:7mm;">#</th>
          <th style="${TH}width:15mm;">RP</th>
          <th style="${TH}width:19mm;">Lts. Mañana</th>
          <th style="${TH}width:17mm;">Lts. Tarde</th>
          <th style="${TH}width:15mm;">Total</th>
        </tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>
      ${firmaRow}
    </div>
  </div>`;
}

function _printCeldas(v, idx, TD) {
  const tags = v.tags || [];
  const color = tags.length ? ((_pd.tagColor || {})[tags[0].toLowerCase()] || '#888888') : null;
  const bg = tags.length ? `background:${_hexToRgba(color, 0.16)};`
           : idx % 2 === 0 ? 'background:#fafaf8;'
           : '';
  const td = TD + bg;
  const sinLitros = !v.hasMañana && !v.hasTarde;
  const esPend = sinLitros && tags.length === 0;
  const ma  = esPend ? '?' : (v.hasMañana ? _fmtLp(v.litrosMañana) : '—');
  const ta  = esPend ? '?' : (v.hasTarde  ? _fmtLp(v.litrosTarde)  : '—');
  const tot = esPend ? '?' : (sinLitros ? '—' : _fmtLp(v.litrosMañana + v.litrosTarde));
  const tagTxt = tags.length
    ? `<div style="font-size:6pt;line-height:1.1;color:${color};font-weight:700;">${tags.join(', ')}</div>`
    : '';
  return `<td style="${td}">${idx}</td>
          <td style="${td}">${v.rp}${tagTxt}</td>
          <td style="${td}">${ma}</td>
          <td style="${td}">${ta}</td>
          <td style="${TD + bg}font-weight:600;">${tot}</td>`;
}

async function sincronizarSheets() {
  const { tambo, controlId, tamboId } = _pd;
  if (!tambo.sheetId) {
    alert(
      'Este tambo no tiene ID de Google Sheet configurado.\n\n' +
      'Editá el tambo y pegá el ID que aparece en la URL del Sheet:\n' +
      'docs.google.com/spreadsheets/d/[ID]/edit'
    );
    return;
  }
  if (!navigator.onLine) {
    alert('Sin conexión a internet.\n\nEl control se sincronizará automáticamente cuando se restablezca la conexión.');
    return;
  }
  const btn = document.querySelector('.pl-actions button:last-child');
  if (btn) { btn.textContent = '⏳ Sincronizando…'; btn.disabled = true; }

  const resultado = await sincronizarControlManual(controlId, tamboId);

  if (btn) { btn.textContent = '☁️ Sincronizar con Sheets'; btn.disabled = false; }

  if (resultado.ok) {
    alert('✅ Sincronizado correctamente con Google Sheets.');
  } else {
    alert('❌ Error al sincronizar:\n' + resultado.error);
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function _fmtLp(n) {
  if (!n) return '0';
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
