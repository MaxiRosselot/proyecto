// Pago en linea de cada cotizacion con Mercado Pago.
//
// Cada cotizacion tiene su link: https://<sitio>/pagar?c=<N°>&t=<firma>. La firma (HMAC) evita que
// alguien recorra numeros y vea cotizaciones ajenas. Al abrirlo, /pagar muestra el monto (total o
// abono del 50%) y crea en ese momento la preferencia de Mercado Pago con el saldo al dia.
// Cuando el pago se aprueba, Mercado Pago avisa a mp-webhook y el pago queda registrado solo.
//
// Mercado Pago y la planilla se inyectan: en Netlify son reales; en local y en los tests, falsos.
// Sin MP_ACCESS_TOKEN todo vuelve al link fijo de siempre (MARCA.linkPago).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { ErrorCotizacion, actualizarCotizacion, obtenerCotizacion } from './cotizaciones.mjs'
import { MARCA, OFERTA } from './marca.mjs'
import { resumenPagos } from './pagos-resumen.mjs'
import { totalesCotizacion } from './totales.mjs'

export const MP_API = 'https://api.mercadopago.com'
export const MEDIO_MP = 'Mercado Pago'

// Lo necesario para cobrar en linea; null si falta algo (se usa el link fijo).
export function configPago(env = process.env) {
  const token = env.MP_ACCESS_TOKEN
  const secreto = env.PAGO_LINK_SECRET || env.ADMIN_SESSION_SECRET
  const base = String(env.SITE_URL || env.URL || '').replace(/\/$/, '')
  return token && secreto && base ? { token, secreto, base } : null
}

export function firmaPago(cotNum, secreto) {
  return createHmac('sha256', secreto).update(`pago:${cotNum}`).digest('base64url').slice(0, 22)
}

export function firmaValida(cotNum, firma, secreto) {
  const esperada = Buffer.from(firmaPago(cotNum, secreto))
  const recibida = Buffer.from(String(firma || ''))
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada)
}

export function linkPagoCotizacion(cotNum, config = configPago()) {
  if (!config || !cotNum) return MARCA.linkPago
  return `${config.base}/pagar?c=${encodeURIComponent(cotNum)}&t=${firmaPago(cotNum, config.secreto)}`
}

// Para el panel: cada cotizacion con su link de pago, que el navegador no puede firmar.
export const conLinkPago = (cotizacion, config = configPago()) => ({ ...cotizacion, linkPago: linkPagoCotizacion(cotizacion.cotNum, config) })

// Lo que el cliente puede pagar hoy. Sin pagos previos: el total o un abono del 50%; si paga
// dentro de las 48 horas de la oferta (y la cotizacion no tiene ya un descuento), con el 10%
// aplicado. Con pagos previos: solo el saldo.
export function opcionesDePago(cotizacion, ahora = Date.now()) {
  const adicionales = cotizacion.adicionales || {}
  const actual = totalesCotizacion(cotizacion.repisas || [], adicionales)
  const total = Number(cotizacion.total) || actual.total
  const { pagado, saldo } = resumenPagos(total, cotizacion.pagos)
  const creado = Number(cotizacion.creadoMs) || 0
  const venceOferta = creado ? creado + OFERTA.horas * 3600000 : 0
  const oferta = !pagado && !actual.descuentoPct && venceOferta > ahora
  const totalAPagar = oferta ? totalesCotizacion(cotizacion.repisas || [], { ...adicionales, descuento_pct: OFERTA.descuento }).total : total
  const opciones = saldo <= 0 ? []
    : pagado ? [{ id: 'saldo', nombre: 'Pagar el saldo', monto: saldo }]
    : [{ id: 'total', nombre: 'Pagar el total', monto: totalAPagar }, { id: 'abono', nombre: 'Abonar el 50%', monto: Math.round(totalAPagar / 2) }]
  return { total, totalAPagar, pagado, saldo, oferta, venceOferta: oferta ? venceOferta : null, opciones }
}

