// netlify/functions/pagar.mjs — publico. https://<sitio>/pagar?c=<N°>&t=<firma> (redirect en netlify.toml)
// Muestra el monto de la cotizacion y lleva a Mercado Pago. Las reglas viven en lib/pagina-pago.mjs.
import { google } from 'googleapis'
import { almacenSheets } from './lib/cotizaciones.mjs'
import { clienteMercadoPago, configPago } from './lib/mercadopago.mjs'
import { atenderPagar } from './lib/pagina-pago.mjs'

export async function handler(event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Método no permitido' }
  const config = configPago()
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    return await atenderPagar(event.queryStringParameters || {}, {
      config,
      almacen: almacenSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID),
      mp: config && clienteMercadoPago(config.token),
    })
  } catch (err) {
    console.error('pagar error:', err)
    return { statusCode: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: '<p style="font-family:system-ui;padding:24px">No pudimos abrir el pago en este momento. Intenta de nuevo en un minuto o escríbenos por WhatsApp.</p>' }
  }
}
