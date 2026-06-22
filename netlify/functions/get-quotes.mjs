// netlify/functions/get-quotes.mjs
// Lee cotizaciones guardadas desde Google Sheets
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'
const SHEET_ID = process.env.GOOGLE_SHEET_ID
const SHEET_NAME = 'Cotizaciones'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }

  const pwd = event.headers['x-admin-password']
  if (pwd !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  try {
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client })

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:J`,
    }).catch(() => ({ data: { values: [] } }))

    const rows = res.data.values || []
    if (rows.length <= 1) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, quotes: [] }) }
    }

    // Skip header row
    const quotes = rows.slice(1).map(row => ({
      cotNum:      row[0] || '',
      nombre:      row[1] || '',
      email:       row[2] || '',
      telefono:    row[3] || '',
      direccion:   row[4] || '',
      fechaVisita: row[5] || '',
      total:       row[6] || '',
      status:      row[7] || 'por confirmar',
      notas:       row[8] || '',
      createdAt:   row[9] || '',
    }))

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, quotes }),
    }
  } catch (err) {
    console.error('get-quotes error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: String(err) }),
    }
  }
}
