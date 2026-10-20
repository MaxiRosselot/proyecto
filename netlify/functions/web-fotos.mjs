// netlify/functions/web-fotos.mjs — admin: las fotos del sitio (Admin → Web).
//   GET                                   → todas, por seccion
//   POST { accion: 'subir', seccion, datos (base64), tipo, titulo, categoria }
//   POST { accion: 'borrar', id } | { accion: 'ordenar', seccion, ids } | { accion: 'editar', id, titulo, categoria }
// Se guardan en la carpeta "Web Don Maxi" de Drive (lib/sitio.mjs).
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { almacenFotosDrive, editarFotosWeb, fotosPorSeccion, subirFotoWeb } from './lib/sitio.mjs'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': AUTH_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' }
const responder = (statusCode, body) => ({ statusCode, headers: cors, body: JSON.stringify(body) })

export async function atenderWebFotos(event, almacen) {
  if (event.httpMethod === 'GET') return responder(200, { ok: true, fotos: fotosPorSeccion(await almacen.listar()) })
  if (event.httpMethod !== 'POST') return responder(405, { ok: false, error: 'Método no permitido' })
  const body = JSON.parse(event.body || '{}')
  if (body.accion === 'subir') return responder(200, { ok: true, ...(await subirFotoWeb(almacen, body)) })
  await editarFotosWeb(almacen, body)
  return responder(200, { ok: true })
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors }
  const denied = requireAdmin(event, cors)
  if (denied) return denied
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    return await atenderWebFotos(event, almacenFotosDrive(google.drive({ version: 'v3', auth })))
  } catch (err) {
    if (err?.estado && err.estado < 500) return responder(err.estado, { ok: false, error: err.message })
    console.error('web-fotos error:', err)
    return responder(500, { ok: false, error: 'No se pudo guardar en Drive: ' + (err?.message || err) })
  }
}
