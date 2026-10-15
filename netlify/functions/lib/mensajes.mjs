// Textos para el cliente: envio de la cotizacion, confirmacion de la instalacion y recordatorios.
// Sin dependencias de Node: los usan el cron de recordatorios y el panel admin.
import { MARCA, OFERTA } from './marca.mjs'

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
export function mensajeCotizacion({ nombre, cotNum, total, pdfUrl, linkPago }) {
  return [
    `${saludo(nombre)} Le envío su cotización N° ${cotNum} de Repisas Don Maxi 📄`,
    '',
    `Total: ${pesos(total)} con IVA incluido.`,
    ...(pdfUrl ? [`Puede verla aquí: ${pdfUrl}`] : []),
    ...(linkPago ? [`Aquí puede elegir el día de su instalación y pagar (total o abono del 50%): ${linkPago}`] : []),
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
