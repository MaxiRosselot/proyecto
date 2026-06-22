// netlify/functions/delete-quote.mjs
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'
const SHEET_ID       = process.env.GOOGLE_SHEET_ID
const SHEET_NAME     = 'Cotizaciones'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  if (event.headers['x-admin-password'] !== ADMIN_PASSWORD)
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }

  try {
    if (!SHEET_ID) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'GOOGLE_SHEET_ID no configurado' }) }

    const { cotNum } = JSON.parse(event.body || '{}')
    if (!cotNum) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Falta cotNum' }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const sheets = google.sheets({ version: 'v4', auth })

    // Encontrar la fila
    const all = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:A` })
    const rows = all.data.values || []
    let rowIndex = -1
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(cotNum)) { rowIndex = i; break }
    }
    if (rowIndex === -1) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Cotizacion no encontrada' }) }

    // Obtener sheetId numérico
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
    const sheet = meta.data.sheets.find(s => s.properties.title === SHEET_NAME)
    if (!sheet) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Hoja no encontrada' }) }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        }],
      },
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('delete-quote error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}
