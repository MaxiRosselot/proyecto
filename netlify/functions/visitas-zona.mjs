// netlify/functions/visitas-zona.mjs — publico, lo usa /visita.
//   GET ?comuna=Ñuñoa → los dias y horas de visita para esa comuna: sin las tomadas ni las que
//   obligarian a cruzar Santiago, con las recomendadas (pegadas a visitas de la zona) marcadas.
// Las reglas viven en lib/zonas.mjs.
import { google } from 'googleapis'
import { almacenHorariosSheets, diasDisponibles, leerHorario } from './lib/horarios.mjs'
import { eventosEntre } from './lib/calendario.mjs'
import { diasParaComuna } from './lib/zonas.mjs'

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })

export async function handler(event) {
  try {
    const comuna = String(event.queryStringParameters?.comuna || '').slice(0, 80)
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const config = await leerHorario(almacenHorariosSheets(google.sheets({ version: 'v4', auth }), process.env.GOOGLE_SHEET_ID))
    const dias = diasDisponibles(config)
    if (!dias.length) return json(200, { ok: true, dias: [] })
    const eventos = await eventosEntre(google.calendar({ version: 'v3', auth }), process.env.CALENDAR_ID, dias[0].fecha, dias.at(-1).fecha)
    const visitas = eventos.filter(e => e.tipo === 'visita' && e.estado !== 'cancelada').map(e => ({ fecha: e.fecha, hora: e.inicio, ubicacion: e.ubicacion }))
    return json(200, { ok: true, dias: diasParaComuna(dias, visitas, comuna) })
  } catch (err) {
    console.error('visitas-zona error:', err)
    return json(500, { ok: false, error: 'No se pudieron cargar las horas.' })
  }
}
