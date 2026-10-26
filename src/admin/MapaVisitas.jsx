import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { C, VISIT_STATUS_LABELS, fmtDate } from './utils.js'
import { horarioVisita } from './listaVisitas.js'
import { comunaDeVisita, crearMapa, descargarMapa, separar, ubicar, useCentrosComunas } from './mapaComun.js'

// Visitas en un mapa (OpenStreetMap, sin clave ni costo): Admin → Visitas → 🗺 Mapa (las de la
// pestaña elegida) y "Mapa del día" de las proximas visitas (para mandarselo a quien las hace).
// Solo la Region Metropolitana; el zoom se ajusta para que se vean todas.
//   · con coordenadas (autocompletado de /visita o ubicadas con GOOGLE_MAPS_SERVER_KEY): punto lleno;
//   · sin coordenadas: borde punteado en el centro de su comuna (aproximada).
// numerar: los puntos llevan el orden (por hora) en vez de un circulo simple.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export default function MapaVisitas({ visitas, estadoDe, numerar = false, descargable = '', alto = 'min(520px, 65vh)' }) {
  const contenedor = useRef(null), mapa = useRef(null), capa = useRef(null)
  const [descargando, setDescargando] = useState(false)
  const centros = useCentrosComunas(visitas.map(comunaDeVisita))

  const ordenadas = numerar ? [...visitas].sort((a, b) => new Date(a.start) - new Date(b.start)) : visitas
  const conPunto = ordenadas.map((v, i) => ({ v, i, punto: ubicar(v, centros) }))
  const dibujables = separar(conPunto.filter(x => x.punto).map(x => ({ ...x.punto, x }))).map(p => ({ ...p.x, punto: p }))
  const exactas = dibujables.filter(d => !d.punto.aprox).length
  const fuera = conPunto.filter(x => !x.punto)

  useEffect(() => {
    mapa.current = crearMapa(contenedor.current)
    capa.current = L.layerGroup().addTo(mapa.current)
    return () => { mapa.current.remove(); mapa.current = null }
  }, [])

  useEffect(() => {
    capa.current.clearLayers()
    for (const { v, i, punto } of dibujables) {
      const estado = VISIT_STATUS_LABELS[estadoDe(v)] || VISIT_STATUS_LABELS.agendada
      const marca = numerar
        ? L.marker([punto.lat, punto.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13],
            html: `<div style="width:26px;height:26px;border-radius:50%;background:${estado.color};color:#fff;font:700 13px system-ui;display:flex;align-items:center;justify-content:center;border:2px ${punto.aprox ? 'dashed' : 'solid'} #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${i + 1}</div>` }) })
        : L.circleMarker([punto.lat, punto.lng], {
            radius: 9, color: punto.aprox ? estado.color : '#fff', weight: punto.aprox ? 2.5 : 2, dashArray: punto.aprox ? '3 3' : null,
            fillColor: estado.color, fillOpacity: punto.aprox ? 0.35 : 0.9,
          })
      const direccion = v.direccion || comunaDeVisita(v)
      marca.bindPopup(`<div style="font:13px/1.45 system-ui,sans-serif;min-width:190px">
        <strong style="font-size:14px">${numerar ? `${i + 1}. ` : ''}${esc(v.nombre || 'Sin nombre')}</strong><br>
        📅 ${esc(fmtDate(v.start))} · ${esc(horarioVisita(v))}<br>
        ${direccion ? `📍 ${esc(direccion)}${punto.aprox ? ' <em style="color:#888">(ubicación aproximada)</em>' : ''}<br>` : ''}
        ${v.celular ? `📞 ${esc(v.celular)}<br>` : ''}
        <span style="color:${estado.color};font-weight:700">● ${esc(estado.label)}</span>
        ${direccion ? `<br><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}" target="_blank" rel="noopener">Abrir en Google Maps</a>` : ''}
      </div>`)
      if (numerar) marca.bindTooltip(`${i + 1}. ${esc(v.nombre || '')} · ${esc(horarioVisita(v))}`, { permanent: true, direction: 'right', offset: [14, 0], className: 'etiqueta-visita' })
      marca.addTo(capa.current)
    }
    const puntos = dibujables.map(d => [d.punto.lat, d.punto.lng])
    if (puntos.length) mapa.current.fitBounds(puntos, { padding: [40, 40], maxZoom: 15 })
  }, [JSON.stringify(dibujables.map(d => [d.v.id, d.punto.lat, d.punto.lng, estadoDe(d.v)]))])

  async function descargar() {
    setDescargando(true)
    mapa.current.closePopup()
    try { await descargarMapa(contenedor.current, descargable) } finally { setDescargando(false) }
  }

  const conteo = {}
  for (const v of visitas) conteo[estadoDe(v)] = (conteo[estadoDe(v)] || 0) + 1
  return (
    <div style={{ marginBottom: 20 }} data-testid="mapa-visitas">
      <style>{'.etiqueta-visita{font:600 11px system-ui;padding:2px 6px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.25)}'}</style>
      <div ref={contenedor} style={{ height: alto, borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden', zIndex: 0, position: 'relative' }} />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: C.textSub, marginTop: 8, alignItems: 'center' }}>
        {Object.entries(conteo).map(([estado, n]) => {
          const s = VISIT_STATUS_LABELS[estado] || VISIT_STATUS_LABELS.agendada
          return <span key={estado}><span style={{ color: s.color, fontSize: 14 }}>●</span> {s.label}: {n}</span>
        })}
        <span>· {exactas} en su dirección</span>
        {dibujables.length - exactas > 0 && <span>· {dibujables.length - exactas} {dibujables.length - exactas === 1 ? 'aproximada' : 'aproximadas'} por comuna (borde punteado)</span>}
        {fuera.length > 0 && <span style={{ color: C.red }}>· {fuera.length} sin ubicar o fuera de la RM: {fuera.slice(0, 4).map(x => x.v.nombre).join(', ')}{fuera.length > 4 ? '…' : ''}</span>}
        {descargable && (
          <button type="button" onClick={descargar} disabled={descargando} style={{ ...{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + C.border, background: C.surface, color: C.text } }}>
            {descargando ? 'Preparando…' : '📷 Descargar imagen'}
          </button>
        )}
      </div>
    </div>
  )
}
