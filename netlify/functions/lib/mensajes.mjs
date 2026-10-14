// Textos para el cliente: confirmacion de la instalacion y recordatorios del dia anterior.
// Sin dependencias de Node: los usan el cron de recordatorios y el panel admin.

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
export function mensajeInstalacion({ nombre, direccion }, { fecha, inicio, fin }) {
  return [
    `${saludo(nombre)} Su hora ya está agendada ✅`,
    '',
    `📅 ${fechaLarga(fecha)}`,
    `🕙 De ${inicio} a ${fin} hrs (duración aprox. ${duracion(inicio, fin)})`,
    ...(direccion ? [`📍 ${direccion}`] : []),
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
