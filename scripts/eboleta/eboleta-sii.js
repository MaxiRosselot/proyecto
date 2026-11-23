// Emision de boletas en el portal gratis e-Boleta del SII (https://eboleta.sii.cl/emitir/).
// Se pega con javascript_tool en la pestaña del portal, con la sesion ya iniciada por Maxi.
// No guarda claves ni toca nada fuera del formulario.
//
// Uso:
//   1) Pegar este archivo completo (define window.__eb y window.__emitirLote).
//   2) Prueba en seco (llena el formulario pero NO emite):
//        await window.__eb.emitir({ monto: 321300, detalle: 'Repisas de madera para bodega - Paola Pedrero' }, { dry: true })
//   3) Lote (corre en segundo plano; el javascript_tool corta a los 45 s):
//        window.__emitirLote([['617', 321300, 'Paola Pedrero', ''], ['1578', 178500, 'Fernando Barriuso', 'fer@x.cl'], ...]); 'lanzado'
//      y revisar cada ~40 s:  window.__log.join(' | ')   (termina con 'FIN')
//   4) Resultados: window.__res  → { cotNum: { ok, folio, pdf, fecha, monto, detalle, correo? } }
//
// Por cada boleta: monto en el teclado (se verifica en pantalla), EMITIR, acepta la alerta de
// montos altos solo si trae el mismo monto, metodo "Transferencia Electrónica", sin receptor (el
// portal exige RUT para el receptor), Detalle activado con el texto. Antes de apretar EMITIR
// compara monto, metodo y detalle con lo pedido: si algo no calza, no emite y el lote se detiene.
// Despues de emitir lee el folio y el link del PDF (vale hasta 2036) y, si hay correo, lo manda
// desde la pantalla de la boleta emitida.
window.__eb = (() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(100); } return null; };
  const activo = () => [...document.querySelectorAll('.v-dialog--active')].find(vis);
  const dlg = () => { const d = activo(); return d && /Emitir e-Boleta/.test(d.innerText) && d.querySelector('.v-select') ? d : null; };
  const alerta = () => { const d = activo(); return d && /punto de emitir/.test(d.innerText) ? d : null; };
  const setText = (input, val) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; input.focus(); s.call(input, val); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); input.blur(); };
  const switchDe = (root, texto) => { const l = [...root.querySelectorAll('label')].find(l => l.innerText.trim() === texto); return l && document.getElementById(l.htmlFor); };
  const toggle = async (root, texto, on) => { const i = switchDe(root, texto); if (!i) throw new Error('sin switch ' + texto); if (i.checked !== on) { i.click(); await sleep(300); } return i.checked; };
  // Al activar Detalle el campo trae "Monto Total" y su etiqueta desaparece: se reconoce por el contador "/ 80".
  const campoDetalle = root => [...root.querySelectorAll('input[type=text]')].find(i => vis(i) && /\/ 80/.test(i.closest('.v-input')?.innerText || ''));
  const boton = (root, t) => [...root.querySelectorAll('button, .v-btn')].find(b => vis(b) && b.innerText.trim() === t);

  async function limpiar() {
    for (let k = 0; k < 3; k++) { const act = activo(); if (!act) return; const b = boton(act, 'CERRAR') || boton(act, 'VOLVER') || boton(act, 'NO'); if (!b) return; b.click(); await sleep(600); }
  }

  async function preparar({ monto, detalle }) {
    await limpiar();
    const main = document.querySelector('main');
    const tecla = t => [...main.querySelectorAll('button')].find(b => b.innerText.trim() === t);
    tecla('delete').click(); await sleep(150);
    for (const d of String(monto)) { tecla(d).click(); await sleep(60); }
    await sleep(200);
    const pantalla = main.innerText.split('\n')[0].replace(/\D/g, '');
    if (pantalla !== String(monto)) throw new Error('monto en pantalla ' + pantalla);
    tecla('EMITIR').click();
    await until(() => dlg() || alerta());
    const a = alerta();
    if (a) {
      if (a.innerText.replace(/\D/g, '').indexOf(String(monto)) < 0) throw new Error('alerta con otro monto: ' + a.innerText);
      boton(a, 'SÍ').click(); await sleep(400);
    }
    const d = await until(dlg); if (!d) throw new Error('no abrio el formulario');
    await sleep(300);
    const sel = [...d.querySelectorAll('.v-select')][2]; // sucursal, tipo de boleta, metodo de pago
    sel.querySelector('.v-select__slot').click(); await sleep(300);
    const op = await until(() => [...document.querySelectorAll('.v-menu__content .v-list-item')].find(o => vis(o) && o.innerText.trim() === 'Transferencia Electrónica'));
    if (!op) throw new Error('sin opcion transferencia'); op.click(); await sleep(300);
    await toggle(d, 'Receptor', false); // apagar el receptor reinicia el detalle: va antes
    await toggle(d, 'Detalle', true);
    setText(campoDetalle(d), detalle);
    await sleep(400);
    const emitir = boton(d, 'EMITIR');
    return { emitir, estado: {
      monto: (d.innerText.match(/\$ ?[\d.]+/) || [''])[0],
      pago: sel.querySelector('.v-select__selection')?.innerText.trim(),
      detalle: campoDetalle(d)?.value,
      emitirHabilitado: !!emitir && !emitir.disabled,
    } };
  }

  async function enviarCorreo(email) {
    const d = activo();
    const i = [...d.querySelectorAll('input[type=text]')].find(i => vis(i) && i.closest('.v-input')?.querySelector('.v-icon')?.innerText.trim() === 'mail');
    if (!i) return 'sin campo correo';
    setText(i, email); await sleep(300);
    const send = [...i.closest('.v-input').querySelectorAll('button, .v-icon')].find(b => b.innerText.trim() === 'send');
    if (!send) return 'sin boton enviar';
    send.click();
    const aviso = await until(() => { const s = [...document.querySelectorAll('.v-snack__content')].find(vis); return s && s.innerText.trim(); }, 6000);
    return aviso || 'enviado (sin aviso visible)';
  }

  async function emitir(b, { dry = false } = {}) {
    const { emitir, estado } = await preparar(b);
    const esperado = '$' + Number(b.monto).toLocaleString('es-CL');
    const ok = estado.monto.replace(/\s/g, '') === esperado && estado.pago === 'Transferencia Electrónica' && estado.detalle === b.detalle && estado.emitirHabilitado;
    if (dry || !ok) return { ok, dry, esperado, estado };
    emitir.click();
    const a = await until(() => [...document.querySelectorAll('.v-dialog a')].find(a => vis(a) && /folio\d+/.test(a.href)), 25000);
    if (!a) return { ok: false, error: 'sin resultado (revisar a mano si se emitio)', estado };
    const res = { ok: true, folio: Number(a.href.match(/folio(\d+)/)[1]), pdf: a.href.replace(/&X-Amzn-Trace-Id=.*$/, ''), fecha: a.href.match(/_(\d{4}-\d{2}-\d{2})\.pdf/)[1], monto: b.monto, detalle: b.detalle };
    if (b.email) { res.email = b.email; res.correo = await enviarCorreo(b.email); }
    return res;
  }

  return { emitir, limpiar };
})();

window.__res = window.__res || {};
window.__emitirLote = lote => {
  window.__log = [];
  (async () => {
    for (const [cotNum, monto, nombre, email] of lote) {
      if (window.__res[cotNum]?.ok) continue; // nunca dos veces la misma venta
      try {
        const detalle = `Repisas de madera para bodega - ${String(nombre).trim().replace(/\s+/g, ' ')}`.slice(0, 80).trim();
        const r = await window.__eb.emitir({ monto, detalle, email });
        window.__res[cotNum] = r;
        window.__log.push(cotNum + ' ' + (r.ok ? r.folio : 'NO ' + JSON.stringify(r)));
        if (!r.ok) break;
      } catch (e) { window.__log.push(cotNum + ' ERR ' + e.message); break; }
    }
    await window.__eb.limpiar();
    window.__log.push('FIN');
  })();
};
'eboleta listo'
