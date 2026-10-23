// netlify/functions/telegram.mjs — admin: conectar el bot de avisos (Admin → Inicio → Avisos por Telegram).
//   GET                      → si el bot esta configurado, los chats configurados y los que le escribieron
//                              ultimamente (para copiar el numero a TELEGRAM_CHAT_ID).
//   POST { accion: 'probar' } → manda un mensaje de prueba a los chats configurados.
//   POST { accion: 'resumen' } → corre ahora el seguimiento de las 20:00 (seguimiento-diario).
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { atenderTelegramAdmin } from './lib/telegram.mjs'
import { correrSeguimiento } from './seguimiento-diario.mjs'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': AUTH_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' }

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors }
  const denied = requireAdmin(event, cors)
  if (denied) return denied
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { /* GET sin cuerpo */ }
  if (event.httpMethod === 'POST' && body.accion === 'resumen') {
    try { return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, ...(await correrSeguimiento()) }) } }
    catch (e) { console.error('resumen manual:', e); return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: 'No se pudo leer la planilla o enviar: ' + (e?.message || e) }) } }
  }
  const r = await atenderTelegramAdmin(event.httpMethod, body)
  return { statusCode: r.ok ? 200 : 400, headers: cors, body: JSON.stringify(r) }
}
