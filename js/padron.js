/* padron.js — Padrón de vacas + Historial por vaca */

// ─── Padrón del tambo ─────────────────────────────────────────────────────────

registerScreen('padron', async (el, params) => {
  const tamboId = Number(params.tamboId);
  const [tambo, vacas, controles] = await Promise.all([
    getTambo(tamboId),
    getPadronTambo(tamboId),
    getControlesDeTambo(tamboId),
  ]);

  if (!tambo) {
    el.innerHTML = '<div class="page-body"><p class="text2">Tambo no encontrado.</p></div>';
    return;
  }

  // RPs que estuvieron en el último control
  const ultimoControl = controles[0] || null;
  const rpsUltimo = new Set();
  if (ultimoControl) {
    const tandas = await getTandasDeControl(ultimoControl.id);
    for (const t of tandas) {
      const regs = await getRegistrosDeTanda(t.id);
      regs.forEach(r => rpsUltimo.add(r.rp));
    }
  }

  el.innerHTML = `
    <div class="page-header">
      <button class="btn btn-ghost btn-icon" onclick="navigateUp('/tambos/${tamboId}')">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div>
        <h2>Padrón</h2>
        <p class="text3" style="font-size:12px">${tambo.nombre}</p>
      </div>
      <span class="text3" style="font-size:13px">${vacas.length} vacas</span>
    </div>

    <div class="page-body">
      ${ultimoControl ? `
        <p class="text3" style="font-size:12px">
          Último control: <strong>${formatFecha(ultimoControl.fecha)}</strong>
        </p>` : ''}

      ${vacas.length === 0
        ? `<div class="empty-state">
             <p>Sin vacas en el padrón.</p>
             <p class="text3">Se agregan automáticamente al registrar el primer control.</p>
           </div>`
        : vacas.map(v => `
          <div class="list-item" onclick="navigate('/tambos/${tamboId}/padron/${v.rp}')">
            <span class="mono" style="font-size:17px;font-weight:600">${v.rp}</span>
            <div style="flex:1"></div>
            ${rpsUltimo.has(v.rp)
              ? `<span class="badge badge--presente">✓ en último control</span>`
              : `<span class="text3" style="font-size:12px">no presente</span>`}
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>`).join('')
      }
    </div>
  `;
});

// ─── Historial de vaca ────────────────────────────────────────────────────────

registerScreen('historial-vaca', async (el, params) => {
  const tamboId = Number(params.tamboId);
  const rp = params.rp;

  await seedTagsIfEmpty();
  const [tambo, entradas, tagColor] = await Promise.all([
    getTambo(tamboId),
    getHistorialVaca(tamboId, rp),
    getTagColorMap(),
  ]);

  if (!tambo) {
    el.innerHTML = '<div class="page-body"><p class="text2">Tambo no encontrado.</p></div>';
    return;
  }

  const porFecha = _agruparPorFecha(entradas);
  const stats    = _calcHistStats(porFecha);

  el.innerHTML = `
    <div class="page-header">
      <button class="btn btn-ghost btn-icon" onclick="navigateUp('/tambos/${tamboId}/padron')">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div>
        <h2>RP ${rp}</h2>
        <p class="text3" style="font-size:12px">${tambo.nombre}</p>
      </div>
      <div></div>
    </div>

    <div class="page-body">

      ${stats.promedio4 != null ? `
        <div class="card hist-stats-card">
          <div class="hist-stat">
            <span class="hist-stat-val">${stats.promedio4.toFixed(1)}</span>
            <span class="hist-stat-lbl">Prom. últ. ${stats.n4} controles</span>
          </div>
          ${stats.tendencia ? `
          <div class="hist-tendencia hist-tendencia--${stats.tendencia.tipo}">
            <span class="tend-icon">${stats.tendencia.icon}</span>
            <span class="tend-label">${stats.tendencia.label}</span>
          </div>` : ''}
        </div>` : ''}

      <!-- Contenedor reservado para gráfico -->
      <div id="chart-${rp}" style="display:none"></div>

      ${porFecha.length === 0
        ? `<div class="empty-state">
             <p>Sin historial para esta vaca.</p>
           </div>`
        : `<div class="pl-table-wrap">
            <table class="pl-table">
              <thead>
                <tr>
                  <th style="text-align:left">Fecha</th>
                  <th>Mañana</th>
                  <th>Tarde</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${porFecha.map(e => {
                  const sinLitros = !e.hasMañana && !e.hasTarde;
                  const esPend = sinLitros && e.tags.length === 0;
                  const mañana = e.hasMañana ? fmtL(e.litrosMañana) : (esPend ? '?' : '—');
                  const tarde  = e.hasTarde  ? fmtL(e.litrosTarde)  : (esPend ? '?' : '—');
                  const total  = esPend ? '?' : (sinLitros ? '—' : fmtL(e.total));
                  const rowStyle = e.tags.length
                    ? ` style="background:${_hexToRgba(tagColor[e.tags[0].toLowerCase()] || '#888888', 0.10)}"`
                    : '';
                  const tagBadges = e.tags.map(name => {
                    const color = tagColor[name.toLowerCase()] || '#888888';
                    return `<span class="badge" style="background:${color};color:#fff">${name}</span>`;
                  }).join(' ');
                  return `<tr${rowStyle}>
                    <td style="text-align:left;white-space:nowrap">${formatFecha(e.fecha)}</td>
                    <td>${mañana}</td>
                    <td>${tarde}</td>
                    <td><strong>${total}</strong></td>
                    <td>${tagBadges}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`
      }
    </div>
  `;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _agruparPorFecha(entradas) {
  const map = new Map();
  for (const e of entradas) {
    if (!map.has(e.fecha)) {
      map.set(e.fecha, {
        fecha: e.fecha,
        litrosMañana: 0, hasMañana: false,
        litrosTarde:  0, hasTarde:  false,
        total: 0,
        tags: [],
      });
    }
    const d = map.get(e.fecha);

    for (const name of (e.tags || [])) {
      if (!d.tags.includes(name)) d.tags.push(name);
    }

    if (e.turno === 'mañana') { d.hasMañana = true; d.litrosMañana += (e.litros || 0); }
    else if (e.turno === 'tarde') { d.hasTarde = true; d.litrosTarde += (e.litros || 0); }
  }

  const rows = [...map.values()];
  rows.forEach(r => { r.total = r.litrosMañana + r.litrosTarde; });
  return rows.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function _calcHistStats(porFecha) {
  const productivas = porFecha.filter(e => e.total > 0);
  const ultimas = productivas.slice(0, 4);

  const promedio4 = ultimas.length >= 1
    ? ultimas.reduce((s, e) => s + e.total, 0) / ultimas.length
    : null;

  let tendencia = null;
  if (productivas.length >= 4) {
    const avg12 = (productivas[0].total + productivas[1].total) / 2;
    const avg34 = (productivas[2].total + productivas[3].total) / 2;
    const diff  = avg12 - avg34;
    if      (diff >  1) tendencia = { icon: '↗', label: 'subiendo', tipo: 'up' };
    else if (diff < -1) tendencia = { icon: '↘', label: 'bajando',  tipo: 'down' };
    else                tendencia = { icon: '→', label: 'estable',  tipo: 'flat' };
  }

  return { promedio4, n4: ultimas.length, tendencia };
}
