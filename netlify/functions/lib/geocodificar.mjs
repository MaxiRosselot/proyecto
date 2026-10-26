// Coordenadas de una direccion (Google Geocoding API). Lo usan la ruta de visitas del bot y el mapa
// de visitas del panel, para las visitas sin coordenadas (antiguas o escritas a mano).
export async function geocodificar(direccion, { key = process.env.GOOGLE_MAPS_SERVER_KEY, fetchImpl = fetch } = {}) {
  if (!key || !direccion) return null
  const q = new URLSearchParams({ address: direccion, region: 'cl', components: 'country:CL', language: 'es', key })
  const r = await fetchImpl(`https://maps.googleapis.com/maps/api/geocode/json?${q}`).then(x => x.json()).catch(() => null)
  const punto = r?.status === 'OK' ? r.results?.[0]?.geometry?.location : null
  return punto ? { lat: punto.lat, lng: punto.lng } : null
}

