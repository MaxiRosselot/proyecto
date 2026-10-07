// netlify/functions/get-precios.mjs
// Lee la tabla de precios de repisas desde la planilla de Google que mantiene el cliente.
// Esa planilla es la fuente de verdad: si suben los precios de la madera, el cliente edita
// ahi y la cotizacion queda al dia sin tocar el codigo.
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { leerTablaPrecios } from './lib/precios-planilla.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const SHEET_ID = process.env.PRECIOS_SHEET_ID

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied

  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const tabla = await leerTablaPrecios(google.sheets({ version: 'v4', auth }), SHEET_ID)

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, tabla }) }
  } catch (err) {
    console.error('get-precios error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: String(err.message || err) }) }
  }
}
