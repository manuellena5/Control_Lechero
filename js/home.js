/* home.js — Pantalla de inicio */

registerScreen('home', async (el) => {
  const [vet, tambos] = await Promise.all([
    getVeterinario(),
    getTambos(),
  ]);

  const hoy = fechaHoy();

  // Para cada tambo, buscar si tiene control hoy
  const actividades = await Promise.all(tambos.map(async t => {
    const control = await db.controles.where('[tamboId+fecha]').equals([t.id, hoy]).first();
    if (!control) return null;

    const tandas  = await getTandasDeControl(control.id);
    const turnosConTandas = [...new Set(tandas.map(t => t.turno))];

    let totalLitros = 0, totalVacas = 0, pendientes = 0, conLitros = 0;
    for (const tanda of tandas) {
      const regs = await getRegistrosDeTanda(tanda.id);
      for (const r of regs) {
        totalVacas++;
        if (r.estado !== 'venta' && r.estado !== 'pendiente' && r.litros != null) {
          totalLitros += r.litros;
          conLitros++;
        }
        if (r.estado === 'pendiente') pendientes++;
      }
    }
    const promedio = conLitros > 0 ? totalLitros / conLitros : 0;

    return { tambo: t, control, turnosConTandas, totalLitros, totalVacas, pendientes, promedio };
  }));

  const actividadesHoy = actividades.filter(Boolean);

  const saludo = _saludo();
  const nombreVet = vet?.nombre || 'Veterinario';

  el.innerHTML = `
    <div class="home-wrap">
      <div class="home-header">
        <div>
          <div class="home-saludo">${saludo}</div>
          <div class="home-nombre">${nombreVet}</div>
        </div>
        <div class="home-fecha text3">${_fechaLarga(hoy)}</div>
      </div>

      <div class="home-body">
        <!-- Actividad de hoy por tambo -->
        ${actividadesHoy.length > 0 ? `
          <div class="section-title">Actividad de hoy</div>
          ${actividadesHoy.map(a => `
            <div class="list-item" onclick="navigate('/tambos/${a.tambo.id}')">
              <div class="list-item__body">
                <div class="list-item__title">${a.tambo.nombre}</div>
                <div class="list-item__sub text2">
                  <span>${fmtL(a.totalLitros)} L total</span>
                  <span class="text3"> · </span>
                  <span>${a.promedio > 0 ? fmtL(a.promedio) + ' L/vaca' : a.totalVacas + ' vacas'}</span>
                  ${a.pendientes > 0 ? `<span class="text3"> · </span><span style="color:var(--pending)">${a.pendientes} pend.</span>` : ''}
                </div>
                <div class="home-turnos-badges">
                  ${['mañana','tarde'].map(turno => {
                    const tiene = a.turnosConTandas.includes(turno);
                    return `<span class="turno-badge turno-badge--${turno}${tiene ? ' turno-badge--done' : ''}">${turno}</span>`;
                  }).join('')}
                </div>
              </div>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          `).join('')}
        ` : ''}

        <!-- Acceso rápido a todos los tambos -->
        <div class="section-title">Tambos</div>
        ${tambos.length === 0
          ? `<div class="empty-state" style="padding:24px 0">
               <p>No tenés tambos cargados.</p>
               <button class="btn btn-primary btn-sm" onclick="navigate('/tambos/nuevo')" style="margin-top:8px">+ Crear tambo</button>
             </div>`
          : tambos.map(t => {
              const actividad = actividadesHoy.find(a => a.tambo.id === t.id);
              return `
                <div class="list-item list-item--compact" onclick="navigate('/tambos/${t.id}')">
                  <div class="list-item__body">
                    <div class="list-item__title">${t.nombre}</div>
                    <div class="list-item__meta text3">${t.propietario}</div>
                  </div>
                  ${actividad
                    ? `<span class="badge badge--activo">hoy ${fmtL(actividad.totalLitros)} L</span>`
                    : ''}
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              `;
            }).join('')
        }
      </div>
    </div>
  `;
});

// ─── Historial ────────────────────────────────────────────────────────────────

let _histDatos  = null;
let _histFiltro = { tamboId: null, mes: null };

registerScreen('historial', async (el) => {
  const tambos = await getTambos();

  const items = [];
  for (const t of tambos) {
    const controles = await getControlesDeTambo(t.id);
    for (const c of controles) {
      const litros = await getLitrosControl(c.id);
      items.push({ tambo: t, control: c, litros });
    }
  }
  items.sort((a, b) => b.control.fecha.localeCompare(a.control.fecha));

  const mesesSet = new Set(items.map(x => x.control.fecha.slice(0, 7)));
  const meses    = [...mesesSet].sort().reverse();

  _histDatos  = { tambos, items, meses };
  _histFiltro = { tamboId: null, mes: null };

  el.innerHTML = `
    <div class="page-header page-header--top">
      <h1>Historial</h1>
    </div>
    <div class="page-body">
      <div class="hist-filtros">
        <select class="form-input form-input--sm" onchange="_histCambiarFiltro('tamboId', this.value)">
          <option value="">Todos los tambos</option>
          ${tambos.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}
        </select>
        <select class="form-input form-input--sm" onchange="_histCambiarFiltro('mes', this.value)">
          <option value="">Todos los meses</option>
          ${meses.map(m => `<option value="${m}">${_fmtMes(m)}</option>`).join('')}
        </select>
      </div>
      <div id="hist-lista"></div>
    </div>
  `;

  _histRenderLista();
});

function _histCambiarFiltro(campo, valor) {
  _histFiltro[campo] = campo === 'tamboId' ? (valor ? Number(valor) : null) : (valor || null);
  _histRenderLista();
}

function _histRenderLista() {
  let items = _histDatos.items;
  if (_histFiltro.tamboId) items = items.filter(x => x.tambo.id === _histFiltro.tamboId);
  if (_histFiltro.mes)     items = items.filter(x => x.control.fecha.startsWith(_histFiltro.mes));

  const lista = document.getElementById('hist-lista');
  if (!lista) return;

  if (items.length === 0) {
    lista.innerHTML = `<div class="empty-state"><p>Sin controles para los filtros seleccionados.</p></div>`;
    return;
  }

  lista.innerHTML = items.map(({ tambo, control, litros }) => `
    <div class="list-item list-item--compact"
         onclick="navigate('/tambos/${tambo.id}/control/${control.id}/planilla')">
      <div class="list-item__body">
        <div class="list-item__title">${formatFecha(control.fecha)}</div>
        <div class="list-item__meta text3">${tambo.nombre}${litros > 0 ? ` · ${fmtL(litros)} L` : ''}</div>
      </div>
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  `).join('');
}

function _fmtMes(yyyyMM) {
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const [y, m] = yyyyMM.split('-');
  return `${meses[Number(m) - 1]} ${y}`;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function _saludo() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días,';
  if (h < 19) return 'Buenas tardes,';
  return 'Buenas noches,';
}

function _fechaLarga(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fecha = new Date(Number(y), Number(m) - 1, Number(d));
  return `${dias[fecha.getDay()]} ${Number(d)} de ${meses[Number(m) - 1]}`;
}
