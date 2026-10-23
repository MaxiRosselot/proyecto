// Lo que manda cada noche a las 8 pm la funcion seguimiento-diario (sin Google, para probarlo):
//  - correo de seguimiento a cada cliente con su cotizacion "por confirmar" hace 3 o 7 dias;
//  - a Maxi por Telegram: las cotizaciones sin respuesta (3, 7 y 14 dias) y, por cada instalacion
//    de mañana, el mensaje para copiar y mandarle al cliente por WhatsApp.
// Corre una vez al dia, asi que "hace 3 dias" no se repite: no hay que guardar a quien se le escribio.
import { correoSeguimientoCotizacion, fechaLarga, linkWhatsapp, mensajeInstalacionManana } from './mensajes.mjs'
import { sumarDias } from './horarios.mjs'
import { avisoSinRespuesta, confirmacionCortaInstalacion, fichaCotizacion } from './telegram.mjs'

export const DIAS_CORREO = [3, 7]
export const DIAS_AVISO = [3, 7, 14]
const ZONA = 'America/Santiago'
const fechaDe = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: ZONA })
const correoValido = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim())

// Dias de calendario (en Chile) entre que se creo la cotizacion y hoy.
export function diasDesde(creadoMs, hoy) {
  if (creadoMs == null) return null
  const desde = fechaDe(creadoMs)
  return Math.round((Date.parse(hoy + 'T12:00:00Z') - Date.parse(desde + 'T12:00:00Z')) / 864e5)
}

export function planSeguimiento({ cotizaciones = [], hoy, linkAgenda = () => '' }) {
  const manana = sumarDias(hoy, 1)
  const porConfirmar = cotizaciones
    .filter(q => q.status === 'por confirmar')
    .map(q => ({ q, dias: diasDesde(q.creadoMs, hoy) }))
    .filter(x => x.dias != null)

  const correos = porConfirmar
    .filter(({ q, dias }) => DIAS_CORREO.includes(dias) && correoValido(q.email))
    .map(({ q, dias }) => ({ cotNum: q.cotNum, correo: { para: q.email.trim(), ...correoSeguimientoCotizacion(q, { dias, linkAgenda: linkAgenda(q.cotNum) }) } }))
  const conCorreo = new Set(correos.map(c => String(c.cotNum)))

  const sinRespuesta = porConfirmar
    .filter(({ dias }) => DIAS_AVISO.includes(dias))
    .map(({ q, dias }) => ({ cotNum: q.cotNum, nombre: q.nombre, telefono: q.telefono, total: q.total, dias, correo: conCorreo.has(String(q.cotNum)) }))
    .sort((a, b) => b.dias - a.dias)

  const instalaciones = cotizaciones
    .filter(q => q.status !== 'rechazada' && q.instalacion?.fecha === manana && q.instalacion.inicio && !q.instalacion.instalada)
    .sort((a, b) => String(a.instalacion.inicio).localeCompare(String(b.instalacion.inicio)))
    .map(q => {
      const mensaje = mensajeInstalacionManana(q, q.instalacion)
      return {
        cotNum: q.cotNum, nombre: q.nombre, inicio: q.instalacion.inicio, fin: q.instalacion.fin,
        ficha: fichaCotizacion({ ...q, instalacion: undefined }), mensaje,
        whatsapp: q.telefono ? linkWhatsapp(q.telefono, mensaje) : '',
        whatsappCorto: q.telefono ? linkWhatsapp(q.telefono, confirmacionCortaInstalacion(q, q.instalacion, { manana: true })) : '',
        maps: q.direccion ? `https://maps.google.com/?q=${encodeURIComponent(q.direccion)}` : '',
        pdf: q.pdfUrl || '',
      }
    })

  return { manana, correos, sinRespuesta, instalaciones }
}

// Ejecuta el plan: correos a los clientes y avisos a Maxi por Telegram. Lo usan la funcion programada
// (seguimiento-diario.mjs), el boton del panel y el entorno local. Un envio que falla no corta el resto.
export async function ejecutarSeguimiento({ cotizaciones, hoy, linkAgenda, enviarCorreo, avisoA, telegram }) {
  const plan = planSeguimiento({ cotizaciones, hoy, linkAgenda })
  const resultado = { manana: plan.manana, correos: 0, correosFallidos: [], telegram: 0, telegramFallidos: 0 }
  for (const { cotNum, correo } of plan.correos) {
    try { await enviarCorreo({ ...correo, ...(avisoA ? { responderA: avisoA } : {}) }); resultado.correos++ }
    catch (e) { resultado.correosFallidos.push({ cotNum, error: e.message }) }
  }
  const mandar = async (texto, botones = []) => {
    try { if (await telegram(texto, { botones })) resultado.telegram++ }
    catch (e) { resultado.telegramFallidos++; console.warn('seguimiento: Telegram no enviado:', e.message) }
  }
  const dia = fechaLarga(plan.manana).replace(/,? de \d{4}$/, '').replace(',', '').toLowerCase()
  if (plan.instalaciones.length) {
    const lista = plan.instalaciones.map(i => `• ${i.inicio}${i.fin ? '–' + i.fin : ''} · ${i.nombre} · N° ${i.cotNum}`).join('\n')
    await mandar(`🔧 Mañana, ${dia}: ${plan.instalaciones.length} ${plan.instalaciones.length === 1 ? 'instalación' : 'instalaciones'}.\n${lista}\n\nPor cada una te mando el detalle y el mensaje para copiar y pegarle al cliente.`)
    for (const i of plan.instalaciones) {
      const nombre = String(i.nombre || '').split(' ')[0] || 'cliente'
      // El detalle (repisas, servicios, saldo) con los botones, y despues el mensaje solo, para copiarlo.
      await mandar(`🔧 Mañana ${i.inicio}${i.fin ? '–' + i.fin : ''} hrs\n${i.ficha}`, [
        ...(i.whatsapp ? [{ texto: `💬 Enviar este mensaje a ${nombre}`, url: i.whatsapp }] : []),
        ...(i.whatsappCorto ? [{ texto: '✅ Confirmación corta', url: i.whatsappCorto }] : []),
        ...(i.maps ? [{ texto: '📍 Ver en Maps', url: i.maps }] : []),
        ...(i.pdf ? [{ texto: '📄 Ver cotización (PDF)', url: i.pdf }] : []),
      ])
      await mandar(i.mensaje)
    }
  } else {
    await mandar(`🌙 Mañana, ${dia}, no hay instalaciones agendadas.`)
  }
  if (plan.sinRespuesta.length) await mandar(avisoSinRespuesta(plan.sinRespuesta))
  return resultado
}
