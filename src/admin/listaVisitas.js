// Texto de las visitas para mandarselo por WhatsApp a quien las hace:
// por dia, en orden de hora, con todos los datos de cada una.
const ZONA = 'America/Santiago'
const fechaLarga = iso => new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA }).format(new Date(iso))
const hora = iso => new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA }).format(new Date(iso))
const diaDe = iso => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(iso))
const mayuscula = s => s.charAt(0).toUpperCase() + s.slice(1)

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
      lineas.push('', `*${i + 1}. ${v.start ? hora(v.start) + ' · ' : ''}${(v.nombre || 'Sin nombre').trim()}*`)
      if (v.direccion) lineas.push(`📍 ${v.direccion.trim()}`, `🗺️ https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.direccion.trim())}`)
      if (v.celular) lineas.push(`📞 ${v.celular}`)
      if (v.email) lineas.push(`✉️ ${v.email}`)
      if (v.notas) lineas.push(`📝 ${v.notas.trim()}`)
    })
    return lineas.join('\n')
  }).join('\n\n———\n\n')
}
