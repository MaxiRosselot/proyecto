// netlify/functions/create_event.mjs — publico, lo usa /visita para agendar una visita.
//   POST { nombre, apellido, email, celular, direccion, depto?, comuna?, lat?, lng?, fechaISO, rango, note? }
// El cliente elige dia y rango (8–11, 11–14, 14–17, 17–20); la hora exacta sale despues de la ruta
// del dia (bot de Telegram → Ruta de visitas). Las reglas viven en lib/visitas.mjs y lib/horarios.mjs.
import { google } from 'googleapis'
import { almacenHorariosSheets, leerHorario } from './lib/horarios.mjs'
import { alertarError, avisar, avisoVisitaAgendada } from './lib/telegram.mjs'
import { crearVisita } from './lib/visitas.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  if (event.httpMethod !== 'POST') return responder(405, { ok: false, error: 'Method not allowed' })
  let datos
  try { datos = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'Solicitud inválida' }) }
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const horario = await leerHorario(almacenHorariosSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID))
    const visita = await crearVisita(google.calendar({ version: 'v3', auth }), process.env.CALENDAR_ID, horario, datos)
    await avisar(avisoVisitaAgendada({ nombre: visita.nombre, fecha: datos.fechaISO, hora: visita.rango.desde, hasta: visita.rango.hasta, direccion: visita.direccion, telefono: datos.celular, email: datos.email, comentarios: datos.note }))
    return responder(200, { ok: true, link: visita.link, rango: visita.rango })
  } catch (err) {
    if (err?.estado && err.estado < 500) return responder(err.estado, { ok: false, error: err.estado === 409 ? 'SLOT_TAKEN' : 'INVALID_SLOT', message: err.message })
    console.error('create_event error:', err.response?.data || err)
    await alertarError('agendar una visita desde la web', err)
    return responder(500, { ok: false, error: 'No se pudo agendar. Intenta de nuevo en un momento o escríbenos por WhatsApp.' })
  }
}
