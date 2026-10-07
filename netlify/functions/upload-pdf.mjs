// netlify/functions/upload-pdf.mjs
// Recibe pdfBase64 + fileName, sube a Google Drive, retorna URL pública
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { subirPdfCotizacion } from './lib/drive-pdf.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied

  try {
    const { pdfBase64, fileName, cotNum } = JSON.parse(event.body || '{}')
    if (!pdfBase64) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Falta pdfBase64' }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const subido = await subirPdfCotizacion(google.drive({ version: 'v3', auth }), {
      pdfBuffer: Buffer.from(pdfBase64, 'base64'), fileName, cotNum,
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ...subido }) }
  } catch (err) {
    console.error('upload-pdf error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}
