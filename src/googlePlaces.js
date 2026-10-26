// Google Places (API New) en el navegador, con VITE_GOOGLE_MAPS_KEY (restringida a los dominios del
// sitio). Lo usan /visita (autocompletar la direccion) y el panel ("📍 Ubicar en el mapa": busca las
// coordenadas de visitas e instalaciones antiguas escritas a mano).
export const CLAVE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''
const SANTIAGO = { center: { lat: -33.45, lng: -70.65 }, radius: 50000 }

let places = null
export function cargarPlaces() {
  if (!CLAVE_MAPS) return Promise.reject(new Error('Falta VITE_GOOGLE_MAPS_KEY en Netlify'))
  places ||= new Promise((resolve, reject) => {
    window.gm_authFailure = () => reject(new Error('Google Maps rechazó la clave'))
    window.__mapsDonMaxi = () => window.google.maps.importLibrary('places').then(resolve, reject)
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key: CLAVE_MAPS, v: 'weekly', loading: 'async', language: 'es', region: 'CL', callback: '__mapsDonMaxi' })}`
    s.async = true
    s.onerror = () => reject(new Error('No cargó Google Maps'))
    document.head.appendChild(s)
    setTimeout(() => reject(new Error('Google Maps no respondió')), 8000)
  }).catch(e => { places = null; throw e })
  return places
}

const componente = (lugar, tipo) => lugar.addressComponents?.find(c => c.types.includes(tipo))?.longText || ''
export const comunaDeLugar = lugar => componente(lugar, 'administrative_area_level_3') || componente(lugar, 'locality')
export { componente }

// Coordenadas y comuna de una direccion escrita (busqueda por texto de Places). null si no la encuentra.
export async function buscarUbicacion(texto) {
  const { Place } = await cargarPlaces()
  const { places: resultados } = await Place.searchByText({
    textQuery: texto, fields: ['location', 'addressComponents'], locationBias: SANTIAGO, region: 'cl', language: 'es', maxResultCount: 1,
  })
  const lugar = resultados?.[0]
  return lugar?.location ? { lat: lugar.location.lat(), lng: lugar.location.lng(), comuna: comunaDeLugar(lugar) } : null
}

// Muchas a la vez (de a 5): [{ id, texto }] → [{ id, lat, lng, comuna }] (lat '-' = no se encontro).
export async function buscarUbicaciones(items, alAvanzar = () => {}) {
  const resultado = []
  for (let i = 0; i < items.length; i += 5) {
    await Promise.all(items.slice(i, i + 5).map(async it => {
      const u = await buscarUbicacion(it.texto).catch(e => { if (/clave|VITE_|cargó|respondió/.test(e.message)) throw e; return null })
      resultado.push(u ? { id: it.id, ...u } : { id: it.id, lat: '-', lng: '-', comuna: '' })
    }))
    alAvanzar(resultado.length, items.length)
  }
  return resultado
}
