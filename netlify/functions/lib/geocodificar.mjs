// Coordenadas (y comuna) de una direccion con Google Geocoding API. Lo usan la ruta de visitas del
// bot, el mapa de visitas del panel y "Ubicar en el mapa" de las visitas importadas.
// Con GOOGLE_MAPS_SERVER_KEY; sin ella devuelve null y esas visitas se ubican por comuna.
export async function geocodificar(direccion, { key = process.env.GOOGLE_MAPS_SERVER_KEY, fetchImpl = fetch } = {}) {
  if (!key || !direccion) return null
  const q = new URLSearchParams({ address: direccion, region: 'cl', components: 'country:CL', language: 'es', key })
  const r = await fetchImpl(`https://maps.googleapis.com/maps/api/geocode/json?${q}`).then(x => x.json()).catch(() => null)
  const resultado = r?.status === 'OK' ? r.results?.[0] : null
  if (!resultado?.geometry?.location) return null
  const parte = tipo => resultado.address_components?.find(c => c.types?.includes(tipo))?.long_name || ''
  return { lat: resultado.geometry.location.lat, lng: resultado.geometry.location.lng, comuna: parte('administrative_area_level_3') || parte('locality') }
}
