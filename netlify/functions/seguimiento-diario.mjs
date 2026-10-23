// netlify/functions/seguimiento-diario.mjs — programada: todos los dias a las 20:00 de Chile.
//   - correo de seguimiento a las cotizaciones "por confirmar" de hace 3 y 7 dias;
//   - Telegram a Maxi: las instalaciones de mañana (un mensaje por cada una, para copiar al cliente)
//     y las cotizaciones sin respuesta.
// netlify.toml la corre a las 23:00 y 00:00 UTC; solo actua la que cae a las 20 h en Chile (asi
// sirve con y sin horario de verano). Netlify no deja llamar por URL a una funcion programada: el
// boton del panel la corre a traves de telegram.mjs (correrSeguimiento).
// Las reglas viven en lib/seguimiento.mjs.
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { almacenSheets, listarCotizaciones } from './lib/cotizaciones.mjs'
import { enviarCorreoGmail } from './lib/correo.mjs'
import { ahoraEnZona } from './lib/horarios.mjs'
import { linkAgenda } from './lib/mercadopago.mjs'
import { ejecutarSeguimiento } from './lib/seguimiento.mjs'
import { enviarTelegram } from './lib/telegram.mjs'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': AUTH_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' }
const responder = (statusCode, body) => ({ statusCode, headers: cors, body: JSON.stringify(body) })

// Lee las cotizaciones de la planilla y manda correos y avisos (de hoy en Chile).
export async function correrSeguimiento() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  const gmail = google.gmail({ version: 'v1', auth })
  const { quotes } = await listarCotizaciones(almacenSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID))
  return ejecutarSeguimiento({
    cotizaciones: quotes, hoy: ahoraEnZona().fecha, linkAgenda: cotNum => linkAgenda(cotNum),
    enviarCorreo: correo => enviarCorreoGmail(gmail, correo), avisoA: process.env.NOTIFY_EMAIL || 'repisas@donmaxi.cl',
    telegram: (texto, opciones) => enviarTelegram(texto, opciones),
  })
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors }
  if (event.httpMethod === 'POST') {
    const denied = requireAdmin(event, cors)
    if (denied) return denied
  } else if (Math.floor(ahoraEnZona().minutos / 60) !== 20) return responder(200, { ok: true, omitido: 'fuera de las 20 h' })

  try {
    return responder(200, { ok: true, ...(await correrSeguimiento()) })
  } catch (err) {
    console.error('seguimiento-diario error:', err)
    return responder(500, { ok: false, error: String(err?.message || err) })
  }
}
