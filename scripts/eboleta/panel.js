// Lado del panel (https://repisasdonmaxi.cl/admin, con sesion): leer las boletas por emitir y
// registrar las emitidas. Se pega con javascript_tool en la pestaña del panel.
//
//   await window.__dte.pendientes('2026-11')   → { boletas: [[cotNum, total, nombre, email]...], total, facturas: [...] }
//        (sin mes: todas). El arreglo "boletas" va tal cual a window.__emitirLote en el portal.
//   await window.__dte.registrar(resultados)   → guarda B + folio + PDF en cada venta (seccion DTE).
//        resultados: el JSON de window.__res del portal (copiarlo con JSON.stringify).
//
// Antes de registrar compara cada monto con el total de la venta: si no calza, no la toca.
// La planilla de Google limita las lecturas por minuto: va de a una con pausa y reintenta.
window.__dte = (() => {
  const token = () => { const t = JSON.parse(sessionStorage.getItem('dm_admin_session') || 'null'); return t?.token || t; };
  const api = (ruta, body) => fetch('/.netlify/functions/' + ruta, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const corregir = n => String(n || '').trim().replace(/\s+/g, ' ');

  async function pendientes(mes = '') {
    const { quotes } = await api('get-quotes');
    const l = quotes.filter(q => q.status !== 'rechazada' && String(q.instalacion?.documento || '').includes('*') && (q.instalacion?.fecha || '').startsWith(mes))
      .sort((a, b) => (a.instalacion.fecha || '').localeCompare(b.instalacion.fecha || ''));
    const esFactura = q => /F/.test(q.instalacion.documento);
    const conMp = q => /^M/.test(q.instalacion.documento); // parte por Mercado Pago: revisar a mano cuanto va en la boleta
    const boletas = l.filter(q => !esFactura(q) && !conMp(q)).map(q => [String(q.cotNum), Number(q.total), corregir(q.nombre), q.email || '']);
    return {
      boletas, total: boletas.reduce((s, b) => s + b[1], 0),
      facturas: l.filter(esFactura).map(q => [String(q.cotNum), Number(q.total), corregir(q.nombre), q.instalacion.documento]),
      revisarAMano: l.filter(q => !esFactura(q) && conMp(q)).map(q => [String(q.cotNum), Number(q.total), corregir(q.nombre), q.instalacion.documento]),
    };
  }

  async function registrar(resultados) {
    const { quotes } = await api('get-quotes');
    const out = [];
    for (const [cotNum, r] of Object.entries(resultados)) {
      if (!r.ok) { out.push(cotNum + ' no emitida'); continue; }
      const q = quotes.find(x => String(x.cotNum) === cotNum);
      if (!q || Number(q.total) !== Number(r.monto)) { out.push(cotNum + ' NO CALZA (' + q?.total + ' vs ' + r.monto + ')'); continue; }
      if (q.instalacion?.dte?.folio === r.folio) { out.push(cotNum + ' ya estaba'); continue; }
      const cambios = { documento: String(q.instalacion.documento).replace(/\*/g, ''), dte: { tipo: 'boleta', folio: r.folio, fecha: r.fecha, monto: r.monto, detalle: r.detalle, via: 'e-Boleta SII', pdf: r.pdf, ...(r.email ? { receptor: r.email } : {}) } };
      for (let intento = 0; intento < 4; intento++) {
        const res = await api('planilla', { accion: 'actualizar', cotNum, cambios });
        if (res.ok) { out.push(cotNum + ' B ' + r.folio); break; }
        if (!/pausa/.test(res.error || '') || intento === 3) { out.push(cotNum + ' ERR ' + res.error); break; }
        await sleep(20000);
      }
      await sleep(1500);
    }
    return out;
  }

  return { pendientes, registrar };
})();
'dte listo'
