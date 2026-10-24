// netlify/functions/visitas-rangos.mjs — publico, lo usa /visita.
//   GET → los dias y rangos de visita (8–11, 11–14, 14–17, 17–20) que todavia tienen cupo.
// El horario y el cupo se editan en Admin → Horarios; las reglas viven en lib/horarios.mjs.
import { google } from 'googleapis'
import { almacenHorariosSheets, diasConRangos, leerHorario, sumarDias, ahoraEnZona } from './lib/horarios.mjs'
import { visitasActivas } from './lib/visitas.mjs'

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })

export async function handler() {
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const config = await leerHorario(almacenHorariosSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID))
    const hoy = ahoraEnZona().fecha
    const visitas = await visitasActivas(google.calendar({ version: 'v3', auth }), process.env.CALENDAR_ID, hoy, sumarDias(hoy, config.semanas * 7))
    return json(200, { ok: true, dias: diasConRangos(config, visitas) })
  } catch (err) {
    console.error('visitas-rangos error:', err)
    return json(500, { ok: false, error: 'No se pudieron cargar los horarios.' })
  }
}
