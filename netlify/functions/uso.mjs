// netlify/functions/uso.mjs — registro de uso del panel (solo admin). Ver lib/uso.mjs.
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { almacenUsoSheets, atenderUso } from './lib/uso.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied
  const SHEET_ID = process.env.GOOGLE_SHEET_ID
  if (!SHEET_ID) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'GOOGLE_SHEET_ID no configurado' }) }
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const r = await atenderUso(event, almacenUsoSheets(google.sheets({ version: 'v4', auth }), SHEET_ID))
    return { statusCode: r.estado, headers: corsHeaders, body: JSON.stringify(r.cuerpo) }
  } catch (err) {
    console.error('uso error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'No se pudo leer o anotar el uso' }) }
  }
}
