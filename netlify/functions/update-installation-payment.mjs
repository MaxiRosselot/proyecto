// netlify/functions/update-installation-payment.mjs
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'
const SHEET_ID       = process.env.GOOGLE_SHEET_ID
const SHEET_NAME     = 'Instalaciones'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  if (event.headers['x-admin-password'] !== ADMIN_PASSWORD)
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }

  try {
    const { eventId, pago } = JSON.parse(event.body || '{}')
    // pago: 'Pendiente' | 'Parcial' | 'Pagado'
    if (!eventId || !pago)
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Faltan parámetros' }) }

    if (!SHEET_ID)
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const sheets = google.sheets({ version: 'v4', auth })

    // Buscar fila por EventID (columna M = índice 12)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:Q`,
    }).catch(() => ({ data: { values: [] } }))

    const rows = res.data.values || []
    const rowIndex = rows.findIndex((r, i) => i > 0 && r[12] === eventId)

    if (rowIndex < 1)
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Instalación no encontrada' }) }

    const rowNum = rowIndex + 1
    // Columna Q (índice 16) = Pago
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!Q${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[pago]] },
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('update-installation-payment error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}
