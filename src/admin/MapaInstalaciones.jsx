import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from './leafletGlobal.js'
import 'leaflet.heat'
import { C, apiFetch, fmt, styles } from './utils.js'
import { ZONAS, comunaDe, zonaDe } from '../../netlify/functions/lib/zonas.mjs'
import { tituloDia } from './materiales.js'
import { crearMapa, descargarMapa, separar, ubicar, useCentrosComunas } from './mapaComun.js'
import { CLAVE_MAPS, buscarUbicaciones } from '../googlePlaces.js'

// Admin → Instalaciones → 🗺 Mapa: donde se han hecho los trabajos (solo los marcados como
// instalados). Puntos pequenos para distinguir cada uno (al tocarlo, su ficha), calor, o burbujas
// por comuna o sector, con tablas de trabajos y montos. Las que no tienen coordenadas van al centro
// de su comuna hasta que se ubican con "📍 Ubicar en el mapa" (Google Places, clave del navegador).
const ZONA_DE = Object.fromEntries(Object.entries(ZONAS).map(([k, z]) => [k, z.nombre]))
const PERIODOS = [['todo', 'Todo'], ['12', 'Últimos 12 meses'], ['6', 'Últimos 6 meses'], ['3', 'Últimos 3 meses']]
const MODOS = [['puntos', '• Puntos'], ['calor', '🔥 Calor'], ['comunas', '⚪ Por comuna'], ['sectores', '🧭 Por sector']]
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const pct = (a, b) => (b ? Math.round(a * 100 / b) : 0)
const chip = activo => ({ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + (activo ? C.orange : C.border), background: activo ? C.orangeLight : C.surface, color: activo ? C.orangeDark : C.textSub })

// Una instalacion como punto del mapa.
function trabajo(q) {
  const i = q.instalacion || {}
  const lat = Number(i.lat), lng = Number(i.lng)
  return {
    id: String(q.cotNum), q, fecha: i.fecha || '', direccion: q.direccion || '', total: Number(q.total) || 0,
    comuna: i.comuna || comunaDe(q.direccion) || '',
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}), ubicacionIntentada: i.lat === '-',
  }
}

