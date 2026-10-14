// Mensaje de WhatsApp para avisarle al cliente que su instalacion quedo agendada.

// Numero chileno en formato internacional sin "+": 9 1234 5678 -> 56912345678.
export function telefonoWhatsapp(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '')
  if (digitos.length === 11 && digitos.startsWith('56')) return digitos
  if (digitos.length === 9 && digitos.startsWith('9')) return '56' + digitos
  if (digitos.length === 8) return '569' + digitos
  return digitos
}

export function fechaLarga(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const texto = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function duracion(inicio, fin) {
  const a = inicio.split(':').map(Number), b = fin.split(':').map(Number)
  const minutos = (b[0] * 60 + b[1]) - (a[0] * 60 + a[1])
  const h = Math.floor(minutos / 60), m = minutos % 60
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')
}

export function mensajeInstalacion({ nombre, direccion }, { fecha, inicio, fin }) {
  const primerNombre = String(nombre || '').trim().split(/\s+/)[0] || ''
  return [
    `¡Hola${primerNombre ? ' ' + primerNombre : ''}! Su hora ya está agendada ✅`,
    '',
    `📅 ${fechaLarga(fecha)}`,
    `🕙 De ${inicio} a ${fin} hrs (duración aprox. ${duracion(inicio, fin)})`,
    ...(direccion ? [`📍 ${direccion}`] : []),
    '',
    'Puede existir un retraso máximo de 1 hora, pero intentaremos llegar puntual.',
    '',
    'Repisas Don Maxi',
  ].join('\n')
}

// Link que abre WhatsApp con el mensaje escrito; sin telefono, WhatsApp pide elegir el contacto.
export function linkWhatsappInstalacion(cotizacion, instalacion) {
  const numero = telefonoWhatsapp(cotizacion.telefono)
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeInstalacion(cotizacion, instalacion))}`
}
