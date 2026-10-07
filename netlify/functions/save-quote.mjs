// netlify/functions/save-quote.mjs
//   { crear: true, cotNum, ... }  → cotizacion nueva. 409 { siguiente } si el numero ya esta tomado.
//   { cotNum, ...campos }          → actualiza solo los campos enviados; 404 si no existe.
// Las reglas viven en lib/cotizaciones.mjs.
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { actualizarCotizacion, almacenSheets, crearCotizacion, respuestaDeError } from './lib/cotizaciones.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const SHEET_ID = process.env.GOOGLE_SHEET_ID

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied

  try {
    if (!SHEET_ID) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'GOOGLE_SHEET_ID no configurado' }) }

    let datos
    try { datos = JSON.parse(event.body || '{}') }
    catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'JSON inválido' }) } }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const almacen = almacenSheets(google.sheets({ version: 'v4', auth }), SHEET_ID)

    const { estado, respuesta } = datos.crear
      ? await crearCotizacion(almacen, datos)
      : await actualizarCotizacion(almacen, datos)
    return { statusCode: estado, headers: corsHeaders, body: JSON.stringify(respuesta) }
  } catch (err) {
    return respuestaDeError(err, corsHeaders)
  }
}
