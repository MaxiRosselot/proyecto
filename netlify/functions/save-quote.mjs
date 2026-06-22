// netlify/functions/save-quote.mjs
// Guarda una cotización generada en la pestaña "Cotizaciones" de Google Sheets
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'
const SHEET_ID = process.env.GOOGLE_SHEET_ID
const SHEET_NAME = 'Cotizaciones'

const HEADERS = ['N° Cot', 'Nombre', 'Email', 'Teléfono', 'Dirección', 'Fecha Visita', 'Total', 'Estado', 'Notas', 'Creado']

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }

  const pwd = event.headers['x-admin-password']
  if (pwd !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  try {
    const {
      cotNum, nombre, email, telefono, direccion,
      fechaVisita, total, notas, status = 'por confirmar',
    } = JSON.parse(event.body || '{}')

    if (!cotNum || !nombre) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Faltan parámetros' }) }
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client })

    // Verificar si existe la hoja, si no, crear encabezado
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1:A1`,
    }).catch(() => ({ data: { values: [] } }))

    const hasHeader = readRes.data.values?.length > 0

    if (!hasHeader) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      })
    }

    // Buscar si ya existe esta cotización por número
    const allRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:A`,
    }).catch(() => ({ data: { values: [] } }))

    const allRows = allRes.data.values || []
    let rowIndex = -1
    for (let i = 1; i < allRows.length; i++) { // skip header
      if (String(allRows[i][0]) === String(cotNum)) { rowIndex = i + 1; break }
    }

    const createdAt = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })
    const rowData = [String(cotNum), nombre, email || '', telefono || '', direccion || '', fechaVisita || '', total || '', status, notas || '', createdAt]

    if (rowIndex > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A${rowIndex}:J${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] },
      })
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] },
      })
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('save-quote error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}
