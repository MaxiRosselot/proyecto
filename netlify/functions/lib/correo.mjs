// Correos con Gmail API (la cuenta del refresh token) con texto, HTML y adjuntos.
const SALTO = '\r\n'

const base64Lineas = buf => Buffer.from(buf).toString('base64').replace(/.{76}(?=.)/g, '$&' + SALTO)
const base64Url = texto => Buffer.from(texto).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
// Encabezados con tildes van codificados; los saltos de linea se quitan para que nadie inyecte
// encabezados propios desde un campo del formulario.
const encabezado = valor => {
  const limpio = String(valor ?? '').replace(/[\r\n]+/g, ' ').trim()
  return /^[\x20-\x7e]*$/.test(limpio) ? limpio : `=?UTF-8?B?${Buffer.from(limpio).toString('base64')}?=`
}

export function armarCorreo({ para, asunto, texto, html, adjuntos = [], responderA }) {
  const mixto = 'mixto-' + Math.random().toString(36).slice(2)
  const alterno = 'alterno-' + Math.random().toString(36).slice(2)
  const partes = [
    `To: ${encabezado(para)}`,
    ...(responderA ? [`Reply-To: ${encabezado(responderA)}`] : []),
    `Subject: ${encabezado(asunto)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixto}"`,
    '',
    `--${mixto}`,
    `Content-Type: multipart/alternative; boundary="${alterno}"`,
    '',
    `--${alterno}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lineas(texto),
    ...(html ? [`--${alterno}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', base64Lineas(html)] : []),
    `--${alterno}--`,
  ]
  for (const a of adjuntos) {
    partes.push(
      `--${mixto}`,
      `Content-Type: ${a.tipo}; name="${encabezado(a.nombre)}"`,
      `Content-Disposition: attachment; filename="${encabezado(a.nombre)}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64Lineas(a.contenido),
    )
  }
  partes.push(`--${mixto}--`, '')
  return partes.join(SALTO)
}

// Traduce el error de Google a la causa y a lo que hay que hacer. Lo usan la cotizacion web
// (queda anotado en la cotizacion) y el boton "Probar correo" del admin.
export function explicarErrorCorreo(error) {
  const detalle = String(error?.response?.data?.error?.message || error?.response?.data?.error_description
    || error?.response?.data?.error || error?.message || error)
  const causas = [
    [/insufficient.*(scope|permission)/i, 'El token de Google no tiene permiso para enviar correos: genera GOOGLE_REFRESH_TOKEN de nuevo con get-refresh-token.mjs.'],
    [/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i, 'La API de Gmail no está habilitada en el proyecto de Google Cloud: actívala en APIs y servicios → Biblioteca → Gmail API.'],
    [/invalid_grant|expired|revoked/i, 'El token de Google expiró o fue revocado: genera GOOGLE_REFRESH_TOKEN de nuevo.'],
    [/invalid_client|unauthorized_client/i, 'GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no corresponden al token.'],
    [/Mail service not enabled|failedPrecondition/i, 'La cuenta que firma el token no tiene Gmail activo.'],
    [/Invalid To header|invalid.*address/i, 'La dirección de correo del destinatario no es válida.'],
  ]
  const causa = causas.find(([patron]) => patron.test(detalle))?.[1] || 'Google rechazó el envío.'
  return { causa, detalle: detalle.slice(0, 300) }
}

export async function enviarCorreoGmail(gmail, correo) {
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: base64Url(armarCorreo(correo)) } })
}
