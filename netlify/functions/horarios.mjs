// netlify/functions/horarios.mjs
//   GET                → publico: dias y horas que el cliente puede elegir
//   GET ?config=1      → admin: la configuracion para editarla
//   POST { semanal, fechas, semanas } → admin: guarda la configuracion
import { google } from 'googleapis'
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { DURACION_MIN, ErrorHorario, almacenHorariosSheets, diasDisponibles, guardarHorario, leerHorario, validarHorario, HORARIO_POR_DEFECTO } from './lib/horarios.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': AUTH_HEADERS,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const SHEET_ID = process.env.GOOGLE_SHEET_ID
const responder = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })

function almacen() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return almacenHorariosSheets(google.sheets({ version: 'v4', auth }), SHEET_ID)
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders }
  const params = event.queryStringParameters || {}

  try {
    if (event.httpMethod === 'GET') {
      if (params.config) {
        const denied = requireAdmin(event, corsHeaders)
        if (denied) return denied
      }
      const config = SHEET_ID ? await leerHorario(almacen()) : validarHorario(HORARIO_POR_DEFECTO)
      const dias = diasDisponibles(config)
      return responder(200, params.config ? { ok: true, config, dias } : { ok: true, dias, duracion: DURACION_MIN })
    }

    if (event.httpMethod === 'POST') {
      const denied = requireAdmin(event, corsHeaders)
      if (denied) return denied
      if (!SHEET_ID) return responder(500, { ok: false, error: 'GOOGLE_SHEET_ID no configurado' })
      let datos
      try { datos = JSON.parse(event.body || '{}') } catch { return responder(400, { ok: false, error: 'JSON inválido' }) }
      const config = await guardarHorario(almacen(), datos)
      return responder(200, { ok: true, config, dias: diasDisponibles(config) })
    }

    return responder(405, { ok: false, error: 'Método no permitido' })
  } catch (err) {
    if (err instanceof ErrorHorario) return responder(400, { ok: false, error: err.message })
    console.error('horarios error:', err)
    return responder(500, { ok: false, error: 'No se pudieron leer los horarios' })
  }
}
