// netlify/functions/visita.mjs — admin. Reagendar o cancelar una visita (Admin → Visitas).
//   POST { accion: 'horas' }                          dias y horas libres para moverla
//   POST { accion: 'reagendar', visitId, fecha, hora } mueve el evento del calendario
//   POST { accion: 'liberar', visitId }               al cancelar, deja la hora libre para otro cliente
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { respuestaDeError } from './lib/cotizaciones.mjs'
import { almacenHorariosSheets, leerHorario } from './lib/horarios.mjs'
import { horasParaReagendar, liberarHoraVisita, reagendarVisita } from './lib/visitas.mjs'

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
    const calendar = google.calendar({ version: 'v3', auth }), calendarId = process.env.CALENDAR_ID
    const horario = () => leerHorario(almacenHorariosSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID))
    if (datos.accion === 'horas') return responder(200, { ok: true, dias: await horasParaReagendar(calendar, calendarId, await horario()) })
    if (datos.accion === 'reagendar') return responder(200, { ok: true, ...(await reagendarVisita(calendar, calendarId, await horario(), datos)) })
    if (datos.accion === 'liberar') return responder(200, { ok: true, ...(await liberarHoraVisita(calendar, calendarId, datos.visitId)) })
    return responder(400, { ok: false, error: 'Acción desconocida' })
  } catch (err) {
    return respuestaDeError(err, corsHeaders)
  }
}
