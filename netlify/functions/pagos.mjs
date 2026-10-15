// netlify/functions/pagos.mjs — admin
//   POST { accion: 'registrar', cotNum, monto, medio, fecha, nota? }
//   POST { accion: 'borrar', cotNum, id }
//   POST { accion: 'boleta', cotNum, id, boleta }   (N° de la boleta emitida en el SII)
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { almacenSheets, respuestaDeError } from './lib/cotizaciones.mjs'
import { anotarBoleta, borrarPago, registrarPago } from './lib/pagos.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied
  if (event.httpMethod !== 'POST') return responder(405, { ok: false, error: 'Método no permitido' })
  try {
    let datos
    try { datos = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'JSON inválido' }) }
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const almacen = almacenSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID)
    if (datos.accion === 'registrar') return responder(200, { ok: true, ...(await registrarPago(almacen, datos)) })
    if (datos.accion === 'borrar') return responder(200, { ok: true, ...(await borrarPago(almacen, datos)) })
    if (datos.accion === 'boleta') return responder(200, { ok: true, ...(await anotarBoleta(almacen, datos)) })
    return responder(400, { ok: false, error: 'Acción desconocida' })
  } catch (err) {
    return respuestaDeError(err, corsHeaders)
  }
}
