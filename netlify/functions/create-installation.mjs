// netlify/functions/create-installation.mjs
// Agenda una instalación en Google Calendar
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
  // dateStr: "YYYY-MM-DD", timeStr: "HH:mm"
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, min]  = timeStr.split(':').map(Number)
  return new Date(y, m - 1, d, h, min, 0)
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }

  const pwd = event.headers['x-admin-password']
  if (pwd !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  try {
    const {
      nombre, email, telefono, direccion,
      fecha,        // "YYYY-MM-DD"
      horaInicio,   // "HH:mm"
      horaFin,      // "HH:mm"
      notas = '',
      cotNum = '',
    } = JSON.parse(event.body || '{}')

    if (!nombre || !fecha || !horaInicio || !horaFin) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Faltan parámetros (nombre, fecha, horaInicio, horaFin)' }) }
    }

    const tz = 'America/Santiago'

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client })

    const startLocal = parseLocalDateTime(fecha, horaInicio)
    const endLocal   = parseLocalDateTime(fecha, horaFin)

    if (endLocal <= startLocal) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'La hora de fin debe ser posterior a la hora de inicio' }) }
    }

    const summary = `Instalación — ${nombre} (Repisas Don Maxi)`
    const description = [
      `Cliente: ${nombre}`,
      email    ? `Email: ${email}`       : '',
      telefono ? `Teléfono: ${telefono}` : '',
      direccion ? `Dirección: ${direccion}` : '',
      cotNum   ? `Cotización N°: ${cotNum}` : '',
      notas    ? `\nNotas:\n${notas}`    : '',
    ].filter(Boolean).join('\n')

    const attendees = email ? [{ email }] : []

    const response = await calendar.events.insert({
      calendarId: process.env.CALENDAR_ID,
      sendUpdates: attendees.length ? 'all' : 'none',
      requestBody: {
        summary,
        description,
        start: { dateTime: fmtLocal(startLocal), timeZone: tz },
        end:   { dateTime: fmtLocal(endLocal),   timeZone: tz },
        attendees,
        reminders: { useDefault: true },
        extendedProperties: {
          shared: {
            created_by: 'instalacion-donmaxi',
            cliente:    nombre,
            cot_num:    String(cotNum),
          },
        },
      },
    })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, link: response.data.htmlLink, eventId: response.data.id }),
    }
  } catch (err) {
    console.error('create-installation error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: String(err) }),
    }
  }
}
