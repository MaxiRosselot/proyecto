// netlify/functions/foto.mjs — publico: entrega una foto del sitio (?id=<archivo de Drive>).
// Solo archivos marcados como foto web (lib/sitio.mjs); la CDN la guarda un año, porque cada foto
// subida tiene su propio id y nunca cambia.
import { google } from 'googleapis'
import { almacenFotosDrive } from './lib/sitio.mjs'

export async function handler(event) {
  const id = String(event.queryStringParameters?.id || '')
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const foto = await almacenFotosDrive(google.drive({ version: 'v3', auth })).leer(id)
    if (!foto) return { statusCode: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }, body: 'No encontrada' }
    return {
      statusCode: 200, isBase64Encoded: true, body: foto.datos.toString('base64'),
      headers: { 'Content-Type': foto.tipo, 'Cache-Control': 'public, max-age=31536000, immutable', 'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable, durable' },
    }
  } catch (err) {
    console.error('foto error:', err)
    return { statusCode: 502, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }, body: 'No disponible' }
  }
}
