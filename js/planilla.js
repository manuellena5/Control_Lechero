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
          <button class="btn btn-secondary btn-full" onclick="window.print()">
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

function compartirWhatsApp() {
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
  if (stats.cantSecar > 0)   lineas.push(`🔵 A secar: ${stats.cantSecar}`);
  if (stats.cantVenta > 0)   lineas.push(`🟠 A venta: ${stats.cantVenta}`);
  if (stats.cantPendiente > 0) lineas.push(`⏳ Pendientes: ${stats.cantPendiente}`);
  if (vet) lineas.push(``, `_${vet.nombre}${vet.matricula ? ' — Mat. ' + vet.matricula : ''}_`);

  const texto = encodeURIComponent(lineas.join('\n'));
  const tel   = tambo.telefono ? tambo.telefono.replace(/\D/g, '') : '';
  window.open(`https://wa.me/${tel}?text=${texto}`, '_blank');
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
