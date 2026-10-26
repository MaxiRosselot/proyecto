import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from './leafletGlobal.js'
import 'leaflet.heat'
import { C, VISIT_STATUS_LABELS, apiFetch, styles } from './utils.js'
import { ZONAS, zonaDe } from '../../netlify/functions/lib/zonas.mjs'
import { comunaDeVisita, crearMapa, descargarMapa, separar, ubicar, useCentrosComunas } from './mapaComun.js'
import { CLAVE_MAPS, buscarUbicaciones } from '../googlePlaces.js'

// Admin → Visitas → 📊 Concentración: donde se concentran las visitas (todas: las del calendario y
// las antiguas importadas de Calendly a la hoja Visitas), por comuna y por sector, con filtros.
// Aparte de la lista para no entorpecerla. Abajo: importar el CSV de Calendly y ubicarlas en el mapa.
const ZONA_DE = Object.fromEntries(Object.entries(ZONAS).map(([k, z]) => [k, z.nombre]))
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const PERIODOS = [['todo', 'Todo'], ['12', 'Últimos 12 meses'], ['6', 'Últimos 6 meses'], ['3', 'Últimos 3 meses'], ['proximas', 'Próximas']]
const ESTADOS = [
  ['todas', 'Todas'], ['potenciales', 'Realizadas sin cotizar (potenciales)'], ['cotizadas', 'Realizadas y cotizadas'],
  ['realizadas', 'Realizadas (con y sin cotizar)'], ['vigentes', 'Agendadas / confirmadas'], ['cancelada', 'Canceladas'], ['por_revisar', 'Calendly por revisar'],
]
const MODOS = [['calor', '🔥 Calor'], ['comunas', '⚪ Por comuna'], ['sectores', '🧭 Por sector']]
const ZONA_CL = 'America/Santiago'
const horaDe = iso => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: ZONA_CL }).format(new Date(iso)))
const diaDe = iso => new Date(new Date(iso).toLocaleString('en-US', { timeZone: ZONA_CL })).getDay()
const pct = (a, b) => (b ? Math.round(a * 100 / b) : 0)
const chip = activo => ({ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + (activo ? C.orange : C.border), background: activo ? C.orangeLight : C.surface, color: activo ? C.orangeDark : C.textSub })

function cumple(v, estado, filtroEstado) {
  if (filtroEstado === 'todas') return true
  if (filtroEstado === 'potenciales') return estado === 'realizada'
  if (filtroEstado === 'cotizadas') return estado === 'realizada_cotizada'
  if (filtroEstado === 'realizadas') return estado === 'realizada' || estado === 'realizada_cotizada'
  if (filtroEstado === 'vigentes') return ['agendada', 'confirmada', 'reagendar', 'pendiente'].includes(estado)
  return estado === filtroEstado
}

