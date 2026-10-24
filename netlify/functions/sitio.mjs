// netlify/functions/sitio.mjs — publico, lo usa el sitio (repisasdonmaxi.cl).
//   GET                                  → fotos subidas desde Admin → Web, por seccion
//   POST { tipo: 'contacto', ... }       → correo al negocio desde el formulario de contacto
//   POST { tipo: 'fotos-iniciar', ... }  → "Envíanos fotos o un video": crea la carpeta y las subidas
//   POST { tipo: 'fotos-trozo', ... }    → un trozo de un archivo (se reenvia a Drive)
//   POST { tipo: 'fotos-terminar', carpeta } → correo al negocio con la carpeta y acuse al cliente
// Las reglas viven en lib/sitio.mjs.
import { google } from 'googleapis'
import { enviarCorreoGmail } from './lib/correo.mjs'
import { alertarError, avisar, avisoContacto } from './lib/telegram.mjs'
import {
  almacenFotosDrive, almacenSolicitudesDrive, correoContacto, fotosPorSeccion, iniciarSolicitudFotos,
  subirTrozoSolicitud, terminarSolicitudFotos, validarContacto,
} from './lib/sitio.mjs'

const json = (statusCode, body, extra = {}) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }, body: JSON.stringify(body) })

function deps(env = process.env) {
  const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN })
  const drive = google.drive({ version: 'v3', auth })
  const gmail = google.gmail({ version: 'v1', auth })
  return {
    fotos: almacenFotosDrive(drive), solicitudes: almacenSolicitudesDrive(drive, auth),
    enviarCorreo: correo => enviarCorreoGmail(gmail, correo), avisoA: env.NOTIFY_EMAIL || 'repisas@donmaxi.cl', avisar,
  }
}

export async function atenderSitio(event, d) {
  if (event.httpMethod === 'GET') {
    // Cache corto en la CDN: las fotos nuevas aparecen en unos minutos sin pegarle a Drive en cada visita.
    return json(200, { ok: true, fotos: fotosPorSeccion(await d.fotos.listar()) }, { 'Cache-Control': 'public, max-age=60', 'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' })
  }
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Método no permitido' })
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { ok: false, error: 'Solicitud inválida' }) }
  if (body.tipo === 'contacto') {
    const contacto = validarContacto(body)
    await d.enviarCorreo(correoContacto(contacto, d.avisoA))
    await d.avisar?.(avisoContacto(contacto))
    return json(200, { ok: true })
  }
  if (body.tipo === 'fotos-iniciar') return json(200, { ok: true, ...(await iniciarSolicitudFotos(d, body)) })
  if (body.tipo === 'fotos-trozo') return json(200, { ok: true, ...(await subirTrozoSolicitud(d, body)) })
  if (body.tipo === 'fotos-terminar') return json(200, { ok: true, ...(await terminarSolicitudFotos(d, body)) })
  return json(400, { ok: false, error: 'Solicitud inválida' })
}

export async function handler(event) {
  try {
    return await atenderSitio(event, deps())
  } catch (err) {
    if (err?.estado && err.estado < 500) return json(err.estado, { ok: false, error: err.message })
    console.error('sitio error:', err)
    await alertarError('el sitio web (contacto o envío de fotos)', err)
    return json(500, { ok: false, error: 'Algo falló de nuestro lado. Intenta de nuevo o escríbenos por WhatsApp.' })
  }
}
