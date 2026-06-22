// netlify/functions/update-sale.mjs
// Guarda ediciones de venta (ajustes post-instalación + pago) en hoja Instalaciones
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
    const {
      cotNum,
      subtotalRepisas,    // número
      adicionales,        // { qty_retiro_orden, precio_retiro_orden, ... }
      ajusteMonto = 0,    // número (positivo o negativo)
      ajusteNota  = '',
      pago        = 'Pendiente',
    } = JSON.parse(event.body || '{}')

    if (!cotNum)
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Falta cotNum' }) }
    if (!SHEET_ID)
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const sheets = google.sheets({ version: 'v4', auth })

    // Buscar fila por N°Cot (columna H = índice 7)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:T`,
    }).catch(() => ({ data: { values: [] } }))

    const rows = res.data.values || []
    const rowIndex = rows.findIndex((r, i) => i > 0 && String(r[7]) === String(cotNum))

    if (rowIndex < 1)
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Instalación no encontrada para cotNum ' + cotNum }) }

    const rowNum = rowIndex + 1

    // Recalcular subtotal adicionales
    const ADICIONALES_KEYS = ['retiro_orden', 'retiro_basura', 'cajas', 'bici']
    const subtotalAdicionales = ADICIONALES_KEYS.reduce((s, k) => {
      return s + (Number(adicionales?.['qty_' + k] || 0) * Number(adicionales?.['precio_' + k] || 0))
    }, 0)

    const totalBase = subtotalRepisas + subtotalAdicionales
    const total     = totalBase + Number(ajusteMonto)

    // Serializar adicionales como JSON para guardarlo en columna J (índice 9, texto)
    const adicionalesJSON = JSON.stringify(adicionales || {})

    // Actualizar columnas:
    // I (col 9)  = Repisas($)         ← subtotalRepisas
    // J (col 10) = Adicionales($)     ← subtotalAdicionales  (también guardamos JSON en col K/Notas no, usamos col nueva)
    // K (col 11) = Total($)           ← total recalculado
    // Q (col 17) = Pago
    // R (col 18) = AjusteMonto
    // S (col 19) = AjusteNota
    // T (col 20) = AdicionalesJSON    ← para poder releer el desglose

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `${SHEET_NAME}!I${rowNum}`, values: [[String(subtotalRepisas)]] },
          { range: `${SHEET_NAME}!J${rowNum}`, values: [[String(subtotalAdicionales)]] },
          { range: `${SHEET_NAME}!K${rowNum}`, values: [[String(total)]] },
          { range: `${SHEET_NAME}!Q${rowNum}`, values: [[pago]] },
          { range: `${SHEET_NAME}!R${rowNum}`, values: [[String(ajusteMonto)]] },
          { range: `${SHEET_NAME}!S${rowNum}`, values: [[ajusteNota]] },
          { range: `${SHEET_NAME}!T${rowNum}`, values: [[adicionalesJSON]] },
        ],
      },
    })

    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({ ok: true, total }),
    }
  } catch (err) {
    console.error('update-sale error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}
