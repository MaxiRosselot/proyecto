// netlify/functions/importar-visitas.mjs — admin. Visitas antiguas (Calendly) a la hoja "Visitas".
//   POST { accion: 'simular', csv }  → cuantas entran, repetidas, por estado (no escribe nada)
//   POST { accion: 'importar', csv } → las agrega a la hoja (las repetidas no)
//   POST { accion: 'ubicar' }        → busca comuna y coordenadas de hasta 60 visitas de la hoja que no
//                                      las tienen (con GOOGLE_MAPS_SERVER_KEY); se llama hasta que no queden.
// Reglas en lib/importar-calendly.mjs.
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { almacenSheets, listarCotizaciones } from './lib/cotizaciones.mjs'
import { geocodificar } from './lib/geocodificar.mjs'
import { ENCABEZADOS_VISITAS, leerCSV, visitasDesdeCalendly } from './lib/importar-calendly.mjs'
import { comunaAproximada } from './lib/zonas.mjs'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': AUTH_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })
const HOJA = 'Visitas'
const POR_TANDA = 60

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const denied = requireAdmin(event, corsHeaders)
  if (denied) return denied
  if (event.httpMethod !== 'POST') return responder(405, { ok: false, error: 'Método no permitido' })
  let datos
  try { datos = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'Solicitud inválida' }) }
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const sheets = google.sheets({ version: 'v4', auth })
    const spreadsheetId = process.env.GOOGLE_SHEET_ID
    const filas = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${HOJA}!A:N` }).catch(() => ({ data: { values: [] } }))).data.values || []

    if (datos.accion === 'ubicar') {
      if (!process.env.GOOGLE_MAPS_SERVER_KEY) return responder(400, { ok: false, error: 'Falta GOOGLE_MAPS_SERVER_KEY en Netlify (clave de Google con Geocoding API).' })
      const pendientes = filas.map((f, i) => ({ f, fila: i + 1 })).filter(({ f, fila }) => fila > 1 && f[10] && !f[12] && f[6])
      const tanda = pendientes.slice(0, POR_TANDA)
      const cambios = []
      for (let i = 0; i < tanda.length; i += 10) {
        await Promise.all(tanda.slice(i, i + 10).map(async ({ f, fila }) => {
          const comunaTexto = f[11] || comunaAproximada(f[6]) || ''
          const punto = await geocodificar([f[6], comunaTexto, 'Región Metropolitana'].filter(Boolean).join(', ')).catch(() => null)
          // Sin resultado se marca igual ("-") para no volver a buscarla en cada tanda.
          cambios.push({ range: `${HOJA}!L${fila}:N${fila}`, values: [[comunaAproximada(punto?.comuna) || comunaTexto || punto?.comuna || '', punto ? punto.lat : '-', punto ? punto.lng : '-']] })
        }))
      }
      if (cambios.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: cambios } })
      return responder(200, { ok: true, ubicadas: cambios.filter(c => c.values[0][1] !== '-').length, sinResultado: cambios.filter(c => c.values[0][1] === '-').length, quedan: pendientes.length - tanda.length })
    }

    if (!['simular', 'importar'].includes(datos.accion)) return responder(400, { ok: false, error: 'Acción desconocida' })
    if (typeof datos.csv !== 'string' || !datos.csv.trim()) return responder(400, { ok: false, error: 'Sube el archivo CSV que exporta Calendly' })
    const csv = leerCSV(datos.csv)
    if (!csv.length || !('Invitee UUID' in csv[0] || 'Event UUID' in csv[0])) return responder(400, { ok: false, error: 'Ese archivo no parece un export de Calendly (Events → Export).' })
    const { quotes } = await listarCotizaciones(almacenSheets(sheets, spreadsheetId))
    const { nuevas, resumen } = visitasDesdeCalendly(csv, { cotizaciones: quotes, existentes: new Set(filas.map(f => f[0])) })
    if (datos.accion === 'simular' || !nuevas.length) return responder(200, { ok: true, resumen })

    // Encabezado con las columnas nuevas (K–N) y despues las filas.
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${HOJA}!A1:N1`, valueInputOption: 'RAW', requestBody: { values: [ENCABEZADOS_VISITAS] } })
    await sheets.spreadsheets.values.append({ spreadsheetId, range: `${HOJA}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: nuevas } })
    return responder(200, { ok: true, resumen, importadas: nuevas.length })
  } catch (err) {
    console.error('importar-visitas error:', err)
    return responder(500, { ok: false, error: 'No se pudo: ' + (err?.message || err) })
  }
}
