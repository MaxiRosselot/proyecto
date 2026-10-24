// netlify/functions/mp-webhook.mjs — publico, lo llama Mercado Pago cuando cambia un pago.
// Consulta el pago en la API (no confia en el aviso), lo registra en su cotizacion, agenda la
// instalacion si venia de una reserva y avisa por correo. Responde 5xx ante fallas pasajeras para
// que Mercado Pago reintente.
import { clienteMercadoPago, configPago } from './lib/mercadopago.mjs'
import { atenderAvisoMercadoPago } from './lib/reserva-cliente.mjs'
import { serviciosGoogle } from './lib/google-servicios.mjs'
import { fechaLarga } from './lib/mensajes.mjs'
import { alertarError } from './lib/telegram.mjs'

const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método no permitido' }
  const config = configPago()
  if (!config?.token) return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'Mercado Pago no configurado' }) }
  try {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch { /* algunos avisos vienen solo por query */ }
    const google = serviciosGoogle()
    return await atenderAvisoMercadoPago({ query: event.queryStringParameters || {}, body, headers: event.headers || {} }, {
      ...google, config, mp: clienteMercadoPago(config.token), secretoAviso: process.env.MP_WEBHOOK_SECRET,
      alRegistrar: r => google.enviarCorreo({
        para: google.avisoA,
        asunto: `💰 Pago recibido: ${pesos(r.pago.monto)} · Cotización N° ${r.cotNum}`,
        texto: [
          `${r.nombre} pagó ${pesos(r.pago.monto)} por Mercado Pago (cotización N° ${r.cotNum}).`,
          r.instalacion && `Su instalación quedó agendada para el ${fechaLarga(r.instalacion.fecha).toLowerCase()}, de ${r.instalacion.inicio} a ${r.instalacion.fin} hrs (se le envió la invitación).`,
          r.resumen.saldo ? `Saldo pendiente: ${pesos(r.resumen.saldo)}.` : 'La cotización quedó pagada completa.',
          '', 'Quedó registrado en el panel (Cotizaciones → Pagos). Recuerda emitir la boleta en el SII y anotar su número.',
        ].filter(l => l !== false && l !== null && l !== undefined).join('\n'),
      }),
    })
  } catch (err) {
    console.error('mp-webhook error:', err)
    await alertarError('el aviso de pago de Mercado Pago', err)
    return { statusCode: err.estado && err.estado < 500 ? err.estado : 500, body: JSON.stringify({ ok: false, error: err.message }) }
  }
}
