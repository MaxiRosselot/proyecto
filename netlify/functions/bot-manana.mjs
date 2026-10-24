// netlify/functions/bot-manana.mjs — programada: todos los dias a las 07:00 de Chile.
//   - al maestro (TELEGRAM_MAESTRO_CHAT_ID): las fichas de las instalaciones de hoy;
//   - a Maxi: el dia (instalaciones y visitas) con un boton por instalacion.
// netlify.toml la corre a las 10:00 y 11:00 UTC; solo actua la que cae a las 7 h en Chile (con y sin
// horario de verano). El boton del panel la corre a traves de telegram.mjs (accion 'fichas').
import { enviarMananaDelBot } from './lib/bot.mjs'
import { depsBot } from './lib/bot-servicios.mjs'
import { ahoraEnZona } from './lib/horarios.mjs'
import { alertarError, configTelegram } from './lib/telegram.mjs'
import { esProgramada } from './seguimiento-diario.mjs'

const responder = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export async function handler(event) {
  if (!esProgramada(event)) return responder(404, { ok: false })
  if (Math.floor(ahoraEnZona().minutos / 60) !== 7) return responder(200, { ok: true, omitido: 'fuera de las 7 h' })
  if (!configTelegram()) return responder(200, { ok: true, omitido: 'Telegram no configurado' })
  try {
    return responder(200, { ok: true, ...(await enviarMananaDelBot(depsBot())) })
  } catch (err) {
    console.error('bot-manana error:', err)
    await alertarError('las fichas de las 07:00', err)
    return responder(500, { ok: false, error: String(err?.message || err) })
  }
}
