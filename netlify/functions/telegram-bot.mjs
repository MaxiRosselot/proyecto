// netlify/functions/telegram-bot.mjs — el webhook del bot de Telegram (menus, botones, fotos).
// Telegram lo llama con cada mensaje y cada boton; se conecta desde Admin → Inicio → Avisos por
// Telegram → "Activar menú del bot" (telegram.mjs, accion 'webhook'). Solo acepta llamadas con el
// secreto que se le dio a Telegram al conectarlo. Siempre responde 200: si no, Telegram reintenta.
// La logica vive en lib/bot.mjs.
import { atenderUpdate, secretoWebhook } from './lib/bot.mjs'
import { depsBot } from './lib/bot-servicios.mjs'
import { alertarError, configTelegram } from './lib/telegram.mjs'

const ok = { statusCode: 200, body: '' }

export async function handler(event) {
  const config = configTelegram()
  if (!config || event.httpMethod !== 'POST') return { statusCode: 404, body: '' }
  const secreto = event.headers?.['x-telegram-bot-api-secret-token'] || event.headers?.['X-Telegram-Bot-Api-Secret-Token']
  if (secreto !== secretoWebhook(config.token)) return { statusCode: 401, body: '' }
  let update
  try { update = JSON.parse(event.body || '{}') } catch { return ok }
  try { await atenderUpdate(update, depsBot()) }
  catch (err) { console.error('telegram-bot error:', err); await alertarError('el bot de Telegram', err) }
  return ok
}
