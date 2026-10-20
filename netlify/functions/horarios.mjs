// netlify/functions/horarios.mjs
//   GET                → publico: dias y horas que el cliente puede elegir
//   GET ?config=1      → admin: la configuracion para editarla
//   POST { semanal, fechas, semanas } → admin: guarda la configuracion
//   ?agenda=instalaciones (GET) o { agenda: 'instalaciones' } (POST): el horario de las instalaciones
//   (pestaña "Horarios instalaciones", lo usa el link /agendar), en vez del de visitas.
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { DURACION_MIN, ErrorHorario, HOJA_HORARIOS, HOJA_HORARIOS_INSTALACIONES, HORARIO_INSTALACIONES, almacenHorariosSheets, diasDisponibles, guardarHorario, leerHorario, validarHorario, HORARIO_POR_DEFECTO } from './lib/horarios.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const SHEET_ID = process.env.GOOGLE_SHEET_ID
const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })

function almacen(instalaciones = false) {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return almacenHorariosSheets(google.sheets({ version: 'v4', auth }), SHEET_ID, instalaciones ? HOJA_HORARIOS_INSTALACIONES : HOJA_HORARIOS)
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const params = event.queryStringParameters || {}

  try {
    if (event.httpMethod === 'GET') {
      const instalaciones = params.agenda === 'instalaciones'
      if (params.config || instalaciones) {
        const denied = requireAdmin(event, corsHeaders)
        if (denied) return denied
      }
      const porDefecto = instalaciones ? HORARIO_INSTALACIONES : HORARIO_POR_DEFECTO
      const config = SHEET_ID ? await leerHorario(almacen(instalaciones), porDefecto) : validarHorario(porDefecto)
      const dias = diasDisponibles(config)
      return responder(200, params.config ? { ok: true, config, dias } : { ok: true, dias, duracion: DURACION_MIN })
    }

    if (event.httpMethod === 'POST') {
      const denied = requireAdmin(event, corsHeaders)
      if (denied) return denied
      if (!SHEET_ID) return responder(500, { ok: false, error: 'GOOGLE_SHEET_ID no configurado' })
      let datos
      try { datos = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'JSON inválido' }) }
      const { agenda, ...horario } = datos
      const config = await guardarHorario(almacen(agenda === 'instalaciones'), horario)
      return responder(200, { ok: true, config, dias: diasDisponibles(config) })
    }

    return responder(405, { ok: false, error: 'Método no permitido' })
  } catch (err) {
    if (err instanceof ErrorHorario) return responder(400, { ok: false, error: err.message })
    console.error('horarios error:', err)
    return responder(500, { ok: false, error: 'No se pudieron leer los horarios' })
  }
}
