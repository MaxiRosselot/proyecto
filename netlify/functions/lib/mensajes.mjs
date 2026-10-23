// Textos para el cliente: envio de la cotizacion, confirmacion de la instalacion y recordatorios.
// Sin dependencias de Node: los usan el cron de recordatorios y el panel admin.
import { MAESTRO, MARCA, OFERTA, SERVICIOS, WHATSAPP } from './marca.mjs'

// Numero chileno en formato internacional sin "+": 9 1234 5678 -> 56912345678.
export function telefonoWhatsapp(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '')
  if (digitos.length === 11 && digitos.startsWith('56')) return digitos
  if (digitos.length === 9 && digitos.startsWith('9')) return '56' + digitos
  if (digitos.length === 8) return '569' + digitos
  return digitos
}

export function fechaLarga(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const texto = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function duracion(inicio, fin) {
  const a = inicio.split(':').map(Number), b = fin.split(':').map(Number)
  const minutos = (b[0] * 60 + b[1]) - (a[0] * 60 + a[1])
  const h = Math.floor(minutos / 60), m = minutos % 60
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')
}

const primerNombre = nombre => String(nombre || '').trim().split(/\s+/)[0] || ''
const saludo = nombre => `¡Hola${primerNombre(nombre) ? ' ' + primerNombre(nombre) : ''}!`
export const AVISO_RETRASO = 'Puede existir un retraso máximo de 1 hora, pero intentaremos llegar puntual.'

// Al agendar: "Su hora ya esta agendada".
// pago: { pagado, saldo } si ya hay pagos, para confirmarle que llegaron.
export function mensajeInstalacion({ nombre, direccion }, { fecha, inicio, fin }, pago) {
  return [
    `${saludo(nombre)} Su hora ya está agendada ✅`,
    '',
    `📅 ${fechaLarga(fecha)}`,
    `🕙 De ${inicio} a ${fin} hrs (duración aprox. ${duracion(inicio, fin)})`,
    ...(direccion ? [`📍 ${direccion}`] : []),
    ...(pago?.pagado ? [`💳 Recibimos su pago de ${pesos(pago.pagado)}${pago.saldo > 0 ? ` (saldo de ${pesos(pago.saldo)} al terminar)` : ''}`] : []),
    '',
    AVISO_RETRASO,
    '',
    'Repisas Don Maxi',
  ].join('\n')
}

// El dia anterior, para instalaciones y visitas.
export function mensajeRecordatorio({ tipo, cliente, fecha, inicio, fin, ubicacion }) {
  const dia = fechaLarga(fecha).toLowerCase()
  if (tipo === 'instalacion') {
    return [
      `${saludo(cliente)} Le recordamos que mañana, ${dia}, vamos a instalar sus repisas 🛠️`,
      '',
      `🕙 Entre las ${inicio} y las ${fin} hrs (duración aprox. ${duracion(inicio, fin)})`,
      ...(ubicacion ? [`📍 ${ubicacion}`] : []),
      '',
      `${AVISO_RETRASO} Por favor asegúrese de que alguien esté en el domicilio para recibirnos.`,
      '',
      'Repisas Don Maxi',
    ].join('\n')
  }
  return [
    `${saludo(cliente)} Le recordamos su visita de medición mañana, ${dia}, a las ${inicio} hrs 📏`,
    ...(ubicacion ? ['', `📍 ${ubicacion}`] : []),
    '',
    'Cualquier cambio, respóndanos por aquí.',
    '',
    'Repisas Don Maxi',
  ].join('\n')
}

const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

// Para mandar la cotizacion por WhatsApp: con el link al PDF si ya esta en Drive.
export function mensajeCotizacion({ nombre, cotNum, total, pdfUrl, linkPago, linkAgenda }) {
  return [
    `${saludo(nombre)} Le envío su cotización N° ${cotNum} de Repisas Don Maxi 📄`,
    '',
    `Total: ${pesos(total)} con IVA incluido.`,
    ...(pdfUrl ? [`Puede verla aquí: ${pdfUrl}`] : []),
    ...(linkAgenda ? [`📅 Agende su instalación aquí (elija día y hora): ${linkAgenda}`] : []),
    ...(linkPago ? [/\/reserva\?/.test(linkPago)
      ? `Aquí puede elegir el día de su instalación y pagar (total o abono del 50%): ${linkPago}`
      : `Puede pagar en línea aquí (total o abono del 50%): ${linkPago}`] : []),
    '',
    `Si paga por transferencia, tiene un ${OFERTA.descuento}% de descuento.`,
    'Cualquier duda, respóndanos por aquí.',
    '',
    'Repisas Don Maxi',
  ].join('\n')
}

const lineaReserva = r => r?.fecha ? `${fechaLarga(r.fecha)}, de ${r.inicio} a ${r.fin} hrs` : ''

// El cliente avisa que transfirio: acuso de recibo (al cliente) y aviso para verificar (a Don Maxi).
export function correoTransferenciaAvisada({ nombre, email, cotNum }, reserva) {
  return {
    para: email,
    asunto: `Recibimos tu aviso de transferencia — Cotización N° ${cotNum}`,
    texto: [
      `Hola ${primerNombre(nombre)},`.replace(' ,', ','),
      '',
      `Recibimos tu aviso de transferencia por ${pesos(reserva.monto)} (cotización N° ${cotNum}).`,
      ...(reserva.fecha ? [`Te reservamos la instalación para el ${lineaReserva(reserva).replace(/^./, c => c.toLowerCase())}.`] : []),
      '',
      'Apenas veamos el pago en nuestra cuenta te confirmamos por correo y WhatsApp. Si no la has hecho todavía, estos son los datos:',
      `${MARCA.razonSocial} · RUT ${MARCA.rut} · ${MARCA.banco} Cta. ${MARCA.tipoCuenta} ${MARCA.numeroCuenta}`,
      '',
      'Repisas Don Maxi',
    ].join('\n'),
  }
}

export function correoAvisoTransferencia({ nombre, telefono, cotNum }, reserva, linkPanel) {
  return {
    asunto: `💸 Transferencia por verificar: ${pesos(reserva.monto)} · ${nombre} (N° ${cotNum})`,
    texto: [
      `${nombre} avisó que transfirió ${pesos(reserva.monto)} (${reserva.opcion === 'abono' ? 'abono del 50%' : reserva.opcion === 'saldo' ? 'saldo' : 'total'}${reserva.descuentoPct ? `, con ${reserva.descuentoPct}% de descuento por transferencia` : ''}).`,
      ...(reserva.fecha ? [`Pidió instalar el ${lineaReserva(reserva).replace(/^./, c => c.toLowerCase())}. Ese bloque queda reservado mientras lo verificas.`] : []),
      ...(telefono ? [`Teléfono: ${telefono}`] : []),
      '',
      `Revisa la cuenta y confírmalo en el panel (Cotizaciones → N° ${cotNum}): ${linkPanel}`,
      'Al confirmar se registra el pago, se agenda la instalación y se le manda la invitación.',
    ].join('\n'),
  }
}

export function correoReservaConfirmada({ nombre, email, cotNum, direccion }, instalacion, { pagado, saldo }) {
  return {
    para: email,
    asunto: `¡Tu instalación está confirmada! — Repisas Don Maxi`,
    texto: [
      `Hola ${primerNombre(nombre)},`.replace(' ,', ','),
      '',
      `Recibimos tu pago de ${pesos(pagado)} y tu instalación quedó confirmada ✅`,
      '',
      `📅 ${fechaLarga(instalacion.fecha)}`,
      `🕙 De ${instalacion.inicio} a ${instalacion.fin} hrs (duración aprox. ${duracion(instalacion.inicio, instalacion.fin)})`,
      ...(direccion ? [`📍 ${direccion}`] : []),
      ...(saldo > 0 ? ['', `Saldo pendiente: ${pesos(saldo)}, a pagar al terminar la instalación.`] : []),
      '',
      AVISO_RETRASO,
      'Te llegará también la invitación de calendario. Cotización N° ' + cotNum + '.',
      '',
      'Repisas Don Maxi',
    ].join('\n'),
  }
}

// Cobro de una instalacion ya hecha: detalle de lo instalado, lo pagado y el saldo.
// lineas: [{ nombre, monto }] en neto; totales: { subtotal, iva, total }; pago: { pagado, saldo }.
// Para cobrar: el detalle de lo que se hizo y el monto final. Sin datos bancarios
// (esos los manda el admin aparte).
export function mensajeCobro({ nombre, fecha }, lineas, totales, pago) {
  const descuento = lineas.reduce((s, l) => s + l.monto, 0) - totales.subtotal
  return [
    `${saludo(nombre)} Le escribimos de Repisas Don Maxi por el pago de su instalación${fecha ? ` del ${fechaLarga(fecha).toLowerCase()}` : ''} 🙌`,
    '',
    'Detalle (valores netos):',
    ...lineas.map(l => `• ${l.nombre}: ${pesos(l.monto)}`),
    ...(descuento > 0 ? [`• Descuento: −${pesos(descuento)}`] : []),
    '',
    `Neto ${pesos(totales.subtotal)} + IVA ${pesos(totales.iva)} = ${pesos(totales.total)}`,
    ...(pago.pagado ? [`Ya pagado: ${pesos(pago.pagado)}`] : []),
    `*Total a pagar: ${pesos(pago.saldo)}*`,
    '',
    '¡Muchas gracias!',
  ].join('\n')
}

// Sin telefono, WhatsApp pide elegir el contacto.
export const linkWhatsapp = (telefono, texto) => `https://wa.me/${telefonoWhatsapp(telefono)}?text=${encodeURIComponent(texto)}`

// Correo del dia anterior para el cliente (texto plano).
export function correoRecordatorioInstalacion({ cliente, fecha, inicio, fin, ubicacion }) {
  return {
    asunto: `Recordatorio: mañana instalamos tus repisas — Repisas Don Maxi`,
    texto: [
      `Hola ${primerNombre(cliente) || ''},`.replace(' ,', ','),
      '',
      `Te recordamos que mañana, ${fechaLarga(fecha).toLowerCase()}, vamos a instalar tus repisas entre las ${inicio} y las ${fin} hrs (duración aprox. ${duracion(inicio, fin)}).`,
      ...(ubicacion ? [`Dirección: ${ubicacion}`] : []),
      '',
      `${AVISO_RETRASO} Por favor asegúrate de que alguien esté en el domicilio para recibirnos.`,
      '',
      'Ante cualquier cambio, responde este correo o escríbenos por WhatsApp al +56 9 5102 0367.',
      '',
      'Repisas Don Maxi',
    ].join('\n'),
  }
}

export function correoRecordatorioVisita({ cliente, fecha, inicio, ubicacion }) {
  return {
    asunto: `Recordatorio: mañana es tu visita de medición — Repisas Don Maxi`,
    texto: [
      `Hola ${primerNombre(cliente) || ''},`.replace(' ,', ','),
      '',
      `Te recordamos que mañana, ${fechaLarga(fecha).toLowerCase()}, tenemos tu visita de medición a las ${inicio} hrs.`,
      ...(ubicacion ? [`Dirección: ${ubicacion}`] : []),
      '',
      'Ante cualquier cambio, responde este correo o escríbenos por WhatsApp al +56 9 5102 0367.',
      '',
      'Repisas Don Maxi',
    ].join('\n'),
  }
}

// ── Agendar desde el link del cliente (/agendar) ─────────────────────────────

const lineasServicios = adicionales => SERVICIOS
  .filter(([clave]) => (Number(adicionales?.[`qty_${clave}`]) || 0) > 0)
  .map(([clave, nombre]) => `• ${adicionales[`nombre_${clave}`] || nombre}${Number(adicionales[`qty_${clave}`]) > 1 ? ` × ${adicionales[`qty_${clave}`]}` : ''}`)

export function correoAgendaCliente({ nombre, email, cotNum, direccion, adicionales }, instalacion, { reagendada = false, linkAgenda = '' } = {}) {
  const servicios = lineasServicios(adicionales)
  return {
    para: email,
    asunto: reagendada ? `Tu instalación quedó reagendada — Repisas Don Maxi` : `Tu instalación quedó agendada — Repisas Don Maxi`,
    texto: [
      `Hola ${primerNombre(nombre)},`.replace(' ,', ','),
      '',
      `${reagendada ? 'Reagendamos' : 'Agendamos'} la instalación de tu cotización N° ${cotNum} ✅`,
      '',
      `📅 ${fechaLarga(instalacion.fecha)}`,
      `🕙 De ${instalacion.inicio} a ${instalacion.fin} hrs (duración aprox. ${duracion(instalacion.inicio, instalacion.fin)})`,
      ...(direccion ? [`📍 ${direccion}`] : []),
      ...(servicios.length ? ['', 'Servicios adicionales:', ...servicios] : []),
      '',
      'Te escribiremos por WhatsApp para confirmar. El pago es una vez terminada la instalación.',
      AVISO_RETRASO,
      ...(linkAgenda ? ['', `Puedes ver o cambiar tu hora (hasta 48 h antes) aquí: ${linkAgenda}`] : []),
      '',
      'Repisas Don Maxi',
    ].join('\n'),
  }
}

export function correoAgendaAdmin({ nombre, telefono, cotNum, direccion, adicionales, total }, instalacion, { reagendada = false, anterior = null, linkPanel = '', ahora = new Date() } = {}) {
  const servicios = lineasServicios(adicionales)
  return {
    asunto: `📅 ${reagendada ? 'Reagendó' : 'Agendó'}: ${nombre} · ${fechaLarga(instalacion.fecha)} ${instalacion.inicio}–${instalacion.fin} (N° ${cotNum})`,
    texto: [
      `${nombre} ${reagendada ? 'reagendó' : 'agendó'} su instalación desde el link de su cotización N° ${cotNum}.`,
      '',
      `📅 ${fechaLarga(instalacion.fecha)}, de ${instalacion.inicio} a ${instalacion.fin} hrs (${duracion(instalacion.inicio, instalacion.fin)})`,
      ...(anterior?.fecha ? [`Antes: ${fechaLarga(anterior.fecha)}, ${anterior.inicio}–${anterior.fin}`] : []),
      ...(direccion ? [`📍 ${direccion}`] : []),
      ...(telefono ? [`📞 ${telefono}`] : []),
      ...(servicios.length ? ['', 'Servicios adicionales:', ...servicios] : []),
      `Total: ${pesos(total)} con IVA`,
      '',
      'Quedó en el Calendario y en Instalaciones. Falta confirmarle por WhatsApp:',
      '',
      '———',
      mensajeConfirmarInstalacion({ nombre, direccion }, instalacion, ahora),
      '———',
      ...(telefono ? ['', `Abrir el chat con el mensaje: ${linkWhatsapp(telefono, mensajeConfirmarInstalacion({ nombre, direccion }, instalacion, ahora))}`] : []),
      ...(linkPanel ? ['', linkPanel] : []),
    ].join('\n'),
  }
}

// Para confirmar la instalacion con el cliente por WhatsApp (como el de las visitas): el dia
// anterior o apenas agenda desde su link. "de mañana" si es al dia siguiente.
export function mensajeConfirmarInstalacion({ nombre, direccion }, { fecha, inicio, fin }, ahora = new Date()) {
  const manana = new Date(ahora.getTime() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) === fecha
  const dia = fechaLarga(fecha).replace(',', '').toLowerCase()
  return [
    `${saludo(nombre)} 👋 Le escribimos de Repisas Don Maxi para confirmar su instalación ${manana ? `de mañana ${dia}` : `del ${dia}`}, de ${inicio} a ${fin} hrs${direccion ? ` en ${direccion}` : ''}.`,
    '',
    'Por favor considere 1 hora de flexibilidad por un eventual atraso o adelanto.',
    '',
    '¿Nos confirma si estamos ok? 🙏',
  ].join('\n')
}

// El mensaje que va junto al PDF de la cotizacion por WhatsApp, con el link para agendar.
export function mensajeEnvioCotizacion(linkAgenda) {
  return [
    '🪜 Te adjunto la cotización de repisas para tu bodega.',
    '',
    '🧹 Los servicios adicionales no están incluidos, pero su valor va detallado.',
    '💳 Puedes pagar hasta en 3 cuotas sin interés. Boleta o factura.',
    ...(linkAgenda ? ['', '📅 Agenda tu instalación aquí: ves los horarios disponibles y el tiempo de instalación, y puedes sumar servicios adicionales si los necesitas 👇', linkAgenda] : []),
    '',
    '¡Cualquier duda me escribes por acá! 😊',
  ].join('\n')
}

// La vispera de cada instalacion (8 pm, por Telegram a Maxi): el mensaje para copiar y mandarle
// al cliente por WhatsApp. Con retiro y orden contratado no se le pide la bodega despejada.
export function mensajeInstalacionManana(q, { fecha, inicio }) {
  const conRetiro = (Number(q.adicionales?.qty_retiro_orden) || 0) > 0
  const dia = fechaLarga(fecha).replace(',', '').toLowerCase()
  return [
    `${saludo(q.nombre)} 👋 Le escribimos de Repisas Don Maxi para confirmar su instalación de mañana ${dia} a las ${inicio} hrs${q.direccion ? ` en ${q.direccion}` : ''}.`,
    '',
    conRetiro
      ? 'Como contrató el retiro y orden, nosotros nos encargamos de sacar y volver a ordenar sus cosas.'
      : 'Le recordamos tener la bodega despejada para comenzar a tiempo.',
    'También le pedimos intentar conseguir un estacionamiento lo más cerca posible de la bodega.',
    '',
    `El encargado de la instalación es el maestro ${MAESTRO.nombre}, ${MAESTRO.telefono}. La patente de la camioneta es ${MAESTRO.patente} y cabe sin problemas en estacionamientos subterráneos comunes. No necesitamos corriente para la instalación.`,
    '',
    'Cualquier cosa me escribe, estaré atento 🙏',
  ].join('\n')
}

// Seguimiento de una cotizacion sin respuesta: a los 3 y a los 7 dias de enviada (seguimiento.mjs).
export function correoSeguimientoCotizacion(q, { dias, linkAgenda = '' }) {
  const ultimo = dias >= 7
  return {
    asunto: ultimo ? `Tu cotización N° ${q.cotNum} sigue disponible — Repisas Don Maxi` : `¿Pudiste revisar tu cotización N° ${q.cotNum}? — Repisas Don Maxi`,
    texto: [
      `Hola ${primerNombre(q.nombre)},`.replace(' ,', ','),
      '',
      ultimo
        ? 'Te escribimos para contarte que tu cotización de repisas sigue disponible. Si quieres ajustar medidas, sumar o quitar algo, respóndenos y te la actualizamos.'
        : 'Hace unos días te enviamos la cotización de tus repisas. ¿Pudiste revisarla? Si tienes cualquier duda, respóndenos este correo o escríbenos por WhatsApp.',
      '',
      ...(q.pdfUrl ? [`📄 Tu cotización: ${q.pdfUrl}`] : []),
      ...(linkAgenda ? [`📅 Agenda tu instalación cuando quieras (eliges día y hora): ${linkAgenda}`] : []),
      `💬 WhatsApp: https://wa.me/${WHATSAPP.replace(/\D/g, '')}`,
      '',
      'Puedes pagar hasta en 3 cuotas sin interés o al terminar la instalación.',
      '',
      'Repisas Don Maxi',
    ].join('\n'),
  }
}
