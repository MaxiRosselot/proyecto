// netlify/functions/telegram.mjs — admin: el bot de Telegram (Admin → Inicio → Avisos por Telegram).
//   GET                        → si el bot esta configurado, los chats (admin y maestro), si el menu
//                                del bot esta activo y los chats que le escribieron (para copiar el numero).
//   POST { accion: 'probar' }  → manda un mensaje de prueba a los chats configurados.
//   POST { accion: 'resumen' } → corre ahora el seguimiento de las 20:00 (seguimiento-diario).
//   POST { accion: 'webhook' } → activa el menu del bot (telegram-bot.mjs) y los comandos.
//   POST { accion: 'fichas' }  → manda ahora las fichas de las 07:00 (bot-manana).
import { AUTH_HEADERS, requireAdmin } from './lib/admin-auth.mjs'
import { conectarBot, enviarMananaDelBot, rolesTelegram } from './lib/bot.mjs'
import { depsBot, depsTelegram } from './lib/bot-servicios.mjs'
import { atenderTelegramAdmin, configTelegram } from './lib/telegram.mjs'
import { correrSeguimiento } from './seguimiento-diario.mjs'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': AUTH_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' }
const responder = (statusCode, body) => ({ statusCode, headers: cors, body: JSON.stringify(body) })

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors }
  const denied = requireAdmin(event, cors)
  if (denied) return denied
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { /* GET sin cuerpo */ }
  if (event.httpMethod === 'POST' && ['resumen', 'webhook', 'fichas'].includes(body.accion)) {
    try {
      if (body.accion === 'resumen') return responder(200, { ok: true, ...(await correrSeguimiento()) })
      const config = configTelegram()
      if (!config) return responder(400, { ok: false, error: 'Falta TELEGRAM_BOT_TOKEN en Netlify.' })
      if (body.accion === 'webhook') {
        const base = process.env.SITE_URL || process.env.URL || ''
        return responder(200, { ok: true, ...(await conectarBot({ tg: depsTelegram().tg, token: config.token, base, roles: rolesTelegram() })) })
      }
      return responder(200, { ok: true, ...(await enviarMananaDelBot(depsBot())) })
    } catch (e) {
      console.error(`telegram ${body.accion}:`, e)
      return responder(500, { ok: false, error: 'No se pudo: ' + (e?.message || e) })
    }
  }
  const r = await atenderTelegramAdmin(event.httpMethod, body)
  return responder(r.ok ? 200 : 400, r)
}
