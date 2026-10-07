// netlify/functions/get-quotes.mjs
//   GET                  → todas, mas nuevas arriba, sin el proyecto 3D (solo si lo tienen)
//   GET ?cotNum=1430     → una, con su proyecto 3D, para reabrirla en el cotizador
//   GET ?siguiente=1     → proximo numero libre
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { NUMERO_INICIAL, almacenSheets, listarCotizaciones, obtenerCotizacion, respuestaDeError, siguienteDisponible } from './lib/cotizaciones.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const SHEET_ID = process.env.GOOGLE_SHEET_ID

const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied

  const params = event.queryStringParameters || {}
  try {
    if (!SHEET_ID) return responder(200, { ok: true, quotes: [], siguiente: NUMERO_INICIAL })

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const almacen = almacenSheets(google.sheets({ version: 'v4', auth }), SHEET_ID)

    if (params.siguiente) return responder(200, { ok: true, siguiente: await siguienteDisponible(almacen) })
    if (params.cotNum) {
      const quote = await obtenerCotizacion(almacen, params.cotNum)
      return quote ? responder(200, { ok: true, quote }) : responder(404, { ok: false, error: 'Cotización no encontrada' })
    }
    return responder(200, { ok: true, ...(await listarCotizaciones(almacen)) })
  } catch (err) {
    return respuestaDeError(err, corsHeaders)
  }
}
