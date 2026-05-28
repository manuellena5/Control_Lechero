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

  const tandas = await getTandasDeControl(controlId);
  const vacas  = await _buildVacaData(tandas);
  const stats  = _calcStats(vacas);
  _pd = { tambo, vet, control, vacas, stats, tamboId, controlId };

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
          estado: 'normal',
        });
      }
      const v = map.get(reg.rp);

      // Estado: venta > secar > pendiente > normal
      if (reg.estado === 'venta') v.estado = 'venta';
      else if (reg.estado === 'secar'    && v.estado !== 'venta') v.estado = 'secar';
      else if (reg.estado === 'pendiente' && v.estado === 'normal') v.estado = 'pendiente';

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
  const productivas = vacas.filter(v => v.estado !== 'venta' && v.estado !== 'pendiente');
  const totalMañana = productivas.reduce((s, v) => s + v.litrosMañana, 0);
  const totalTarde  = productivas.reduce((s, v) => s + v.litrosTarde, 0);
  const totalDia    = totalMañana + totalTarde;
  const conLitros   = productivas.filter(v => v.litrosMañana + v.litrosTarde > 0).length;
  return {
    totalMañana, totalTarde, totalDia,
    promedio:  conLitros > 0 ? totalDia / conLitros : 0,
    cantVacas: vacas.length,
    cantVenta: vacas.filter(v => v.estado === 'venta').length,
    cantSecar: vacas.filter(v => v.estado === 'secar').length,
    cantPendiente: vacas.filter(v => v.estado === 'pendiente').length,
  };
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function _planillaHTML() {
  const { tambo, vet, control, vacas, stats } = _pd;

  const filas = vacas.map((v, i) => {
    if (v.estado === 'venta') {
      return `<tr class="fila-venta">
        <td>${i + 1}</td>
        <td class="rp-cell"><span class="badge badge--venta">VENTA</span> <span class="mono">${v.rp}</span></td>
        <td colspan="3" style="text-align:center;color:var(--text3)">— venta —</td>
      </tr>`;
    }
    const secarBadge = v.estado === 'secar' ? ' <span class="badge badge--secar">SECAR</span>' : '';
    const mCell = v.estado === 'pendiente' ? '<span class="pend-cell">?</span>' : (v.hasMañana ? _fmtLp(v.litrosMañana) : '—');
    const tCell = v.estado === 'pendiente' ? '<span class="pend-cell">?</span>' : (v.hasTarde  ? _fmtLp(v.litrosTarde)  : '—');
    const total  = v.litrosMañana + v.litrosTarde;
    const totCell = v.estado === 'pendiente' ? '?' : _fmtLp(total);
    const rowCls = v.estado === 'secar' ? ' class="fila-secar"' : '';
    return `<tr${rowCls}>
      <td>${i + 1}</td>
      <td class="rp-cell"><span class="mono">${v.rp}</span>${secarBadge}</td>
      <td>${mCell}</td>
      <td>${tCell}</td>
      <td><strong>${totCell}</strong></td>
    </tr>`;
  }).join('');

  const vetLinea = vet ? `${vet.nombre}${vet.matricula ? ' — Mat. ' + vet.matricula : ''}` : '';

  return `
    <div class="pl-wrap">

      <!-- Cabecera de navegación (no se imprime) -->
      <div class="page-header no-print">
        <button class="btn btn-ghost btn-icon" onclick="history.back()">
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
            ${stats.cantSecar > 0 ? `
            <div class="resumen-item">
              <span class="resumen-val" style="color:var(--secar)">${stats.cantSecar}</span>
              <span class="resumen-lbl">A secar</span>
            </div>` : ''}
            ${stats.cantVenta > 0 ? `
            <div class="resumen-item">
              <span class="resumen-val" style="color:var(--accent2)">${stats.cantVenta}</span>
              <span class="resumen-lbl">A venta</span>
            </div>` : ''}
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
          <button class="btn btn-secondary btn-full" id="btn-pdf" onclick="generarPDF()">
            📄 Generar PDF
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

async function _compartirImagen() {
  const { tambo, vet, control, vacas, stats } = _pd;
  const COLS      = 2;
  const FILAS_COL = 40;
  const POR_PAG   = COLS * FILAS_COL;

  const btn = document.querySelector('.pl-actions button');
  if (btn) { btn.textContent = '⏳ Generando imagen…'; btn.disabled = true; }

  try {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
    document.body.appendChild(container);

    const totalPags = Math.max(1, Math.ceil(vacas.length / POR_PAG));
    const files = [];

    for (let p = 0; p < totalPags; p++) {
      const startIdx  = p * POR_PAG;
      const pageVacas = vacas.slice(startIdx, startIdx + POR_PAG);
      container.innerHTML = _buildPagHTML(tambo, vet, control, pageVacas, startIdx, p + 1, totalPags, stats);

      const canvas = await html2canvas(container.firstElementChild, {
        backgroundColor: '#ffffff',
        scale: 2,
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
    }

    document.body.removeChild(container);

    await navigator.share({ files, title: `Control Lechero — ${tambo.nombre}` });

  } catch (err) {
    if (err.name !== 'AbortError') _compartirTexto();
  } finally {
    if (btn) { btn.textContent = '📱 Compartir por WhatsApp'; btn.disabled = false; }
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
  const vetLinea  = vet ? `${vet.nombre}${vet.matricula ? '   Mat. ' + vet.matricula : ''}` : '';

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
      ${stats.cantVacas} vacas · prom. ${stats.promedio > 0 ? stats.promedio.toFixed(1) : '—'} L/vaca
      ${stats.cantSecar > 0 ? ` · secar: ${stats.cantSecar}` : ''}
      ${stats.cantVenta > 0 ? ` · venta: ${stats.cantVenta}` : ''}
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

function _imgCeldas(v, idx, TD) {
  const bg = v.estado === 'venta' ? 'background:#FDEBD6;'
           : v.estado === 'secar' ? 'background:#EDE6F7;'
           : idx % 2 === 0        ? 'background:#fafaf8;'
           : '';
  const td = TD + bg;
  if (v.estado === 'venta') {
    return `<td style="${td}">${idx}</td>
            <td style="${td}">${v.rp}</td>
            <td colspan="3" style="${td}color:#E76F51;font-weight:600;">VENTA</td>`;
  }
  const m = v.estado === 'pendiente' ? '?' : (v.hasMañana ? _fmtLp(v.litrosMañana) : '—');
  const t = v.estado === 'pendiente' ? '?' : (v.hasTarde  ? _fmtLp(v.litrosTarde)  : '—');
  const tot = v.estado === 'pendiente' ? '?' : _fmtLp(v.litrosMañana + v.litrosTarde);
  return `<td style="${td}">${idx}</td>
          <td style="${td}">${v.rp}${v.estado === 'secar' ? ' ★' : ''}</td>
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
  if (stats.cantSecar > 0)     lineas.push(`🔵 A secar: ${stats.cantSecar}`);
  if (stats.cantVenta > 0)     lineas.push(`🟠 A venta: ${stats.cantVenta}`);
  if (stats.cantPendiente > 0) lineas.push(`⏳ Pendientes: ${stats.cantPendiente}`);
  if (vet) lineas.push(``, `_${vet.nombre}${vet.matricula ? ' — Mat. ' + vet.matricula : ''}_`);

  const texto = encodeURIComponent(lineas.join('\n'));
  const tel   = tambo.telefono ? tambo.telefono.replace(/\D/g, '') : '';
  window.open(`https://wa.me/${tel}?text=${texto}`, '_blank');
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

function _buildPrintDoc(title, pagesHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; }
  .print-pag { display: flex; justify-content: center; page-break-after: always; break-after: page; }
  .print-pag:last-child { page-break-after: auto; break-after: auto; }
  @media screen {
    body { padding: 12px; }
    .print-pag { overflow-x: auto; margin-bottom: 24px; }
  }
  @media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { padding: 0; }
    @page { size: A4 portrait; margin: 10mm; }
  }
