// netlify/functions/calendario.mjs — admin
//   GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD → eventos del calendario del negocio en ese rango
//   (visitas, instalaciones con su cotizacion y pagos, y el resto de los eventos).
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { almacenSheets, listarCotizaciones } from './lib/cotizaciones.mjs'
import { MAX_DIAS, eventosEntre } from './lib/calendario.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })
const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied

  const { desde = '', hasta = '' } = event.queryStringParameters || {}
  if (!ISO.test(desde) || !ISO.test(hasta) || hasta < desde) return responder(400, { ok: false, error: 'Rango de fechas inválido' })
  if ((Date.parse(hasta) - Date.parse(desde)) / 86400000 > MAX_DIAS) return responder(400, { ok: false, error: `Máximo ${MAX_DIAS} días` })

  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const cotizaciones = process.env.GOOGLE_SHEET_ID
      ? (await listarCotizaciones(almacenSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID))).quotes
      : []
    const eventos = await eventosEntre(google.calendar({ version: 'v3', auth }), process.env.CALENDAR_ID, desde, hasta, cotizaciones)
    return responder(200, { ok: true, eventos })
  } catch (err) {
    console.error('calendario error:', err)
    return responder(500, { ok: false, error: 'No se pudo leer el calendario' })
  }
}
