// netlify/functions/pendientes.mjs — Admin → Pendientes (solo admin). Ver lib/pendientes.mjs.
//   GET                                   → { pendientes }
//   POST { accion: 'guardar', pendiente } → crea o edita
//   POST { accion: 'nota', id, texto, estado? } → agrega a la bitacora (y cambia el estado)
//   POST { accion: 'borrar', id }
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { ahoraEnZona } from './lib/horarios.mjs'
import { ErrorPendiente, almacenPendientesSheets, cambiarPendientes, listarPendientes } from './lib/pendientes.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied
  const SHEET_ID = process.env.GOOGLE_SHEET_ID
  if (!SHEET_ID) return responder(500, { ok: false, error: 'GOOGLE_SHEET_ID no configurado' })
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const almacen = almacenPendientesSheets(google.sheets({ version: 'v4', auth }), SHEET_ID)
    const hoy = ahoraEnZona().fecha
    if (event.httpMethod === 'GET') return responder(200, { ok: true, pendientes: await listarPendientes(almacen, hoy) })
    if (event.httpMethod === 'POST') {
      let datos
      try { datos = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'JSON inválido' }) }
      return responder(200, { ok: true, ...(await cambiarPendientes(almacen, datos, hoy)) })
    }
    return responder(405, { ok: false, error: 'Método no permitido' })
  } catch (err) {
    if (err instanceof ErrorPendiente) return responder(err.estado, { ok: false, error: err.message })
    console.error('pendientes error:', err)
    return responder(500, { ok: false, error: 'No se pudieron leer o guardar los pendientes' })
  }
}
