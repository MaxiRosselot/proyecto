// netlify/functions/mp-webhook.mjs — publico, lo llama Mercado Pago cuando cambia un pago.
// Consulta el pago en la API (no confia en el aviso), lo registra en su cotizacion y avisa por correo.
// Responde 5xx ante fallas pasajeras para que Mercado Pago reintente.
import { google } from 'googleapis'
import { almacenSheets } from './lib/cotizaciones.mjs'
import { enviarCorreoGmail } from './lib/correo.mjs'
import { clienteMercadoPago, configPago } from './lib/mercadopago.mjs'
import { atenderAvisoMercadoPago } from './lib/pagina-pago.mjs'

const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método no permitido' }
  const config = configPago()
  if (!config) return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'Mercado Pago no configurado' }) }
  try {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch { /* algunos avisos vienen solo por query */ }
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const gmail = google.gmail({ version: 'v1', auth })
    return await atenderAvisoMercadoPago({ query: event.queryStringParameters || {}, body, headers: event.headers || {} }, {
      almacen: almacenSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID),
      mp: clienteMercadoPago(config.token),
      secretoAviso: process.env.MP_WEBHOOK_SECRET,
      alRegistrar: r => enviarCorreoGmail(gmail, {
        para: process.env.NOTIFY_EMAIL || 'repisas@donmaxi.cl',
        asunto: `💰 Pago recibido: ${pesos(r.pago.monto)} · Cotización N° ${r.cotNum}`,
        texto: [
          `${r.nombre} pagó ${pesos(r.pago.monto)} por Mercado Pago (cotización N° ${r.cotNum}).`,
          r.oferta && 'Pagó dentro de las 48 horas: la cotización quedó con el 10% de descuento.',
          r.resumen.saldo ? `Saldo pendiente: ${pesos(r.resumen.saldo)}.` : 'La cotización quedó pagada completa.',
          '', 'Quedó registrado en el panel (Cotizaciones → Pagos). Recuerda emitir la boleta en el SII y anotar su número.',
        ].filter(l => l !== false).join('\n'),
      }),
    })
  } catch (err) {
    console.error('mp-webhook error:', err)
    return { statusCode: err.estado && err.estado < 500 ? err.estado : 500, body: JSON.stringify({ ok: false, error: err.message }) }
  }
}
