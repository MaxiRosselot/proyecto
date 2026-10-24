// La ruta de las visitas de un dia: en que orden ir y a que hora se llega a cada una.
// Cada cliente eligio un rango (8–11, 11–14, 14–17 o 17–20): primero se hacen las del primer rango,
// despues las del siguiente. Dentro de cada rango se prueba todo orden posible (son pocas) y queda
// el que menos se maneja, partiendo desde donde termino el rango anterior. La ruta parte en la
// primera visita (sin punto de partida).
// Traslados: con coordenadas, linea recta × 1,35 a 25 km/h (la ciudad); sin coordenadas, 10 min si
// es la misma comuna y 25 si no. La visita dura DURACION_MIN (15 min).
// Sin imports de Node.
import { DURACION_MIN, aHHMM, aMinutos } from './horarios.mjs'
import { comunaDe } from './zonas.mjs'

const KM_H = 25, DESVIO = 1.35
export const MIN_SIN_COORDENADAS = 25, MIN_MISMA_COMUNA = 10
const MAX_PERMUTAR = 7

const conCoordenadas = v => Number.isFinite(Number(v?.lat)) && Number.isFinite(Number(v?.lng)) && v.lat !== '' && v.lng !== ''

export function kmEntre(a, b) {
  const rad = x => Number(x) * Math.PI / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

export function minutosEntre(a, b) {
  if (conCoordenadas(a) && conCoordenadas(b)) {
    const km = kmEntre(a, b) * DESVIO
    return km < 0.1 ? 0 : Math.max(5, Math.round(km / KM_H * 60))
  }
  const ca = comunaDe(a.ubicacion), cb = comunaDe(b.ubicacion)
  return ca && ca === cb ? MIN_MISMA_COMUNA : MIN_SIN_COORDENADAS
}

function* permutaciones(lista) {
  if (lista.length <= 1) { yield lista; return }
  for (let i = 0; i < lista.length; i++) {
    for (const resto of permutaciones([...lista.slice(0, i), ...lista.slice(i + 1)])) yield [lista[i], ...resto]
  }
}

const costo = (desde, orden) => orden.reduce((s, v, i) => s + (i === 0 ? (desde ? minutosEntre(desde, v) : 0) : minutosEntre(orden[i - 1], v)), 0)

// El mejor orden para un rango: todos los ordenes si son pocas, si no el mas cercano cada vez.
function ordenarRango(visitas, desde) {
  if (visitas.length <= MAX_PERMUTAR) {
    let mejor = null, min = Infinity
    for (const orden of permutaciones(visitas)) { const c = costo(desde, orden); if (c < min) { min = c; mejor = orden } }
    return mejor || []
  }
  const pendientes = [...visitas], orden = []
  let actual = desde
  while (pendientes.length) {
    pendientes.sort((a, b) => (actual ? minutosEntre(actual, a) - minutosEntre(actual, b) : 0))
    actual = pendientes.shift(); orden.push(actual)
  }
  return orden
}

const redondear5 = min => Math.ceil(min / 5) * 5

// visitas: [{ id, cliente, ubicacion, lat?, lng?, rango: { desde, hasta }, telefono? }]
// → { paradas: [{ ...visita, llegada: 'HH:MM', trasladoMin, fueraDeRango }], minutosManejo, sinCoordenadas }
export function planificarRuta(visitas, { duracionMin = DURACION_MIN } = {}) {
  const porRango = new Map()
  for (const v of [...visitas].sort((a, b) => a.rango.desde.localeCompare(b.rango.desde))) {
    if (!porRango.has(v.rango.desde)) porRango.set(v.rango.desde, [])
    porRango.get(v.rango.desde).push(v)
  }
  const paradas = []
  let anterior = null, libreDesde = null, minutosManejo = 0
  for (const grupo of porRango.values()) {
    for (const v of ordenarRango(grupo, anterior)) {
      const traslado = anterior ? minutosEntre(anterior, v) : 0
      const llegada = redondear5(Math.max(aMinutos(v.rango.desde), libreDesde == null ? 0 : libreDesde + traslado))
      paradas.push({ ...v, llegada: aHHMM(llegada), trasladoMin: traslado, fueraDeRango: llegada + duracionMin > aMinutos(v.rango.hasta) })
      minutosManejo += traslado
      anterior = v; libreDesde = llegada + duracionMin
    }
  }
  return { paradas, minutosManejo, sinCoordenadas: visitas.filter(v => !conCoordenadas(v)).length }
}

// Links de Google Maps con la ruta en orden (cada link, hasta 10 paradas: Maps no acepta mas).
export function linksRuta(paradas, porLink = 10) {
  const punto = p => conCoordenadas(p) ? `${p.lat},${p.lng}` : p.ubicacion
  const links = []
  for (let i = 0; i < paradas.length; i += porLink - 1) {
    const tramo = paradas.slice(i, i + porLink)
    if (tramo.length < 2 && links.length) break
    const [origen, ...resto] = tramo
    const destino = resto.pop() || origen
    const q = new URLSearchParams({ api: '1', origin: punto(origen), destination: punto(destino), travelmode: 'driving' })
    if (resto.length) q.set('waypoints', resto.map(punto).join('|'))
    links.push({ desde: i + 1, hasta: i + tramo.length, url: `https://www.google.com/maps/dir/?${q}` })
  }
  return links
}