// Preferencia de Checkout Pro para una opcion de pago.
export function preferenciaPago(cotizacion, opcion, { base, firma, oferta }) {
  const volver = `${base}/pagar?c=${encodeURIComponent(cotizacion.cotNum)}&t=${firma}`
  return {
    items: [{
      id: `cot-${cotizacion.cotNum}-${opcion.id}`,
      title: `Cotización N° ${cotizacion.cotNum} · ${opcion.nombre} · Repisas Don Maxi`,
      quantity: 1, currency_id: 'CLP', unit_price: opcion.monto,
    }],
    external_reference: String(cotizacion.cotNum),
    metadata: { cot_num: String(cotizacion.cotNum), opcion: opcion.id, oferta: Boolean(oferta) },
    ...(cotizacion.email ? { payer: { email: cotizacion.email } } : {}),
    notification_url: `${base}/.netlify/functions/mp-webhook`,
    back_urls: { success: volver + '&estado=ok', pending: volver + '&estado=pendiente', failure: volver + '&estado=error' },
    auto_return: 'approved',
    statement_descriptor: 'DON MAXI',
  }
}

// Cliente minimo de la API de Mercado Pago (solo lo que se usa).
export function clienteMercadoPago(token, fetchFn = fetch, api = MP_API) {
  async function llamar(ruta, opciones = {}) {
    const res = await fetchFn(api + ruta, { ...opciones, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) } })
    const datos = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(`Mercado Pago respondió ${res.status}: ${datos.message || datos.error || ''}`.trim()), { estado: res.status >= 500 ? 502 : res.status })
    return datos
  }
  return {
    crearPreferencia: body => llamar('/checkout/preferences', { method: 'POST', body: JSON.stringify(body) }),
    obtenerPago: id => llamar(`/v1/payments/${encodeURIComponent(id)}`),
  }
}

// Valida la firma x-signature que manda Mercado Pago en cada aviso (si se configuro el secreto).
export function avisoAutentico({ firma, requestId, dataId }, secreto) {
  if (!secreto) return true
  const partes = Object.fromEntries(String(firma || '').split(',').map(p => p.split('=').map(x => x.trim())))
  if (!partes.ts || !partes.v1) return false
  const manifiesto = `id:${String(dataId || '').toLowerCase()};request-id:${requestId || ''};ts:${partes.ts};`
  const esperada = Buffer.from(createHmac('sha256', secreto).update(manifiesto).digest('hex'))
  const recibida = Buffer.from(partes.v1)
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada)
}

const fechaChile = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(iso ? new Date(iso) : new Date())

// Registra un pago aprobado de Mercado Pago en su cotizacion. Idempotente: Mercado Pago avisa
// mas de una vez el mismo pago. Si se pago con la oferta de 48 horas, la cotizacion queda con el
// 10% de descuento y su total al dia. Pagar tambien confirma la cotizacion.
export async function registrarPagoMercadoPago(almacen, pago, ahora = new Date()) {
  if (pago?.status !== 'approved') return { registrado: false, motivo: `estado ${pago?.status || 'desconocido'}` }
  const cotNum = String(pago.external_reference || pago.metadata?.cot_num || '')
  const cotizacion = cotNum && await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion) throw new ErrorCotizacion(404, `El pago ${pago.id} no corresponde a ninguna cotización (${cotNum || 'sin referencia'})`)
  const pagos = cotizacion.pagos || []
  const mpId = String(pago.id)
  if (pagos.some(p => p.mpId === mpId)) return { registrado: false, motivo: 'ya registrado', cotNum }

  const cambios = {}
  const conOferta = pago.metadata?.oferta === true || pago.metadata?.oferta === 'true'
  if (conOferta && !pagos.length && !totalesCotizacion(cotizacion.repisas, cotizacion.adicionales).descuentoPct) {
    const adicionales = { ...(cotizacion.adicionales || {}), descuento_pct: OFERTA.descuento }
    const t = totalesCotizacion(cotizacion.repisas || [], adicionales)
    Object.assign(cambios, { adicionales, subtotal: t.subtotal, iva: t.iva, total: t.total })
  }
  const monto = Math.round(Number(pago.transaction_amount) || 0)
  const nuevo = {
    id: `p${ahora.getTime().toString(36)}`, fecha: fechaChile(pago.date_approved), monto, medio: MEDIO_MP,
    nota: `Pago en línea MP #${mpId}${conOferta ? ` · oferta ${OFERTA.descuento}%` : ''}`, registrado: ahora.toISOString(), mpId,
  }
  const todos = [...pagos, nuevo]
  await actualizarCotizacion(almacen, {
    cotNum: cotizacion.cotNum, pagos: todos, ...cambios,
    ...(cotizacion.status === 'por confirmar' ? { status: 'confirmada' } : {}),
  })
  const total = cambios.total ?? cotizacion.total
  return { registrado: true, cotNum: cotizacion.cotNum, nombre: cotizacion.nombre, pago: nuevo, oferta: Boolean(cambios.total), resumen: resumenPagos(total, todos) }
}
