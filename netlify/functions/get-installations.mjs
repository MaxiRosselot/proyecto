// netlify/functions/get-installations.mjs
// Lee instalaciones agendadas desde Google Calendar
import { google } from 'googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2003'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }

  const pwd = event.headers['x-admin-password']
  if (pwd !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  try {
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client })

    const now = new Date()
    const timeMin = new Date(now); timeMin.setMonth(timeMin.getMonth() - 2)
    const timeMax = new Date(now); timeMax.setMonth(timeMax.getMonth() + 12)

    const list = await calendar.events.list({
      calendarId: process.env.CALENDAR_ID,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      sharedExtendedProperty: 'created_by=instalacion-donmaxi',
    })

    const installations = (list.data.items || []).map(ev => ({
      id:       ev.id,
      nombre:   ev.extendedProperties?.shared?.cliente || ev.summary?.match(/Instalación — (.+?) \(/)?.[1] || '',
      cotNum:   ev.extendedProperties?.shared?.cot_num || '',
      summary:  ev.summary || '',
      start:    ev.start?.dateTime || ev.start?.date || '',
      end:      ev.end?.dateTime   || ev.end?.date   || '',
      link:     ev.htmlLink || '',
    }))

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, installations }),
    }
  } catch (err) {
    console.error('get-installations error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: String(err) }),
    }
  }
}
