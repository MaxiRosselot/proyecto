// netlify/functions/reschedule-installation.mjs
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'

function fmtLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}
function parseLocalDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, min]  = timeStr.split(':').map(Number)
  return new Date(y, m - 1, d, h, min, 0)
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  if (event.headers['x-admin-password'] !== ADMIN_PASSWORD)
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }

  try {
    const { eventId, fecha, horaInicio, horaFin, notas } = JSON.parse(event.body || '{}')
    if (!eventId || !fecha || !horaInicio || !horaFin)
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Faltan parámetros' }) }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth })

    const tz = 'America/Santiago'
    const startLocal = parseLocalDateTime(fecha, horaInicio)
    const endLocal   = parseLocalDateTime(fecha, horaFin)
    if (endLocal <= startLocal)
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Hora fin debe ser posterior' }) }

    // Obtener evento actual
    const existing = await calendar.events.get({ calendarId: process.env.CALENDAR_ID, eventId })
    const ev = existing.data

    // Actualizar solo fecha/hora/notas, mantener resumen y asistentes
    const patch = {
      start: { dateTime: fmtLocal(startLocal), timeZone: tz },
      end:   { dateTime: fmtLocal(endLocal),   timeZone: tz },
    }
    if (notas !== undefined) {
      // Mantener descripción original + agregar nota de reagendado
      const oldDesc = ev.description || ''
      const reagendadoLine = `\n[Reagendado el ${new Date().toLocaleDateString('es-CL')}]`
      patch.description = oldDesc.includes('[Reagendado') ? oldDesc : oldDesc + reagendadoLine
    }

    const updated = await calendar.events.patch({
      calendarId: process.env.CALENDAR_ID,
      eventId,
      sendUpdates: (ev.attendees?.length) ? 'all' : 'none',
      requestBody: patch,
    })

    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({ ok: true, link: updated.data.htmlLink }),
    }
  } catch (err) {
    console.error('reschedule error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}
