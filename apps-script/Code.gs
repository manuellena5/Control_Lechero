// Code.gs — Google Apps Script para Control Lechero
// Desplegar como: Ejecutar como "Yo", acceso "Cualquier persona"

// ─── doPost: recibe un control y lo escribe en la hoja visual + _datos ────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // action=register: solo registra el tambo, sin escribir hoja visual
    if (data.action === 'register') {
      _registrarTambo(data.sheetId, data.nombre, data.propietario);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss   = SpreadsheetApp.openById(data.sheetId);

    // Buscar o crear la hoja con el nombre de la fecha ("10-05-2026")
    let hoja = ss.getSheetByName(data.control.fecha);
    if (hoja) {
      hoja.clear();
      hoja.clearFormats();
    } else {
      hoja = ss.insertSheet(data.control.fecha);
    }

    // ── Encabezado del control ──────────────────────────────────────────────
    hoja.getRange(1, 1, 1, 5).merge()
        .setValue('Control Lechero — ' + data.control.tambo)
        .setFontWeight('bold')
        .setFontSize(13)
        .setBackground('#D8EFDF');

    const metaLabels = ['Propietario', 'Fecha', 'Veterinario', 'Matrícula', 'Teléfono'];
    const metaValues = [
      data.control.propietario,
      data.control.fecha,
      data.control.veterinario,
      data.control.matricula,
      data.control.telefono || '',
    ];
    for (let i = 0; i < metaLabels.length; i++) {
      hoja.getRange(i + 2, 1).setValue(metaLabels[i] + ':').setFontWeight('bold').setFontColor('#6B6560');
      hoja.getRange(i + 2, 2).setValue(metaValues[i]);
    }

    // ── Cabecera de tabla ───────────────────────────────────────────────────
    const FILA_HEADER = 7;
    const headerRange = hoja.getRange(FILA_HEADER, 1, 1, 5);
    headerRange.setValues([['#', 'RP', 'Lts. Mañana', 'Lts. Tarde', 'Total']]);
    headerRange.setFontWeight('bold')
               .setBackground('#EDE9E1')
               .setBorder(true, true, true, true, false, false);

    // ── Filas de vacas ──────────────────────────────────────────────────────
    const regs = data.registros || [];
    let totalMañana = 0, totalTarde = 0, totalDia = 0;

    for (let i = 0; i < regs.length; i++) {
      const r   = regs[i];
      const row = FILA_HEADER + 1 + i;

      if (r.estado === 'venta') {
        hoja.getRange(row, 1, 1, 5)
            .setValues([[i + 1, r.rp, 'VENTA', 'VENTA', 'VENTA']])
            .setBackground('#FDEBD6')
            .setFontColor('#E76F51');
      } else {
        const mañana = r.litrosMañana != null ? r.litrosMañana : '';
        const tarde  = r.litrosTarde  != null ? r.litrosTarde  : '';
        const total  = r.total        != null ? r.total        : '';
        const rpLabel = r.estado === 'secar' ? r.rp + ' ★' : r.rp;

        hoja.getRange(row, 1, 1, 5).setValues([[i + 1, rpLabel, mañana, tarde, total]]);

        if (r.estado === 'secar') {
          hoja.getRange(row, 1, 1, 5).setBackground('#EDE6F7');
        }

        if (r.estado !== 'pendiente') {
          totalMañana += r.litrosMañana || 0;
          totalTarde  += r.litrosTarde  || 0;
          totalDia    += r.total        || 0;
        }
      }

      // Borde inferior suave en cada fila
      hoja.getRange(row, 1, 1, 5)
          .setBorder(false, false, true, false, false, false, '#D8D2C8', SpreadsheetApp.BorderStyle.SOLID);
    }

    // ── Fila TOTAL ──────────────────────────────────────────────────────────
    const rowTotal = FILA_HEADER + 1 + regs.length;
    hoja.getRange(rowTotal, 1, 1, 5)
        .setValues([['', 'TOTAL', totalMañana, totalTarde, totalDia]])
        .setFontWeight('bold')
        .setBackground('#D8EFDF')
        .setBorder(true, true, true, true, false, false);

    // ── Formato de columnas ─────────────────────────────────────────────────
    hoja.setColumnWidth(1, 40);   // #
    hoja.setColumnWidth(2, 90);   // RP
    hoja.setColumnWidth(3, 100);  // Mañana
    hoja.setColumnWidth(4, 100);  // Tarde
    hoja.setColumnWidth(5, 80);   // Total

    // Alinear números a la derecha
    hoja.getRange(FILA_HEADER + 1, 3, regs.length + 1, 3).setHorizontalAlignment('right');

    // ── Actualizar hoja _datos y registro global ────────────────────────────
    _actualizarDatos(ss, data);
    _registrarTambo(data.sheetId, data.control.tambo, data.control.propietario);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── doGet: devuelve el JSON de _datos para el sheetId dado ──────────────────

function doGet(e) {
  try {
    // action=list → devuelve todos los tambos registrados en este script
    if (e.parameter.action === 'list') {
      const props = PropertiesService.getScriptProperties();
      let registro = {};
      try { registro = JSON.parse(props.getProperty('tambos') || '{}'); } catch(ex) {}
      const tambos = Object.keys(registro).map(function(sheetId) {
        return Object.assign({ sheetId: sheetId }, registro[sheetId]);
      });
      return ContentService
        .createTextOutput(JSON.stringify({ tambos: tambos }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // sheetId → devuelve el historial completo del tambo
    const sheetId = e.parameter.sheetId;
    if (!sheetId) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'Falta parámetro sheetId o action.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss        = SpreadsheetApp.openById(sheetId);
    const hojaDatos = ss.getSheetByName('_datos');

    if (!hojaDatos) {
      return ContentService
        .createTextOutput(JSON.stringify({ controles: [], padron: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const raw   = hojaDatos.getRange('A1').getValue();
    const datos = raw ? JSON.parse(raw) : { controles: [], padron: [] };

    return ContentService
      .createTextOutput(JSON.stringify(datos))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── _registrarTambo: guarda el tambo en las propiedades del script ──────────

function _registrarTambo(sheetId, nombre, propietario) {
  try {
    const props = PropertiesService.getScriptProperties();
    let registro = {};
    try { registro = JSON.parse(props.getProperty('tambos') || '{}'); } catch(ex) {}
    registro[sheetId] = {
      nombre:      nombre,
      propietario: propietario,
      updatedAt:   new Date().toISOString(),
    };
    props.setProperty('tambos', JSON.stringify(registro));
  } catch(e) {
    // No crítico — continuar aunque falle el registro
  }
}

// ─── _actualizarDatos: mantiene la hoja _datos con el historial completo ─────

function _actualizarDatos(ss, data) {
  let hojaDatos = ss.getSheetByName('_datos');
  if (!hojaDatos) {
    hojaDatos = ss.insertSheet('_datos');
    hojaDatos.hideSheet();
  }

  // Leer datos existentes
  let datos = { tambo: {}, controles: [], padron: [] };
  try {
    const raw = hojaDatos.getRange('A1').getValue();
    if (raw) datos = JSON.parse(raw);
  } catch(e) {}

  // Datos del tambo
  datos.tambo = {
    nombre:      data.control.tambo,
    propietario: data.control.propietario,
  };

  // Convertir fecha de DD-MM-YYYY → YYYY-MM-DD
  const partes   = data.control.fecha.split('-');
  const fechaISO = partes[2] + '-' + partes[1] + '-' + partes[0];

  // Reemplazar o agregar el control de esta fecha
  const controlData = {
    fecha: fechaISO,
    registros: (data.registros || []).map(function(r) {
      return {
        rp:           r.rp,
        litrosMañana: r.litrosMañana,
        litrosTarde:  r.litrosTarde,
        estado:       r.estado,
      };
    }),
  };

  const idx = datos.controles.findIndex(function(c) { return c.fecha === fechaISO; });
  if (idx >= 0) {
    datos.controles[idx] = controlData;
  } else {
    datos.controles.push(controlData);
  }

  // Actualizar padrón (solo agrega, nunca elimina)
  const rpSet = new Set(datos.padron.map(function(p) { return p.rp; }));
  (data.registros || []).forEach(function(r) {
    if (!rpSet.has(r.rp)) {
      datos.padron.push({ rp: r.rp, activa: true, fechaAlta: fechaISO });
      rpSet.add(r.rp);
    }
  });

  datos.updatedAt = new Date().toISOString();

  hojaDatos.getRange('A1').setValue(JSON.stringify(datos));
}

// ─── Test manual ─────────────────────────────────────────────────────────────

function testDoPost() {
  const payload = {
    sheetId: 'REEMPLAZAR_CON_ID_REAL',
    control: {
      fecha: '27-05-2026',
      tambo: 'Tambo de prueba',
      propietario: 'Juan Pérez',
      veterinario: 'Dr. Test',
      matricula: '1234',
      telefono: '351 1234567',
    },
    registros: [
      { rp: '1001', litrosMañana: 15, litrosTarde: 12, total: 27, estado: 'normal', tanda: 1 },
      { rp: '1002', litrosMañana: 18, litrosTarde: 14, total: 32, estado: 'secar',  tanda: 1 },
      { rp: '1003', litrosMañana: null, litrosTarde: null, total: null, estado: 'venta', tanda: 1 },
    ],
  };
  const e = { postData: { contents: JSON.stringify(payload) } };
  const result = doPost(e);
  Logger.log(result.getContent());
}
