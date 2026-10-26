import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { C, VISIT_STATUS_LABELS, fmtDate } from './utils.js'
import { horarioVisita } from './listaVisitas.js'
import { comunaDe } from '../../netlify/functions/lib/zonas.mjs'

// Admin → Visitas → 🗺 Mapa: las visitas de la pestaña elegida en un mapa (OpenStreetMap, sin clave
// ni costo). Cada punto lleva el color de su estado y su ficha al tocarlo.
//   · con coordenadas (autocompletado de /visita, o ubicadas por el servidor con
//     GOOGLE_MAPS_SERVER_KEY): punto lleno, en su direccion;
//   · sin coordenadas: punto con borde punteado en el centro de su comuna (aproximado). El centro de
//     cada comuna se busca una sola vez en OpenStreetMap (solo el nombre de la comuna, nunca la
//     direccion del cliente) y queda guardado en este navegador.
const CLAVE_COMUNAS = 'dm_centros_comunas_v1'
const SANTIAGO = [-33.45, -70.62]
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function leerCentros() { try { return JSON.parse(localStorage.getItem(CLAVE_COMUNAS) || '{}') } catch { return {} } }
function guardarCentros(c) { try { localStorage.setItem(CLAVE_COMUNAS, JSON.stringify(c)) } catch { /* sin almacenamiento: se vuelve a buscar */ } }

async function buscarCentro(comuna) {
  const q = new URLSearchParams({ q: `${comuna}, Región Metropolitana, Chile`, format: 'json', limit: '1', countrycodes: 'cl' })
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'Accept-Language': 'es' } })
  const [punto] = await r.json()
  return punto ? { lat: Number(punto.lat), lng: Number(punto.lon) } : null
}

export default function MapaVisitas({ visitas, estadoDe }) {
  const contenedor = useRef(null), mapa = useRef(null), capa = useRef(null)
  const [centros, setCentros] = useState(leerCentros)

  const conComuna = useMemo(() => visitas.map(v => ({ ...v, comunaMapa: v.comuna || comunaDe(v.direccion) || '' })), [visitas])
  const exactas = conComuna.filter(v => Number.isFinite(v.lat) && Number.isFinite(v.lng))
  const aproximadas = conComuna.filter(v => !Number.isFinite(v.lat) && v.comunaMapa)
  const sinUbicacion = conComuna.filter(v => !Number.isFinite(v.lat) && !v.comunaMapa)

  // El mapa, una vez.
  useEffect(() => {
    mapa.current = L.map(contenedor.current, { scrollWheelZoom: true }).setView(SANTIAGO, 11)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa.current)
    capa.current = L.layerGroup().addTo(mapa.current)
    return () => { mapa.current.remove(); mapa.current = null }
  }, [])

  // Centros de las comunas que faltan, de a uno (OpenStreetMap pide no mas de 1 por segundo).
  useEffect(() => {
    const faltan = [...new Set(aproximadas.map(v => v.comunaMapa))].filter(c => !(c in centros))
    if (!faltan.length) return
    let activo = true
    ;(async () => {
      const nuevos = { ...centros }
      for (const comuna of faltan) {
        if (!activo) return
        nuevos[comuna] = await buscarCentro(comuna).catch(() => null)
        setCentros({ ...nuevos }); guardarCentros(nuevos)
        await new Promise(r => setTimeout(r, 1100))
      }
    })()
    return () => { activo = false }
  }, [aproximadas.map(v => v.comunaMapa).join('|')])

  // Los puntos.
  useEffect(() => {
    if (!capa.current) return
    capa.current.clearLayers()
    const puntos = []
    const porComuna = {}
    for (const v of conComuna) {
      let lat = v.lat, lng = v.lng, aprox = false
      if (!Number.isFinite(lat)) {
        const centro = centros[v.comunaMapa]
        if (!centro) continue
        // Las de una misma comuna, en circulo alrededor del centro (si no, quedan una encima de otra).
        const n = (porComuna[v.comunaMapa] = (porComuna[v.comunaMapa] || 0) + 1) - 1
        const angulo = n * 2.4, radio = n ? 0.004 + 0.0015 * Math.sqrt(n) : 0
        lat = centro.lat + radio * Math.sin(angulo); lng = centro.lng + radio * Math.cos(angulo) * 1.2; aprox = true
      }
      const estado = VISIT_STATUS_LABELS[estadoDe(v)] || VISIT_STATUS_LABELS.agendada
      const marca = L.circleMarker([lat, lng], {
        radius: 9, color: aprox ? estado.color : '#fff', weight: aprox ? 2.5 : 2, dashArray: aprox ? '3 3' : null,
        fillColor: estado.color, fillOpacity: aprox ? 0.35 : 0.9,
      })
      const direccion = v.direccion || v.comunaMapa
      marca.bindPopup(`<div style="font:13px/1.45 system-ui,sans-serif;min-width:190px">
        <strong style="font-size:14px">${esc(v.nombre || 'Sin nombre')}</strong><br>
        📅 ${esc(fmtDate(v.start))} · ${esc(horarioVisita(v))}<br>
        ${direccion ? `📍 ${esc(direccion)}${aprox ? ' <em style="color:#888">(ubicación aproximada)</em>' : ''}<br>` : ''}
        ${v.celular ? `📞 ${esc(v.celular)}<br>` : ''}
        <span style="color:${estado.color};font-weight:700">● ${esc(estado.label)}</span>
        ${direccion ? `<br><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}" target="_blank" rel="noopener">Abrir en Google Maps</a>` : ''}
      </div>`)
      marca.addTo(capa.current)
      puntos.push([lat, lng])
    }
    if (puntos.length) mapa.current.fitBounds(puntos, { padding: [30, 30], maxZoom: 14 })
  }, [conComuna, centros])

  const conteo = {}
  for (const v of visitas) conteo[estadoDe(v)] = (conteo[estadoDe(v)] || 0) + 1
  return (
    <div style={{ marginBottom: 20 }} data-testid="mapa-visitas">
      <div ref={contenedor} style={{ height: 'min(520px, 65vh)', borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden', zIndex: 0, position: 'relative' }} />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: C.textSub, marginTop: 8, alignItems: 'center' }}>
        {Object.entries(conteo).map(([estado, n]) => {
          const s = VISIT_STATUS_LABELS[estado] || VISIT_STATUS_LABELS.agendada
          return <span key={estado}><span style={{ color: s.color, fontSize: 14 }}>●</span> {s.label}: {n}</span>
        })}
        <span>· {exactas.length} en su dirección</span>
        {aproximadas.length > 0 && <span>· {aproximadas.length} {aproximadas.length === 1 ? 'aproximada' : 'aproximadas'} por comuna (borde punteado)</span>}
        {sinUbicacion.length > 0 && <span style={{ color: C.red }}>· {sinUbicacion.length} sin dirección: {sinUbicacion.slice(0, 5).map(v => v.nombre).join(', ')}{sinUbicacion.length > 5 ? '…' : ''}</span>}
      </div>
    </div>
  )
}
