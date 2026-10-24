// netlify/functions/reserva.mjs — publico, lo usa la pagina /reserva del cliente (link firmado).
//   GET  ?c=&t=  → estado de su cotizacion, bloques libres y formas de pago
//   POST { c, t, accion: 'transferencia' | 'mercadopago', fecha?, inicio?, opcion }
// Las reglas viven en lib/reservas.mjs y lib/reserva-cliente.mjs.
import { clienteMercadoPago, configPago } from './lib/mercadopago.mjs'
import { atenderReservaGet, atenderReservaPost } from './lib/reserva-cliente.mjs'
import { serviciosGoogle } from './lib/google-servicios.mjs'
import { alertarError } from './lib/telegram.mjs'

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })

export async function handler(event) {
  const config = configPago()
  if (!config) return json(503, { ok: false, error: 'La reserva en línea no está configurada' })
  try {
    const deps = { ...serviciosGoogle(), config, mp: config.token ? clienteMercadoPago(config.token) : null }
    if (event.httpMethod === 'GET') return await atenderReservaGet(event.queryStringParameters || {}, deps)
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Método no permitido' })
    let body
    try { body = JSON.parse(event.body || '{}') } catch { return json(400, { ok: false, error: 'Solicitud inválida' }) }
    return await atenderReservaPost(body, deps)
  } catch (err) {
    if (err?.estado && err.estado < 500) return json(err.estado, { ok: false, error: err.message })
    console.error('reserva error:', err)
    await alertarError('la página de reserva y pago del cliente', err)
    return json(500, { ok: false, error: 'No pudimos completar la reserva. Intenta de nuevo en un momento o escríbenos por WhatsApp.' })
  }
}
