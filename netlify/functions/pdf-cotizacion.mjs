// netlify/functions/pdf-cotizacion.mjs — solo admin: entrega el PDF de una cotizacion guardado en Drive
// (?id=<archivo de Drive>) para que el panel lo deje adjunto en el chat de WhatsApp. Solo PDFs.
import { google } from 'googleapis'
import { requireAdmin } from './lib/admin-auth.mjs'

const texto = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body })

export async function handler(event) {
  const denied = requireAdmin(event)
  if (denied) return denied
  const id = String(event.queryStringParameters?.id || '')
  if (!/^[\w-]{10,200}$/.test(id)) return texto(400, 'Falta el PDF')
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const drive = google.drive({ version: 'v3', auth })
    const meta = await drive.files.get({ fileId: id, fields: 'mimeType,size' })
    if (meta.data.mimeType !== 'application/pdf') return texto(404, 'No es un PDF')
    if (Number(meta.data.size) > 4.5e6) return texto(413, 'PDF demasiado grande')
    const r = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'arraybuffer' })
    return {
      statusCode: 200, isBase64Encoded: true, body: Buffer.from(r.data).toString('base64'),
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store' },
    }
  } catch (err) {
    console.error('pdf-cotizacion error:', err)
    return texto(502, 'No se pudo traer el PDF de Drive')
  }
}