</style>
</head>
<body>
${pagesHtml}
<script>
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
  const vetLinea  = vet ? `${vet.nombre}${vet.matricula ? ' — Mat. ' + vet.matricula : ''}` : '';

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
      ${stats.cantVacas} vacas · prom. ${stats.promedio > 0 ? stats.promedio.toFixed(1) : '—'} L/vaca
      ${stats.cantSecar > 0 ? ` · secar: ${stats.cantSecar}` : ''}
      ${stats.cantVenta > 0 ? ` · venta: ${stats.cantVenta}` : ''}
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
  const bg = v.estado === 'venta' ? 'background:#FDEBD6;'
           : v.estado === 'secar' ? 'background:#EDE6F7;'
           : idx % 2 === 0        ? 'background:#fafaf8;'
           : '';
  const td = TD + bg;
  if (v.estado === 'venta') {
    return `<td style="${td}">${idx}</td>
            <td style="${td}">${v.rp}</td>
            <td colspan="3" style="${td}color:#E76F51;font-weight:600;">VENTA</td>`;
  }
  const ma  = v.estado === 'pendiente' ? '?' : (v.hasMañana ? _fmtLp(v.litrosMañana) : '—');
  const ta  = v.estado === 'pendiente' ? '?' : (v.hasTarde  ? _fmtLp(v.litrosTarde)  : '—');
  const tot = v.estado === 'pendiente' ? '?' : _fmtLp(v.litrosMañana + v.litrosTarde);
  return `<td style="${td}">${idx}</td>
          <td style="${td}">${v.rp}${v.estado === 'secar' ? ' ★' : ''}</td>
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
