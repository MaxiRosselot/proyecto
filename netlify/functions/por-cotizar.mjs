// netlify/functions/por-cotizar.mjs — Admin → Por cotizar (solo admin). Ver lib/por-cotizar.mjs.
//   GET  → { anotadas, carpetas }  (anotadas: pestaña "Por cotizar"; carpetas: fotos/videos de la web, 120 días)
//   POST { accion: 'anotar' | 'editar' | 'estado' | 'borrar', ... }
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { ahoraEnZona } from './lib/horarios.mjs'
import { ErrorPorCotizar, almacenPorCotizarSheets, cambiarPorCotizar, carpetaAPendiente, listarPorCotizar } from './lib/por-cotizar.mjs'
import { almacenSolicitudesDrive } from './lib/sitio.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })
const DIAS_CARPETAS = 120

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied
  const SHEET_ID = process.env.GOOGLE_SHEET_ID
  if (!SHEET_ID) return responder(500, { ok: false, error: 'GOOGLE_SHEET_ID no configurado' })
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const almacen = almacenPorCotizarSheets(google.sheets({ version: 'v4', auth }), SHEET_ID)
    const hoy = ahoraEnZona().fecha
    if (event.httpMethod === 'GET') {
      const desde = new Date(Date.now() - DIAS_CARPETAS * 864e5).toISOString().slice(0, 10)
      const [anotadas, carpetas] = await Promise.all([
        listarPorCotizar(almacen, hoy),
        // Si Drive falla, igual se ve lo demas.
        almacenSolicitudesDrive(google.drive({ version: 'v3', auth }), auth).listarAvisadas(desde)
          .then(cs => cs.map(carpetaAPendiente))
          .catch(e => { console.warn('por-cotizar: no se leyeron las carpetas de Drive:', e.message); return null }),
      ])
      return responder(200, { ok: true, anotadas, carpetas: carpetas || [], sinCarpetas: carpetas === null })
    }
    if (event.httpMethod === 'POST') {
      let datos
      try { datos = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'JSON inválido' }) }
      return responder(200, { ok: true, ...(await cambiarPorCotizar(almacen, datos, hoy)) })
    }
    return responder(405, { ok: false, error: 'Método no permitido' })
  } catch (err) {
    if (err instanceof ErrorPorCotizar) return responder(err.estado, { ok: false, error: err.message })
    console.error('por-cotizar error:', err)
    return responder(500, { ok: false, error: 'No se pudo leer o guardar la lista de por cotizar' })
  }
}
