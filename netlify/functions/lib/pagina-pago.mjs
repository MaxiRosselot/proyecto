// /pagar y el aviso de Mercado Pago, sin depender de Netlify: los usan las funciones de Netlify
// y el backend local con los mismos argumentos.
import { obtenerCotizacion } from './cotizaciones.mjs'
import { MARCA, OFERTA, WHATSAPP } from './marca.mjs'
import { avisoAutentico, firmaPago, firmaValida, opcionesDePago, preferenciaPago, registrarPagoMercadoPago } from './mercadopago.mjs'

const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const html = (statusCode, cuerpo) => ({
  statusCode,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
  body: pagina(cuerpo),
})
const redirigir = url => ({ statusCode: 302, headers: { Location: url, 'Cache-Control': 'no-store' }, body: '' })
const hora = ms => new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }).format(new Date(ms))

function pagina(cuerpo) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pagar cotización · Repisas Don Maxi</title><link rel="icon" href="/logo.png">
<style>
:root{--cafe:#5B3A29;--tinta:#2E241C;--suave:#6B5B47;--borde:#ECE6DC;--fondo:#F5F2EC;--verde:#1F7A4D;--ambar:#8A5A12}
*{box-sizing:border-box}body{margin:0;background:var(--fondo);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--tinta)}
main{max-width:460px;margin:0 auto;padding:28px 16px 40px}.logo{display:block;height:44px;margin:0 auto 18px}
.tarjeta{background:#fff;border:1px solid var(--borde);border-radius:16px;padding:22px;box-shadow:0 6px 24px rgba(91,58,41,.08)}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;color:var(--suave)}.total{font-size:30px;font-weight:800;color:var(--cafe);margin:6px 0 2px}
.oferta{background:#FBF0DC;border:1px solid #D9A441;color:var(--ambar);border-radius:12px;padding:10px 12px;font-weight:700;font-size:13.5px;margin:14px 0}
.boton{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-top:10px;padding:15px 16px;border-radius:12px;border:0;font:700 15px system-ui;text-decoration:none;background:var(--cafe);color:#fff}
.boton.sec{background:#fff;color:var(--cafe);border:1.5px solid var(--cafe)}.tachado{text-decoration:line-through;opacity:.6;font-weight:600;font-size:13px;margin-right:6px}
.ok{color:var(--verde)}.nota{font-size:12.5px;margin-top:16px}.transf{margin-top:16px;padding-top:14px;border-top:1px solid var(--borde);font-size:13px;color:var(--suave)}
a.wsp{color:var(--verde);font-weight:700}
</style></head><body><main><img class="logo" src="/logo.png" alt="Repisas Don Maxi">${cuerpo}</main></body></html>`
}

const transferencia = () => `<div class="transf"><strong>¿Prefieres transferir?</strong><br>${escapar(MARCA.razonSocial)} · RUT ${escapar(MARCA.rut)}<br>${escapar(MARCA.banco)} · Cta. ${escapar(MARCA.tipoCuenta)} ${escapar(MARCA.numeroCuenta)}</div>`
const ayuda = cotNum => `<p class="nota">¿Dudas? Escríbenos por <a class="wsp" href="https://wa.me/${WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola, tengo una consulta sobre el pago de la cotización N° ${cotNum}`)}">WhatsApp</a>.</p>`

// GET /pagar?c=&t=[&opcion=total|abono|saldo][&estado=ok|pendiente|error]
export async function atenderPagar(params, { almacen, mp, config, ahora = Date.now() }) {
  const cotNum = String(params.c || '').trim()
  if (!config) return redirigir(MARCA.linkPago)
  if (!/^\d{1,9}$/.test(cotNum) || !firmaValida(cotNum, params.t, config.secreto)) {
    return html(404, '<div class="tarjeta"><h1>Link no válido</h1><p>Revisa que el link esté completo o pídenos uno nuevo.</p></div>')
  }
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion || cotizacion.status === 'rechazada') return html(404, '<div class="tarjeta"><h1>Cotización no disponible</h1><p>Escríbenos y te enviamos una actualizada.</p>' + ayuda(cotNum) + '</div>')
  const nombre = escapar(String(cotizacion.nombre || '').trim().split(/\s+/)[0])
  const info = opcionesDePago(cotizacion, ahora)

  if (params.estado === 'ok' || params.estado === 'pendiente') {
    const listo = params.estado === 'ok'
    return html(200, `<div class="tarjeta"><h1 class="${listo ? 'ok' : ''}">${listo ? '¡Pago recibido! ✓' : 'Pago en proceso'}</h1>
<p>${listo ? `Gracias${nombre ? ', ' + nombre : ''}. Tu pago de la cotización N° ${cotNum} quedó registrado y te contactaremos para coordinar la instalación.` : 'Mercado Pago está procesando tu pago. Te avisaremos apenas se confirme.'}</p>${ayuda(cotNum)}</div>`)
  }
  if (!info.opciones.length) {
    return html(200, `<div class="tarjeta"><h1 class="ok">Cotización pagada ✓</h1><p>La cotización N° ${cotNum} no tiene saldo pendiente. ¡Gracias!</p>${ayuda(cotNum)}</div>`)
  }

  const opcion = info.opciones.find(o => o.id === params.opcion)
  if (opcion) {
    const pref = await mp.crearPreferencia(preferenciaPago(cotizacion, opcion, { base: config.base, firma: firmaPago(cotNum, config.secreto), oferta: info.oferta }))
    return redirigir(pref.init_point)
  }

  const link = id => `/pagar?c=${encodeURIComponent(cotNum)}&t=${encodeURIComponent(params.t)}&opcion=${id}`
  const error = params.estado === 'error' ? '<p style="color:#B91C1C;font-weight:700">El pago no se completó. Puedes intentarlo de nuevo.</p>' : ''
  const botones = info.opciones.map((o, i) => `<a class="boton${i ? ' sec' : ''}" href="${link(o.id)}"><span>${escapar(o.nombre)}</span><span>${o.id === 'total' && info.oferta ? `<span class="tachado">${pesos(info.total)}</span>` : ''}${pesos(o.monto)}</span></a>`).join('')
  return html(200, `<div class="tarjeta">${error}<h1>Hola${nombre ? ' ' + nombre : ''} 👋</h1>
<p>Cotización N° ${cotNum} · Repisas Don Maxi</p>
<div class="total">${pesos(info.pagado ? info.saldo : info.totalAPagar)}</div><p>${info.pagado ? `Saldo pendiente (ya pagaste ${pesos(info.pagado)})` : 'Total con IVA incluido'}</p>
${info.oferta ? `<div class="oferta">⏱ Precio con ${OFERTA.descuento}% de descuento si pagas antes del ${escapar(hora(info.venceOferta))}</div>` : ''}
${botones}
<p class="nota">Pagas en Mercado Pago con débito, crédito (hasta 3 cuotas sin interés) o saldo. Puedes abonar el 50% ahora y el resto al terminar la instalación.</p>
${transferencia()}${ayuda(cotNum)}</div>`)
}

// POST del aviso de Mercado Pago. Solo confia en lo que devuelve la API al consultar el pago.
export async function atenderAvisoMercadoPago({ query = {}, body = {}, headers = {} }, { almacen, mp, secretoAviso, alRegistrar }) {
  const tipo = body.type || body.topic || query.type || query.topic
  const dataId = body.data?.id || query['data.id'] || query.id
  if (tipo !== 'payment' || !dataId) return { statusCode: 200, body: JSON.stringify({ ok: true, ignorado: tipo || 'sin tipo' }) }
  if (!avisoAutentico({ firma: headers['x-signature'], requestId: headers['x-request-id'], dataId }, secretoAviso)) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Firma inválida' }) }
  }
  const pago = await mp.obtenerPago(dataId)
  let r
  try { r = await registrarPagoMercadoPago(almacen, pago) }
  catch (e) {
    // Un pago que no es de una cotizacion (otro cobro de la cuenta): se ignora para que no reintente.
    if (e.estado === 404) { console.warn(e.message); return { statusCode: 200, body: JSON.stringify({ ok: true, ignorado: e.message }) } }
    throw e
  }
  if (r.registrado && alRegistrar) await alRegistrar(r).catch(e => console.warn('Aviso de pago no enviado:', e.message))
  return { statusCode: 200, body: JSON.stringify({ ok: true, ...r }) }
}
