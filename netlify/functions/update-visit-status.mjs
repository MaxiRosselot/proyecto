// netlify/functions/update-visit-status.mjs
// Escribe/actualiza el estado de una visita en Google Sheets
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'
const SHEET_ID = process.env.GOOGLE_SHEET_ID
const SHEET_NAME = 'Visitas'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders }
  }

  const pwd = event.headers['x-admin-password']
  if (pwd !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  try {
    const { visitId, nombre, fecha, hora, email, celular, direccion, status, notas } = JSON.parse(event.body || '{}')

    if (!visitId || !status) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Faltan parámetros' }) }
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client })

    // Buscar si el visitId ya existe en la hoja
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:A`,
    })

    const rows = readRes.data.values || []
    let rowIndex = -1
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === visitId) { rowIndex = i + 1; break } // 1-based
    }

    const updatedAt = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })
    const rowData = [visitId, nombre || '', fecha || '', hora || '', email || '', celular || '', direccion || '', status, notas || '', updatedAt]

    if (rowIndex > 0) {
      // Actualizar fila existente
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A${rowIndex}:J${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] },
      })
    } else {
      // Si la hoja está vacía, agregar encabezado primero
      if (rows.length === 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [['ID', 'Nombre', 'Fecha', 'Hora', 'Email', 'Celular', 'Dirección', 'Estado', 'Notas', 'Actualizado']] },
        })
      }
      // Agregar nueva fila
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] },
      })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true }),
    }
  } catch (err) {
    console.error('update-visit-status error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: String(err) }),
    }
  }
}