// Tabla de conteos con barra.
function Tabla({ titulo, filas, testid }) {
  const max = Math.max(1, ...filas.map(f => f.total))
  return (
    <div style={{ ...styles.card, padding: 16, overflowX: 'auto' }} data-testid={testid}>
      <div style={styles.cardLabel}>{titulo}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr style={{ color: C.textMuted, textAlign: 'right' }}>
          <th style={{ textAlign: 'left', padding: '4px 6px' }}>Nombre</th><th style={{ padding: '4px 6px', minWidth: 120 }} /><th>Visitas</th><th>%</th><th>Realizadas</th><th>Cotizadas</th><th title="Cotizadas / realizadas">Cotiza</th><th>Canceladas</th>
        </tr></thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.nombre} style={{ borderTop: '1px solid ' + C.border, textAlign: 'right' }}>
              <td style={{ textAlign: 'left', padding: '6px', fontWeight: 600, whiteSpace: 'nowrap' }}>{f.nombre}</td>
              <td style={{ padding: '6px' }}><div style={{ height: 8, borderRadius: 4, background: C.orange, width: `${Math.max(3, f.total * 100 / max)}%` }} /></td>
              <td style={{ padding: '6px', fontWeight: 700 }}>{f.total}</td>
              <td style={{ padding: '6px', color: C.textSub }}>{f.pct}%</td>
              <td style={{ padding: '6px' }}>{f.realizadas}</td>
              <td style={{ padding: '6px' }}>{f.cotizadas}</td>
              <td style={{ padding: '6px', color: C.textSub }}>{f.realizadas ? `${pct(f.cotizadas, f.realizadas)}%` : '—'}</td>
              <td style={{ padding: '6px', color: f.canceladas ? C.red : C.textMuted }}>{f.canceladas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Barras({ titulo, datos }) {
  const max = Math.max(1, ...datos.map(d => d[1]))
  return (
    <div style={{ ...styles.card, padding: 16 }}>
      <div style={styles.cardLabel}>{titulo}</div>
      <div style={{ display: 'grid', gap: 5 }}>
        {datos.map(([nombre, n]) => (
          <div key={nombre} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 34px', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ color: C.textSub }}>{nombre}</span>
            <div style={{ height: 10, borderRadius: 5, background: C.bg }}><div style={{ height: 10, borderRadius: 5, background: C.blue, width: `${n * 100 / max}%` }} /></div>
            <span style={{ fontWeight: 700, textAlign: 'right' }}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Importar el CSV de Calendly (Events → Export) y ubicarlas en el mapa.
function ImportarCalendly({ visitas, onListo }) {
  const [archivo, setArchivo] = useState(null)
  const [vista, setVista] = useState(null)
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')
  async function enviar(accion) {
    setEstado(accion); setError('')
    try {
      const r = await apiFetch('/.netlify/functions/importar-visitas', { method: 'POST', body: JSON.stringify({ accion, csv: archivo.texto }) })
      if (!r.ok) throw new Error(r.error)
      setVista({ ...r.resumen, importadas: r.importadas })
      if (accion === 'importar') onListo()
    } catch (e) { setError(e.message || 'No se pudo') } finally { setEstado('') }
  }
  async function ubicar() {
    setEstado('ubicar'); setError('')
    let total = 0, sin = 0
    try {
      // Con la clave del navegador (Places): se buscan aqui y se guardan de a 50.
      if (CLAVE_MAPS) {
        const faltan = visitas.filter(v => !Number.isFinite(v.lat) && !v.ubicacionIntentada && v.direccion)
          .map(v => ({ id: v.id, texto: [v.direccion, v.comuna, 'Región Metropolitana, Chile'].filter(Boolean).join(', ') }))
        for (let i = 0; i < faltan.length; i += 50) {
          const tanda = await buscarUbicaciones(faltan.slice(i, i + 50))
          const r = await apiFetch('/.netlify/functions/importar-visitas', { method: 'POST', body: JSON.stringify({ accion: 'guardar-ubicaciones', ubicaciones: tanda }) })
          if (!r.ok) throw new Error(r.error)
          total += tanda.filter(u => u.lat !== '-').length; sin += tanda.filter(u => u.lat === '-').length
          setVista(v => ({ ...(v || {}), ubicadas: total, sinUbicar: sin, quedan: faltan.length - i - tanda.length }))
        }
        if (!faltan.length) setVista(v => ({ ...(v || {}), ubicadas: 0, sinUbicar: 0, quedan: 0 }))
        onListo(); return
      }
      for (let vuelta = 0; vuelta < 30; vuelta++) {
        const r = await apiFetch('/.netlify/functions/importar-visitas', { method: 'POST', body: JSON.stringify({ accion: 'ubicar' }) })
        if (!r.ok) throw new Error(r.error)
        total += r.ubicadas; sin += r.sinResultado
        setVista(v => ({ ...(v || {}), ubicadas: total, sinUbicar: sin, quedan: r.quedan }))
        if (!r.quedan) break
      }
      onListo()
    } catch (e) { setError(e.message || 'No se pudo') } finally { setEstado('') }
  }
  const N = VISIT_STATUS_LABELS
  return (
    <div style={{ ...styles.card, padding: 16 }} data-testid="importar-calendly">
      <div style={styles.cardLabel}>Visitas antiguas de Calendly</div>
      <p style={{ fontSize: 12.5, color: C.textSub, marginTop: 0 }}>Sube el CSV que exporta Calendly (Events → Export). Quedan en la hoja Visitas: las pasadas como Realizadas (o Realizadas y cotizadas si el cliente tiene cotización), para hacerles seguimiento. Si lo subes de nuevo, no se repiten.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="file" accept=".csv,text/csv" aria-label="Archivo CSV de Calendly"
          onChange={async e => { const f = e.target.files?.[0]; setVista(null); setArchivo(f ? { nombre: f.name, texto: await f.text() } : null) }} style={{ fontSize: 12 }} />
        <button type="button" style={styles.btnSecondary} disabled={!archivo || !!estado} onClick={() => enviar('simular')}>{estado === 'simular' ? 'Revisando…' : 'Revisar'}</button>
        <button type="button" style={styles.btnPrimary} disabled={!archivo || !vista?.nuevas || !!estado || vista?.importadas != null} onClick={() => enviar('importar')}>{estado === 'importar' ? 'Importando…' : `Importar ${vista?.nuevas || ''}`}</button>
        <button type="button" style={styles.btnSecondary} disabled={!!estado} onClick={ubicar} title="Busca en Google la ubicación de las visitas sin coordenadas y la guarda">{estado === 'ubicar' ? 'Ubicando…' : '📍 Ubicar en el mapa'}</button>
      </div>
      {vista && (
        <div role="status" style={{ fontSize: 12.5, marginTop: 10, display: 'grid', gap: 3 }}>
          {vista.leidas != null && <span>{vista.leidas} en el archivo · <strong>{vista.nuevas} nuevas</strong> · {vista.repetidas} ya estaban{vista.sinComuna ? ` · ${vista.sinComuna} sin comuna en la dirección` : ''}</span>}
          {vista.porEstado && <span>{Object.entries(vista.porEstado).map(([k, n]) => `${N[k]?.label || k}: ${n}`).join(' · ')}</span>}
          {vista.importadas != null && <span style={{ color: C.green, fontWeight: 700 }}>✓ {vista.importadas} visitas agregadas a la hoja Visitas</span>}
          {vista.ubicadas != null && <span style={{ color: C.green, fontWeight: 700 }}>📍 {vista.ubicadas} ubicadas{vista.sinUbicar ? ` · ${vista.sinUbicar} sin resultado (quedan por comuna)` : ''}{vista.quedan ? ` · quedan ${vista.quedan}` : ''}</span>}
        </div>
      )}
      {error && <div style={{ ...styles.errorBox, marginTop: 8 }}>{error}</div>}
    </div>
  )
}

export default function Concentracion({ visitas, estadoDe, onRecargar }) {
  const [periodo, setPeriodo] = useState('todo')
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [modo, setModo] = useState('calor')
  const [origen, setOrigen] = useState('todas')
  const contenedor = useRef(null), mapa = useRef(null), capa = useRef(null)
  const centros = useCentrosComunas(visitas.map(comunaDeVisita))

  const filtradas = useMemo(() => {
    const ahora = Date.now()
    return visitas.filter(v => {
      const t = new Date(v.start).getTime()
      if (periodo === 'proximas' ? t < ahora : periodo !== 'todo' && (t < ahora - Number(periodo) * 30.4 * 864e5 || t > ahora)) return false
      if (origen !== 'todas' && (origen === 'calendly' ? v.origen !== 'Calendly' : v.origen === 'Calendly')) return false
      return cumple(v, estadoDe(v), filtroEstado)
    })
  }, [visitas, periodo, filtroEstado, origen, estadoDe])

  // Conteos por comuna y por sector.
  const { porComuna, porSector, sinComuna } = useMemo(() => {
    const acc = (mapa, clave) => (mapa[clave] ||= { nombre: clave, total: 0, realizadas: 0, cotizadas: 0, canceladas: 0, comunas: new Set() })
    const comunas = {}, sectores = {}
    let sin = 0
    for (const v of filtradas) {
      const comuna = comunaDeVisita(v)
      if (!comuna) { sin++; continue }
      const e = estadoDe(v)
      for (const fila of [acc(comunas, comuna), acc(sectores, ZONA_DE[zonaDe(comuna)] || 'Otro')]) {
        fila.total++; fila.comunas.add(comuna)
        if (e === 'realizada' || e === 'realizada_cotizada') fila.realizadas++
        if (e === 'realizada_cotizada') fila.cotizadas++
        if (e === 'cancelada') fila.canceladas++
      }
    }
    const conTotal = Object.values(comunas).reduce((s, f) => s + f.total, 0)
    const orden = l => l.sort((a, b) => b.total - a.total).map(f => ({ ...f, pct: pct(f.total, conTotal) }))
    return { porComuna: orden(Object.values(comunas)), porSector: orden(Object.values(sectores)), sinComuna: sin }
  }, [filtradas, estadoDe])

  const porDia = DIAS.map((d, i) => [d, filtradas.filter(v => diaDe(v.start) === i).length]).filter(([, n], i) => n || i === 0 || i === 6)
  const porHora = [['8 a 11', 8, 11], ['11 a 14', 11, 14], ['14 a 17', 14, 17], ['17 a 20', 17, 20], ['Otra', 0, 0]]
    .map(([n, a, b]) => [n, filtradas.filter(v => { const h = horaDe(v.start); return n === 'Otra' ? h < 8 || h >= 20 : h >= a && h < b }).length])

  useEffect(() => {
    mapa.current = crearMapa(contenedor.current)
    capa.current = L.layerGroup().addTo(mapa.current)
    return () => { mapa.current.stop(); mapa.current.off(); mapa.current.remove(); mapa.current = null }
  }, [])

  // El mapa segun el modo: calor (cada visita), burbujas por comuna o por sector.
  useEffect(() => {
    capa.current.clearLayers()
    const puntos = separar(filtradas.map(v => ubicar(v, centros)).filter(Boolean))
    const limites = []
    if (modo === 'calor') {
      if (puntos.length) L.heatLayer(puntos.map(p => [p.lat, p.lng, 1]), { radius: 26, blur: 20, maxZoom: 14, minOpacity: 0.35 }).addTo(capa.current)
      limites.push(...puntos.map(p => [p.lat, p.lng]))
    } else {
      const filas = modo === 'comunas' ? porComuna : porSector
      const max = Math.max(1, ...filas.map(f => f.total))
      for (const f of filas) {
        const cs = [...f.comunas].map(c => centros[c]).filter(Boolean)
        if (!cs.length) continue
        const lat = cs.reduce((s, c) => s + c.lat, 0) / cs.length, lng = cs.reduce((s, c) => s + c.lng, 0) / cs.length
        L.circleMarker([lat, lng], { radius: 8 + 32 * Math.sqrt(f.total / max), color: C.orangeDark, weight: 1.5, fillColor: C.orange, fillOpacity: 0.5 })
          .bindTooltip(`${f.nombre}: ${f.total} (${f.pct}%)`, { permanent: f.total / max > 0.25, direction: 'center', className: 'etiqueta-visita' })
          .addTo(capa.current)
        limites.push([lat, lng])
      }
    }
    if (limites.length) mapa.current.fitBounds(limites, { padding: [40, 40], maxZoom: 13, animate: false })
  }, [filtradas, centros, modo, porComuna, porSector])

  const realizadas = filtradas.filter(v => ['realizada', 'realizada_cotizada'].includes(estadoDe(v))).length
  const cotizadas = filtradas.filter(v => estadoDe(v) === 'realizada_cotizada').length
  const kpi = (n, t) => <div style={{ ...styles.card, padding: '12px 16px', minWidth: 130 }}><div style={{ fontSize: 22, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 12, color: C.textMuted }}>{t}</div></div>

  return (
    <div style={{ display: 'grid', gap: 14 }} data-testid="concentracion">
      <style>{'.etiqueta-visita{font:600 11px system-ui;padding:2px 6px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.25)}'}</style>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{PERIODOS.map(([k, n]) => <button key={k} onClick={() => setPeriodo(k)} style={chip(periodo === k)}>{n}</button>)}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{ESTADOS.map(([k, n]) => <button key={k} onClick={() => setFiltroEstado(k)} style={chip(filtroEstado === k)}>{n}</button>)}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {MODOS.map(([k, n]) => <button key={k} onClick={() => setModo(k)} style={chip(modo === k)}>{n}</button>)}
          <span style={{ width: 10 }} />
          {[['todas', 'Todas las fuentes'], ['calendly', 'Solo Calendly'], ['web', 'Solo web actual']].map(([k, n]) => <button key={k} onClick={() => setOrigen(k)} style={chip(origen === k)}>{n}</button>)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {kpi(filtradas.length, 'visitas')}
        {kpi(porComuna.length, 'comunas')}
        {kpi(porComuna[0] ? `${porComuna[0].nombre}` : '—', porComuna[0] ? `la que más (${porComuna[0].pct}%)` : 'la que más')}
        {kpi(realizadas ? `${pct(cotizadas, realizadas)}%` : '—', 'de las realizadas se cotizó')}
        {kpi(realizadas - cotizadas, 'realizadas sin cotizar (potenciales)')}
      </div>

      <div>
        <div ref={contenedor} style={{ height: 'min(560px, 65vh)', borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden', position: 'relative', zIndex: 0 }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: C.textSub, marginTop: 6, alignItems: 'center' }}>
          <span>Las visitas sin coordenadas se cuentan en el centro de su comuna.</span>
          {sinComuna > 0 && <span style={{ color: C.red }}>{sinComuna} sin comuna ni ubicación (no salen en el mapa ni en las tablas): usa "📍 Ubicar en el mapa".</span>}
          <button type="button" onClick={() => descargarMapa(contenedor.current, 'Concentracion visitas')} style={{ marginLeft: 'auto', ...chip(false) }}>📷 Descargar imagen</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Barras titulo="Por día de la semana" datos={porDia} />
        <Barras titulo="Por horario" datos={porHora} />
      </div>
      <Tabla titulo="Por sector" filas={porSector} testid="tabla-sectores" />
      <Tabla titulo="Por comuna" filas={porComuna} testid="tabla-comunas" />
      <ImportarCalendly visitas={visitas} onListo={onRecargar} />
    </div>
  )
}
