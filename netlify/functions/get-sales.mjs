// netlify/functions/get-sales.mjs
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'
const SHEET_ID       = process.env.GOOGLE_SHEET_ID

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  if (event.headers['x-admin-password'] !== ADMIN_PASSWORD)
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }

  try {
    if (!SHEET_ID) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, installations: [] }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const sheets = google.sheets({ version: 'v4', auth })

    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Instalaciones!A:N' })
    const rows = res.data.values || []
    if (rows.length <= 1) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, installations: [] }) }

    // Columnas: Fecha|HoraInicio|HoraFin|Cliente|Email|Tel|Dir|N°Cot|Repisas($)|Adicionales($)|Total($)|Notas|EventID|Creado
    const installations = rows.slice(1).map(r => ({
      fecha:         r[0]  || '',
      horaInicio:    r[1]  || '',
      horaFin:       r[2]  || '',
      nombre:        r[3]  || '',
      email:         r[4]  || '',
      telefono:      r[5]  || '',
      direccion:     r[6]  || '',
      cotNum:        r[7]  || '',
      repisas:       parseFloat(r[8]  || '0') || 0,
      adicionales:   parseFloat(r[9]  || '0') || 0,
      total:         parseFloat(r[10] || '0') || 0,
      notas:         r[11] || '',
      creado:        r[13] || '',
    }))

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, installations }) }
  } catch (err) {
    console.error('get-sales error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}
