/* ayuda.js — Pantalla de ayuda / guía de uso (lenguaje simple) */

registerScreen('ayuda', async (el) => {
  el.innerHTML = _ayudaHTML();
});

// ─── Iconos (reutilizados del resto de la app) ────────────────────────────────

const _ayIcon = {
  vet:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  tambo:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  sheet:  '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></svg>',
  control:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  vaca:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9 15c1 1 5 1 6 0"/></svg>',
  padron: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  planilla:'<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
  sync:   '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-8-5"/><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 8 5"/><path d="M21 3v5h-5M3 21v-5h5"/></svg>',
  restore:'<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  backup: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>',
  update: '<svg viewBox="0 0 24 24"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>',
  wa:     '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5z"/></svg>',
  print:  '<svg viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>',
};

// ─── Bloque de sección desplegable ────────────────────────────────────────────

function _ayItem(icon, titulo, contenido) {
  return `
    <details class="ay-item">
      <summary class="ay-summary">
        <span class="ay-ico">${icon}</span>
        <span class="ay-titulo">${titulo}</span>
        <svg class="ay-chevron" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </summary>
      <div class="ay-body">${contenido}</div>
    </details>`;
}

// ─── HTML principal ───────────────────────────────────────────────────────────

function _ayudaHTML() {
  return `
    <div class="page-header page-header--top">
      <h1>Ayuda</h1>
    </div>
    <div class="page-body ay-wrap">

      <p class="ay-intro">
        Esta app te ayuda a anotar la producción de leche en cada tambo.
        Funciona <strong>sin internet</strong>: cargás todo tranquilo en el campo y,
        cuando volvés a tener señal, se guarda solo en la nube (Google Sheets).
        Tocá cada tema para ver la explicación.
      </p>

      ${_ayItem(_ayIcon.vet, '1. Cargar tus datos (primera vez)', `
        <p>Andá a <strong>Config</strong> (el engranaje ⚙️) y completá tu <strong>nombre</strong>,
        <strong>matrícula</strong> y <strong>teléfono</strong>. Estos datos salen impresos en las planillas
        que compartís.</p>
        <p>Ahí también va la <strong>“URL de Apps Script”</strong>. Es una dirección que conecta la app
        con Google para poder guardar los datos en la nube. Se pega una sola vez y queda guardada.
        Si no la tenés, pedísela a quien te preparó la app.</p>
        <div class="ay-tip">💡 Sin esa URL la app igual funciona, pero los datos quedan solo en este
        celular (no se copian a Google).</div>
      `)}

      ${_ayItem(_ayIcon.tambo, '2. Crear un tambo', `
        <p>Un <strong>tambo</strong> es cada campo o establecimiento que controlás.</p>
        <p>Entrá a <strong>Tambos</strong> → botón <strong>“+ Nuevo”</strong> y completá:</p>
        <ul class="ay-list">
          <li><strong>Nombre</strong> del tambo.</li>
          <li><strong>Propietario</strong> (el dueño).</li>
          <li><strong>Teléfono</strong> del tambo → es el número al que se manda la planilla por WhatsApp.</li>
          <li><strong>ID del Google Sheet</strong> → mirá el punto 3.</li>
        </ul>
        <p>Podés tener todos los tambos que quieras, cada uno con su historial aparte.</p>
      `)}

      ${_ayItem(_ayIcon.sheet, '3. El Google Sheet: uno por tambo', `
        <p>Un <strong>Google Sheet</strong> es una planilla de Google (como un Excel en internet).
        Cada tambo necesita <strong>su propia planilla</strong>, y ahí se van guardando todos los controles
        como copia de seguridad en la nube.</p>
        <p><strong>Paso a paso:</strong></p>
        <ol class="ay-list">
          <li>Entrá a <span class="mono">sheets.google.com</span> y creá una planilla nueva y <strong>vacía</strong>
          (no hay que armar nada adentro, la app la completa sola).</li>
          <li>Ponele un nombre para reconocerla, por ej. el nombre del tambo.</li>
          <li>Copiá el <strong>ID</strong> de la dirección de arriba. El ID es la parte del medio:</li>
        </ol>
        <div class="ay-url">
          docs.google.com/spreadsheets/d/<span class="ay-url-id">1BxiMVs0XRA5nFMdKvBd…</span>/edit
          <div class="ay-url-lbl">↑ esto es lo que tenés que copiar</div>
        </div>
        <ol class="ay-list" start="4">
          <li>Pegá ese ID en el campo <strong>“ID del Google Sheet”</strong> al crear o editar el tambo.</li>
        </ol>
        <div class="ay-tip">💡 Cada tambo, su propia planilla. No mezcles dos tambos en la misma.</div>
      `)}

      ${_ayItem(_ayIcon.control, '4. Cargar un control del día', `
        <p>Un <strong>control</strong> es la medición de leche de un día en un tambo.</p>
        <p>Entrá al tambo → <strong>“Nuevo control”</strong>. Vas a poder cargar dos momentos del día:
        <strong>Mañana</strong> y <strong>Tarde</strong> (según cuándo ordeñás).</p>
        <p>Para cada vaca escribís su <strong>RP</strong> (el número de caravana) y los <strong>litros</strong>.
        Se guarda al instante, sin apretar “guardar”.</p>
        <div class="ay-tip">💡 Si son muchas vacas podés dividirlas en “tandas” (grupos), pero no es obligatorio.</div>
      `)}

      ${_ayItem(_ayIcon.vaca, '5. Estados de cada vaca', `
        <p>Cada vaca puede tener un estado, marcado con un color:</p>
        <div class="ay-chips">
          <span class="ay-chip ay-chip--normal">Normal</span>
          <span class="ay-chip ay-chip--pend">Pendiente</span>
          <span class="ay-chip ay-chip--secar">Secar</span>
          <span class="ay-chip ay-chip--venta">Venta</span>
        </div>
        <ul class="ay-list">
          <li><strong>Normal</strong>: vaca en ordeñe, con sus litros cargados.</li>
          <li><strong>Pendiente</strong>: está en el control pero todavía no le tomaste los litros.</li>
          <li><strong>Secar</strong>: vaca marcada para dejar de ordeñar pronto.</li>
          <li><strong>Venta</strong>: vaca que se vendió (no suma litros).</li>
        </ul>
      `)}

      ${_ayItem(_ayIcon.padron, '6. Padrón de vacas', `
        <p>El <strong>padrón</strong> es la lista de todas las vacas de ese tambo. Se arma solo:
        cada vez que cargás una vaca nueva en un control, queda anotada en el padrón.</p>
        <p>Desde el padrón podés tocar una vaca y ver su <strong>historial</strong>: cuánta leche dio
        en cada control a lo largo del tiempo.</p>
      `)}

      ${_ayItem(_ayIcon.planilla, '7. Planilla, WhatsApp e imprimir', `
        <p>Cuando terminás un control, entrás a la <strong>Planilla</strong>: es el resumen prolijo
        con todas las vacas, los totales y los promedios.</p>
        <p>Desde ahí podés:</p>
        <ul class="ay-list">
          <li>${_ayIcon.wa} <strong>Compartir por WhatsApp</strong> como imagen o como texto (se manda
          al teléfono del tambo que cargaste).</li>
          <li>${_ayIcon.print} <strong>Imprimir</strong> o guardar en PDF.</li>
        </ul>
        <p>Tu nombre, matrícula y teléfono aparecen al pie de la planilla.</p>
      `)}

      ${_ayItem(_ayIcon.sync, '8. Sincronización (guardar en la nube)', `
        <p>La app guarda todo primero en el celular. Cuando hay internet, sube los controles
        a Google Sheets automáticamente. Arriba vas a ver un ícono que te dice cómo está:</p>
        <ul class="ay-list">
          <li><span class="ay-emoji">☁️</span> <strong>Nube</strong>: todo guardado en la nube, al día.</li>
          <li><span class="ay-emoji">🔄</span> <strong>Flechas</strong>: hay cambios esperando subir (falta señal o que abra la app).</li>
          <li><span class="ay-emoji">✗</span> <strong>Cruz</strong>: estás sin internet. No pasa nada, se sube después.</li>
        </ul>
        <p>Si querés forzar que suba ya mismo: <strong>Config → “Forzar sincronización”</strong>.</p>
        <div class="ay-tip">💡 Podés trabajar todo el día sin señal. La app no pierde nada.</div>
      `)}

      ${_ayItem(_ayIcon.restore, '9. Restaurar desde Sheets', `
        <p>Sirve para <strong>traer los controles desde la nube</strong> a este celular. Es muy útil si:</p>
        <ul class="ay-list">
          <li>Cambiaste de celular y querés recuperar todo.</li>
          <li>Cargaste algo en otro dispositivo y lo querés ver acá.</li>
        </ul>
        <p>Está en <strong>Config → Restaurar desde Sheets</strong>. Solo <strong>agrega</strong> lo que te falte:
        nunca borra ni pisa lo que ya tenés cargado.</p>
      `)}

      ${_ayItem(_ayIcon.backup, '10. Copia de seguridad (archivo)', `
        <p>Es un respaldo total en un archivo, aparte de Google. En <strong>Config → Copia de seguridad</strong>:</p>
        <ul class="ay-list">
          <li><strong>Exportar</strong>: descarga un archivo con TODOS tus datos. Guardalo en un lugar seguro.</li>
          <li><strong>Importar</strong>: carga ese archivo de vuelta. ⚠️ Ojo: <strong>reemplaza todo</strong>
          lo que tengas en la app, así que exportá antes por las dudas.</li>
        </ul>
      `)}

      ${_ayItem(_ayIcon.update, '11. Actualizar la app', `
        <p>Si te avisan que hay una versión nueva, andá a <strong>Config → “Buscar actualizaciones”</strong>.
        Se descarga e instala sola y la app se reinicia. Tus datos no se tocan.</p>
      `)}

      <div class="ay-final">
        ¿Dudas? Escribile a quien te preparó la app. 🐄
      </div>

    </div>
  `;
}