function Tabla({ titulo, filas, testid }) {
  const max = Math.max(1, ...filas.map(f => f.total))
  return (
    <div style={{ ...styles.card, padding: 16, overflowX: 'auto' }} data-testid={testid}>
      <div style={styles.cardLabel}>{titulo}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr style={{ color: C.textMuted, textAlign: 'right' }}>
          <th style={{ textAlign: 'left', padding: '4px 6px' }}>Nombre</th><th style={{ minWidth: 120 }} /><th>Trabajos</th><th>%</th><th>Monto</th><th>Ticket promedio</th>
        </tr></thead>
        <tbody>{filas.map(f => (
          <tr key={f.nombre} style={{ borderTop: '1px solid ' + C.border, textAlign: 'right' }}>
            <td style={{ textAlign: 'left', padding: 6, fontWeight: 600, whiteSpace: 'nowrap' }}>{f.nombre}</td>
            <td style={{ padding: 6 }}><div style={{ height: 8, borderRadius: 4, background: C.orange, width: `${Math.max(3, f.total * 100 / max)}%` }} /></td>
            <td style={{ padding: 6, fontWeight: 700 }}>{f.total}</td>
            <td style={{ padding: 6, color: C.textSub }}>{f.pct}%</td>
            <td style={{ padding: 6 }}>{fmt(f.monto)}</td>
            <td style={{ padding: 6, color: C.textSub }}>{f.total ? fmt(Math.round(f.monto / f.total)) : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export default function MapaInstalaciones({ quotes, onRecargar }) {
  const [periodo, setPeriodo] = useState('todo')
  const [modo, setModo] = useState('puntos')
  const [ubicando, setUbicando] = useState('')
  const [error, setError] = useState('')
  const contenedor = useRef(null), mapa = useRef(null), capa = useRef(null)

  const trabajos = useMemo(() => quotes.filter(q => q.status !== 'rechazada' && q.instalacion?.instalada).map(trabajo), [quotes])
  const filtrados = useMemo(() => {
    if (periodo === 'todo') return trabajos
    const desde = new Date(Date.now() - Number(periodo) * 30.4 * 864e5).toISOString().slice(0, 10)
    return trabajos.filter(t => t.fecha >= desde)
  }, [trabajos, periodo])
  const centros = useCentrosComunas(filtrados.map(t => t.comuna))

  const { porComuna, porSector, sinComuna } = useMemo(() => {
    const comunas = {}, sectores = {}
    let sin = 0
    for (const t of filtrados) {
      if (!t.comuna) { sin++; continue }
      for (const [mapaFilas, clave] of [[comunas, t.comuna], [sectores, ZONA_DE[zonaDe(t.comuna)] || 'Otro']]) {
        const f = (mapaFilas[clave] ||= { nombre: clave, total: 0, monto: 0, comunas: new Set() })
        f.total++; f.monto += t.total; f.comunas.add(t.comuna)
      }
    }
    const n = filtrados.length - sin
    const orden = l => l.sort((a, b) => b.total - a.total).map(f => ({ ...f, pct: pct(f.total, n) }))
    return { porComuna: orden(Object.values(comunas)), porSector: orden(Object.values(sectores)), sinComuna: sin }
  }, [filtrados])

  useEffect(() => {
    mapa.current = crearMapa(contenedor.current)
    capa.current = L.layerGroup().addTo(mapa.current)
    return () => { mapa.current.stop(); mapa.current.off(); mapa.current.remove(); mapa.current = null }
  }, [])

  useEffect(() => {
    capa.current.clearLayers()
    const con = filtrados.map(t => ({ t, p: ubicar(t, centros) })).filter(x => x.p)
    const puntos = separar(con.map(x => ({ ...x.p, t: x.t })))
    const limites = []
    if (modo === 'puntos') {
      for (const p of puntos) {
        L.circleMarker([p.lat, p.lng], { radius: 4, weight: 1, color: '#fff', fillColor: p.aprox ? C.textMuted : C.orangeDark, fillOpacity: 0.9 })
          .bindPopup(`<div style="font:13px/1.45 system-ui,sans-serif;min-width:180px"><strong>${esc(p.t.q.nombre || 'Sin nombre')}</strong> · N° ${esc(p.t.id)}<br>
            ${p.t.fecha ? `🔧 ${esc(tituloDia(p.t.fecha))} ${esc(p.t.fecha.slice(0, 4))}<br>` : ''}
            ${p.t.direccion ? `📍 ${esc(p.t.direccion)}${p.aprox ? ' <em style="color:#888">(aprox., centro de la comuna)</em>' : ''}<br>` : ''}
            ${p.t.total ? `💰 ${esc(fmt(p.t.total))}` : ''}</div>`)
          .addTo(capa.current)
        limites.push([p.lat, p.lng])
      }
    } else if (modo === 'calor') {
      if (puntos.length) L.heatLayer(puntos.map(p => [p.lat, p.lng, 1]), { radius: 24, blur: 18, maxZoom: 14, minOpacity: 0.35 }).addTo(capa.current)
      limites.push(...puntos.map(p => [p.lat, p.lng]))
    } else {
      const filas = modo === 'comunas' ? porComuna : porSector
      const max = Math.max(1, ...filas.map(f => f.total))
      for (const f of filas) {
        const cs = [...f.comunas].map(c => centros[c]).filter(Boolean)
        if (!cs.length) continue
        const lat = cs.reduce((s, c) => s + c.lat, 0) / cs.length, lng = cs.reduce((s, c) => s + c.lng, 0) / cs.length
        L.circleMarker([lat, lng], { radius: 8 + 32 * Math.sqrt(f.total / max), color: C.orangeDark, weight: 1.5, fillColor: C.orange, fillOpacity: 0.5 })
          .bindTooltip(`${f.nombre}: ${f.total} (${f.pct}%)`, { permanent: f.total / max > 0.25, direction: 'center', className: 'etiqueta-visita' }).addTo(capa.current)
        limites.push([lat, lng])
      }
    }
    if (limites.length) mapa.current.fitBounds(limites, { padding: [40, 40], maxZoom: 13, animate: false })
  }, [filtrados, centros, modo, porComuna, porSector])

  async function ubicarTodos() {
    setError('')
    const faltan = trabajos.filter(t => t.lat == null && !t.ubicacionIntentada && t.direccion)
      .map(t => ({ id: t.id, texto: [t.direccion, t.comuna, 'Región Metropolitana, Chile'].filter(Boolean).join(', ') }))
    try {
      for (let i = 0; i < faltan.length; i += 50) {
        const tanda = await buscarUbicaciones(faltan.slice(i, i + 50), (n, de) => setUbicando(`${i + n} de ${faltan.length}`))
        const r = await apiFetch('/.netlify/functions/planilla', { method: 'POST', body: JSON.stringify({ accion: 'ubicaciones', ubicaciones: tanda.map(u => ({ cotNum: u.id, lat: u.lat, lng: u.lng, comuna: u.comuna })) }) })
        if (!r.ok) throw new Error(r.error)
      }
      setUbicando(faltan.length ? `✓ ${faltan.length} revisadas` : '✓ No quedan por ubicar')
      onRecargar?.()
    } catch (e) { setError(e.message || 'No se pudo'); setUbicando('') }
  }

  const monto = filtrados.reduce((s, t) => s + t.total, 0)
  const exactas = filtrados.filter(t => t.lat != null).length
  const kpi = (n, t) => <div style={{ ...styles.card, padding: '12px 16px', minWidth: 130 }}><div style={{ fontSize: 20, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 12, color: C.textMuted }}>{t}</div></div>
  return (
    <div style={{ display: 'grid', gap: 14, marginBottom: 18 }} data-testid="mapa-instalaciones">
      <style>{'.etiqueta-visita{font:600 11px system-ui;padding:2px 6px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.25)}'}</style>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODOS.map(([k, n]) => <button key={k} onClick={() => setPeriodo(k)} style={chip(periodo === k)}>{n}</button>)}
        <span style={{ width: 10 }} />
        {MODOS.map(([k, n]) => <button key={k} onClick={() => setModo(k)} style={chip(modo === k)}>{n}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {kpi(filtrados.length, 'trabajos realizados')}
        {kpi(porComuna.length, 'comunas')}
        {kpi(porComuna[0]?.nombre || '—', porComuna[0] ? `la que más (${porComuna[0].pct}%)` : 'la que más')}
        {kpi(fmt(monto), 'monto total')}
        {kpi(filtrados.length ? fmt(Math.round(monto / filtrados.length)) : '—', 'ticket promedio')}
      </div>
      <div>
        <div ref={contenedor} style={{ height: 'min(540px, 65vh)', borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden', position: 'relative', zIndex: 0 }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: C.textSub, marginTop: 6, alignItems: 'center' }}>
          <span>{exactas} en su dirección · {filtrados.length - exactas - sinComuna} aproximadas por comuna (puntos grises)</span>
          {sinComuna > 0 && <span style={{ color: C.red }}>· {sinComuna} sin comuna ni ubicación</span>}
          <button type="button" style={chip(false)} disabled={!!ubicando && !ubicando.startsWith('✓')} onClick={ubicarTodos}
            title={CLAVE_MAPS ? 'Busca en Google la ubicación de los trabajos sin coordenadas y la guarda' : 'Falta VITE_GOOGLE_MAPS_KEY en Netlify'}>
            📍 {ubicando && !ubicando.startsWith('✓') ? `Ubicando ${ubicando}…` : 'Ubicar en el mapa'}
          </button>
          {ubicando.startsWith('✓') && <span style={{ color: C.green, fontWeight: 700 }}>{ubicando}</span>}
          <button type="button" onClick={() => descargarMapa(contenedor.current, 'Instalaciones')} style={{ marginLeft: 'auto', ...chip(false) }}>📷 Descargar imagen</button>
        </div>
        {error && <div style={{ ...styles.errorBox, marginTop: 8 }}>{error}</div>}
      </div>
      <Tabla titulo="Por sector" filas={porSector} testid="instalaciones-sectores" />
      <Tabla titulo="Por comuna" filas={porComuna} testid="instalaciones-comunas" />
    </div>
  )
}
