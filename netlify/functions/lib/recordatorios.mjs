// Lo que manda el cron diario (10:00): recordatorio por correo a cada cliente con visita o
// instalacion mañana, y un resumen para Don Maxi con los links de WhatsApp listos para mandar
// el recordatorio desde el celular y el saldo que hay que cobrar en cada instalacion.
// Sin Google: recibe los eventos ya leidos y devuelve los correos a enviar.
import { creadoEnMs } from './cotizaciones.mjs'
import { correoRecordatorioInstalacion, correoRecordatorioVisita, fechaLarga, linkWhatsapp, mensajeRecordatorio } from './mensajes.mjs'

const pesos = n => '$' + Math.round(n).toLocaleString('es-CL')
const DIA_MS = 86400000

export function prepararRecordatorios({ manana, eventosManana = [], cotizaciones = [], visitasPasadas = [], ahora = new Date() }) {
  const instalaciones = eventosManana.filter(e => e.tipo === 'instalacion')
  const visitas = eventosManana.filter(e => e.tipo === 'visita')

  const correosClientes = [...instalaciones, ...visitas]
    .filter(e => e.email)
    .map(e => ({ para: e.email, ...(e.tipo === 'instalacion' ? correoRecordatorioInstalacion(e) : correoRecordatorioVisita(e)) }))

  const sinRespuesta = cotizaciones
    .filter(q => q.status === 'por confirmar' && q.creadoMs != null && (ahora - q.creadoMs) / DIA_MS >= 3)
    .map(q => ({ cotNum: q.cotNum, nombre: q.nombre, dias: Math.floor((ahora - q.creadoMs) / DIA_MS) }))

  const fechasCotizadas = new Set(cotizaciones.map(q => String(q.fechaVisita || '').slice(0, 10)).filter(Boolean))
  const sinCotizar = visitasPasadas.filter(v => v.estado === 'realizada' && !fechasCotizadas.has(v.fecha))

  const lineas = [`Resumen para mañana, ${fechaLarga(manana).toLowerCase()}`, '']
  const linea = e => {
    const telefono = e.telefono ? '' : ' (sin teléfono)'
    return `  • ${e.tipo === 'visita' ? e.horario || e.inicio : `${e.inicio}${e.fin ? '–' + e.fin : ''}`} · ${e.cliente}${e.ubicacion ? ' · ' + e.ubicacion : ''}${telefono}`
  }
  if (instalaciones.length) {
    lineas.push(`🔧 INSTALACIONES (${instalaciones.length})`)
    for (const e of instalaciones) {
      lineas.push(linea(e))
      if (e.pago) lineas.push(`    Saldo a cobrar: ${pesos(e.pago.saldo)}${e.pago.pagado ? ` (ya pagó ${pesos(e.pago.pagado)})` : ''}`)
      lineas.push(`    ${e.email ? 'Recordatorio por correo enviado.' : 'Sin correo: mándale el recordatorio por WhatsApp.'}`)
      lineas.push(`    WhatsApp: ${linkWhatsapp(e.telefono, mensajeRecordatorio(e))}`)
    }
    lineas.push('')
  }
  if (visitas.length) {
    lineas.push(`📏 VISITAS (${visitas.length})`)
    for (const e of visitas) {
      lineas.push(linea(e))
      lineas.push(`    WhatsApp: ${linkWhatsapp(e.telefono, mensajeRecordatorio(e))}`)
    }
    lineas.push('')
  }
  if (sinRespuesta.length) {
    lineas.push(`⏰ COTIZACIONES SIN RESPUESTA (${sinRespuesta.length})`)
    sinRespuesta.forEach(c => lineas.push(`  • N° ${c.cotNum} · ${c.nombre} · ${c.dias} días`))
    lineas.push('')
  }
  if (sinCotizar.length) {
    lineas.push(`📋 VISITAS SIN COTIZAR (${sinCotizar.length})`)
    sinCotizar.forEach(v => lineas.push(`  • ${v.cliente} · visita del ${v.fecha}`))
    lineas.push('')
  }

  const hayAlgo = instalaciones.length + visitas.length + sinRespuesta.length + sinCotizar.length > 0
  return {
    correosClientes,
    resumen: hayAlgo ? { asunto: `Don Maxi mañana: ${instalaciones.length} instalaciones, ${visitas.length} visitas`, texto: lineas.join('\n') } : null,
  }
}

export { creadoEnMs }
