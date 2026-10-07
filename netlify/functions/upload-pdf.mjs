// netlify/functions/upload-pdf.mjs
// Recibe pdfBase64 + fileName, sube a Google Drive, retorna URL pública
import { google } from 'googleapis'
import { Readable } from 'stream'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const DRIVE_FOLDER_NAME = 'Cotizaciones Don Maxi'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied

  try {
    const { pdfBase64, fileName, cotNum } = JSON.parse(event.body || '{}')
    if (!pdfBase64) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Falta pdfBase64' }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const drive = google.drive({ version: 'v3', auth })

    // 1. Buscar o crear carpeta
    let folderId = null
    const folderSearch = await drive.files.list({
      q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    })
    if (folderSearch.data.files?.length) {
      folderId = folderSearch.data.files[0].id
    } else {
      const created = await drive.files.create({
        requestBody: { name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id',
      })
      folderId = created.data.id
    }

    // 2. Al regenerar una cotizacion, el PDF anterior va a la papelera (recuperable 30 dias).
    // Se reconoce por la marca cotNum que se le pone al subirlo; antes se buscaba "Cot<numero>"
    // en el nombre, que los archivos nunca tenian, y los PDF viejos se acumulaban.
    const numero = /^\d+$/.test(String(cotNum || '')) ? String(cotNum) : ''
    if (numero) {
      const existing = await drive.files.list({
        q: `appProperties has { key='cotNum' and value='${numero}' } and '${folderId}' in parents and trashed=false`,
        fields: 'files(id)',
        spaces: 'drive',
      })
      for (const f of existing.data.files || []) {
        await drive.files.update({ fileId: f.id, requestBody: { trashed: true } }).catch(() => {})
      }
    }

    // 3. Subir PDF
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    const stream = Readable.from(pdfBuffer)
    const safeName = fileName || `Cotizacion-Cot${cotNum || 'X'}.pdf`

    const uploaded = await drive.files.create({
      requestBody: {
        name: safeName,
        mimeType: 'application/pdf',
        parents: [folderId],
        ...(numero ? { appProperties: { cotNum: numero } } : {}),
      },
      media: { mimeType: 'application/pdf', body: stream },
      fields: 'id,webViewLink,webContentLink',
    })

    const fileId = uploaded.data.id

    // 4. Hacer público (lectura)
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    })

    // URL de descarga directa
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`
    const viewUrl     = uploaded.data.webViewLink

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, fileId, viewUrl, downloadUrl }),
    }
  } catch (err) {
    console.error('upload-pdf error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}
