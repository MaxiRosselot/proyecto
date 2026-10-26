// Lo comun a los mapas del panel (MapaVisitas y Concentracion): el mapa base de OpenStreetMap, el
// centro de cada comuna, que esta en la Region Metropolitana y descargar el mapa como imagen.
import { useEffect, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { comunaDe } from '../../netlify/functions/lib/zonas.mjs'

export const SANTIAGO = [-33.45, -70.62]
// Rectangulo de la Region Metropolitana: lo que cae fuera no se dibuja.
const RM = { latMin: -34.35, latMax: -32.9, lngMin: -71.75, lngMax: -69.75 }
export const enRM = (lat, lng) => lat >= RM.latMin && lat <= RM.latMax && lng >= RM.lngMin && lng <= RM.lngMax

export function crearMapa(contenedor) {
  const mapa = L.map(contenedor, { scrollWheelZoom: true }).setView(SANTIAGO, 11)
  // crossOrigin: para poder descargar el mapa como imagen (OpenStreetMap lo permite).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, crossOrigin: true, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa)
  return mapa
}

// La comuna de una visita: la guardada o la que se lee en la direccion.
export const comunaDeVisita = v => v.comuna || comunaDe(v.direccion) || ''

// Donde dibujar una visita: sus coordenadas, o el centro de su comuna (aproximada). null = fuera
// de la RM o sin datos.
export function ubicar(v, centros) {
  if (Number.isFinite(v.lat) && Number.isFinite(v.lng)) return enRM(v.lat, v.lng) ? { lat: v.lat, lng: v.lng, aprox: false } : null
  const c = centros[comunaDeVisita(v)]
  return c ? { ...c, aprox: true } : null
}

// Centro de cada comuna: se busca una sola vez en OpenStreetMap (solo el nombre de la comuna,
// nunca la direccion del cliente), de a una por segundo como pide su politica, y queda guardado
// en este navegador.
const CLAVE_COMUNAS = 'dm_centros_comunas_v1'
const leerCentros = () => { try { return JSON.parse(localStorage.getItem(CLAVE_COMUNAS) || '{}') } catch { return {} } }
const guardarCentros = c => { try { localStorage.setItem(CLAVE_COMUNAS, JSON.stringify(c)) } catch { /* sin almacenamiento */ } }
async function buscarCentro(comuna) {
  const q = new URLSearchParams({ q: `${comuna}, Región Metropolitana, Chile`, format: 'json', limit: '1', countrycodes: 'cl' })
  const [punto] = await (await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'Accept-Language': 'es' } })).json()
  return punto ? { lat: Number(punto.lat), lng: Number(punto.lon) } : null
}

export function useCentrosComunas(comunas) {
  const [centros, setCentros] = useState(leerCentros)
  const clave = [...new Set(comunas.filter(Boolean))].sort().join('|')
  useEffect(() => {
    const faltan = clave.split('|').filter(c => c && !(c in centros))
    if (!faltan.length) return
    let activo = true
    ;(async () => {
      const nuevos = { ...leerCentros() }
      for (const comuna of faltan) {
        if (!activo) return
        nuevos[comuna] = await buscarCentro(comuna).catch(() => null)
        setCentros({ ...nuevos }); guardarCentros(nuevos)
        await new Promise(r => setTimeout(r, 1100))
      }
    })()
    return () => { activo = false }
  }, [clave])
  return centros
}

// Separa las que caen en el mismo punto (aproximadas de una misma comuna) en espiral.
export function separar(puntos) {
  const vistos = {}
  return puntos.map(p => {
    if (!p.aprox) return p
    const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
    const n = (vistos[k] = (vistos[k] || 0) + 1) - 1
    const angulo = n * 2.4, radio = n ? 0.004 + 0.0015 * Math.sqrt(n) : 0
    return { ...p, lat: p.lat + radio * Math.sin(angulo), lng: p.lng + radio * Math.cos(angulo) * 1.2 }
  })
}

// Descarga (o comparte, en el celular) el mapa como imagen PNG.
export async function descargarMapa(contenedor, nombre) {
  const { toBlob } = await import('html-to-image')
  // skipFonts: incrustar las fuentes de Google se queda pegado (y el mapa no las necesita).
  const blob = await toBlob(contenedor, { cacheBust: false, pixelRatio: 2, skipFonts: true, filter: n => !n.classList?.contains('leaflet-control-zoom') })
  const archivo = new File([blob], `${nombre}.png`, { type: 'image/png' })
  // En el celular, "compartir" (directo a WhatsApp); en el computador, descargar.
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre }); return } catch (e) { if (e?.name === 'AbortError') return }
  }
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: archivo.name })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
