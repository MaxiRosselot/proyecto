// netlify/functions/delete-quote.mjs
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { almacenSheets, borrarCotizacion, respuestaDeError } from './lib/cotizaciones.mjs'

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

    const { cotNum } = JSON.parse(event.body || '{}')
    if (!cotNum) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Falta cotNum' }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const { estado, respuesta } = await borrarCotizacion(almacenSheets(google.sheets({ version: 'v4', auth }), SHEET_ID), cotNum)
    return { statusCode: estado, headers: corsHeaders, body: JSON.stringify(respuesta) }
  } catch (err) {
    return respuestaDeError(err, corsHeaders)
  }
}
