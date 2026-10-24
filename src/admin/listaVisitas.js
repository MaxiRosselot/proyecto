// Texto de las visitas para mandarselo por WhatsApp a quien las hace:
// por dia, en orden de hora, con todos los datos de cada una.
const ZONA = 'America/Santiago'
const fechaLarga = iso => new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA }).format(new Date(iso))
const hora = iso => new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA }).format(new Date(iso))
const diaDe = iso => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(iso))
const mayuscula = s => s.charAt(0).toUpperCase() + s.slice(1)
// Mientras el cliente solo eligio un rango, el evento dura todo el rango (ej. 11:00–14:00); con la
// ruta armada pasa a durar la visita, a la hora de llegada.
const esRango = v => Boolean(v.start && v.end && new Date(v.end) - new Date(v.start) > 30 * 60000)
export const horarioVisita = v => (!v.start ? '' : esRango(v) ? `${hora(v.start)}–${hora(v.end)}` : hora(v.start))
const cuando = v => (esRango(v) ? `entre las ${hora(v.start)} y las ${hora(v.end)}` : `a las ${hora(v.start)}`)

export function textoVisitas(visitas) {
  const ordenadas = [...visitas].sort((a, b) => (a.start ? new Date(a.start) : Infinity) - (b.start ? new Date(b.start) : Infinity))
  const dias = []
  for (const v of ordenadas) {
    const dia = v.start ? diaDe(v.start) : ''
    if (dias.at(-1)?.dia !== dia) dias.push({ dia, titulo: v.start ? mayuscula(fechaLarga(v.start)) : 'Sin fecha', visitas: [] })
    dias.at(-1).visitas.push(v)
  }
  return dias.map(d => {
    const lineas = [`📅 *${d.titulo}* (${d.visitas.length} ${d.visitas.length === 1 ? 'visita' : 'visitas'})`]
    d.visitas.forEach((v, i) => {
      lineas.push('', `*${i + 1}. ${v.start ? horarioVisita(v) + ' · ' : ''}${(v.nombre || 'Sin nombre').trim()}*`)
      if (v.direccion) lineas.push(`📍 ${v.direccion.trim()}`, `🗺️ https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.direccion.trim())}`)
      if (v.celular) lineas.push(`📞 ${v.celular}`)
      if (v.email) lineas.push(`✉️ ${v.email}`)
      if (v.notas) lineas.push(`📝 ${v.notas.trim()}`)
    })
    return lineas.join('\n')
  }).join('\n\n———\n\n')
}

// Visitas que siguen en pie (todavia no se declara que paso con ellas).
export const VISITA_VIGENTE = ['agendada', 'reagendar', 'confirmada']

// Mensaje del dia anterior para que el cliente confirme la visita.
export function mensajeConfirmarVisita(visita, ahora = new Date()) {
  const nombre = (visita.nombre || '').trim().split(/\s+/)[0]
  const manana = diaDe(new Date(ahora.getTime() + 864e5).toISOString()) === diaDe(visita.start)
  const dia = `${manana ? 'de mañana ' : 'del '}${fechaLarga(visita.start).replace(',', '')} ${cuando(visita)}`
  return [
    `Hola${nombre ? ' ' + nombre : ''}! 👋 Te escribimos de Repisas Don Maxi para confirmar la visita ${dia}${visita.direccion ? ` en ${visita.direccion.trim()}` : ''}.`,
    '',
    'Por favor considera 1 hora de flexibilidad por un eventual atraso o adelanto.',
    '',
    '¿Nos confirmas si estamos ok? Y si no puedes, avísanos también para reorganizarnos e intentar ser lo más puntuales posible 🙏',
  ].join('\n')
}

// Aviso al cliente cuando se le mueve la visita.
export function mensajeVisitaReagendada(visita) {
  const nombre = (visita.nombre || '').trim().split(/\s+/)[0]
  return [
    `Hola${nombre ? ' ' + nombre : ''}! 👋 Te escribimos de Repisas Don Maxi: tu visita quedó reagendada para el ${fechaLarga(visita.start).replace(',', '')} ${cuando(visita)}${visita.direccion ? ` en ${visita.direccion.trim()}` : ''}.`,
    '',
    'Por favor considera 1 hora de flexibilidad por un eventual atraso o adelanto. Si no puedes, avísanos 🙏',
  ].join('\n')
}
