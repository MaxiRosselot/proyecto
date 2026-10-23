// netlify/functions/instalacion.mjs — admin
//   POST { accion: 'agendar', cotNum, fecha, inicio, fin, adicionales, email?, invitar?, notas? }
//   POST { accion: 'invitar', cotNum, email }
// Las reglas viven en lib/instalaciones.mjs.
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { almacenSheets, respuestaDeError } from './lib/cotizaciones.mjs'
import { agendarInstalacion, invitarClienteInstalacion } from './lib/instalaciones.mjs'
import { avisarInstalacionAgendada } from './lib/avisos.mjs'

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
    if (!process.env.GOOGLE_SHEET_ID || !process.env.CALENDAR_ID) return responder(500, { ok: false, error: 'Falta GOOGLE_SHEET_ID o CALENDAR_ID' })
    let datos
    try { datos = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'JSON inválido' }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const almacen = almacenSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID)
    const calendar = google.calendar({ version: 'v3', auth })

    if (datos.accion === 'agendar') {
      const { cotizacion, ...r } = await agendarInstalacion(almacen, calendar, process.env.CALENDAR_ID, datos)
      await avisarInstalacionAgendada(cotizacion, r.instalacion)
      return responder(200, { ok: true, ...r })
    }
    if (datos.accion === 'invitar') return responder(200, { ok: true, ...(await invitarClienteInstalacion(almacen, calendar, process.env.CALENDAR_ID, datos)) })
    return responder(400, { ok: false, error: 'Acción desconocida' })
  } catch (err) {
    return respuestaDeError(err, corsHeaders)
  }
}
