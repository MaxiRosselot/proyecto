// netlify/functions/telegram.mjs — admin: conectar el bot de avisos (Admin → Inicio → Avisos por Telegram).
//   GET                      → si el bot esta configurado, los chats configurados y los que le escribieron
//                              ultimamente (para copiar el numero a TELEGRAM_CHAT_ID).
//   POST { accion: 'probar' } → manda un mensaje de prueba a los chats configurados.
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { atenderTelegramAdmin } from './lib/telegram.mjs'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': AUTH_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' }

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors }
  const denied = requireAdmin(event, cors)
  if (denied) return denied
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { /* GET sin cuerpo */ }
  const r = await atenderTelegramAdmin(event.httpMethod, body)
  return { statusCode: r.ok ? 200 : 400, headers: cors, body: JSON.stringify(r) }
}
