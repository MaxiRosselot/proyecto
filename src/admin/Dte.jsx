import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { C, apiFetch, fmt, styles } from './utils.js'
import { documentosEmitidos, documentosPorEmitir } from '../../netlify/functions/lib/resumen-instalaciones.mjs'
import { detalleBoleta, emitido } from '../../netlify/functions/lib/documentos.mjs'

// DTE: los documentos tributarios. Arriba los por emitir (B*, F*...) con el detalle listo para el
// portal e-Boleta del SII; al emitir se marcan (B* → B). Abajo los emitidos, con su folio, por
// donde se emitieron y el PDF para descargar.
const fechaCorta = iso => { if (!iso) return 'Sin fecha'; const d = new Date(iso + 'T12:00:00Z'); return new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d) }
const fechaLarga = iso => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'))

export default function DteSection() {
  const [cotizaciones, setCotizaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [emitiendo, setEmitiendo] = useState('')
  const [ultimo, setUltimo] = useState(null)
  const [copiado, setCopiado] = useState('')
  const [mes, setMes] = useState('todos')

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const r = await apiFetch('/.netlify/functions/get-quotes')
      if (r.error) throw new Error(r.error)
      setCotizaciones(r.quotes || [])
    } catch (e) { setError(e.message || 'No se pudieron leer las ventas') }
    finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const porEmitir = useMemo(() => documentosPorEmitir(cotizaciones), [cotizaciones])
  const emitidos = useMemo(() => documentosEmitidos(cotizaciones), [cotizaciones])
  const meses = useMemo(() => [...new Set(porEmitir.map(p => (p.fecha || '').slice(0, 7)).filter(Boolean))].sort(), [porEmitir])
  const lista = mes === 'todos' ? porEmitir : porEmitir.filter(p => (p.fecha || '').startsWith(mes))

  async function guardar(cotNum, cambios) {
    setEmitiendo(cotNum); setError('')
    try {
      const r = await apiFetch('/.netlify/functions/planilla', { method: 'POST', body: JSON.stringify({ accion: 'actualizar', cotNum, cambios }) })
      if (!r.ok) throw new Error(r.error || 'No se pudo guardar')
      setCotizaciones(prev => prev.map(c => (c.cotNum === cotNum ? r.cotizacion : c)))
      return true
    } catch (e) { setError(e.message); return false } finally { setEmitiendo('') }
  }
  async function marcarEmitida(p) { if (await guardar(p.cotNum, { documento: emitido(p.documento) })) setUltimo(p) }
  async function deshacer() { if (ultimo && await guardar(ultimo.cotNum, { documento: ultimo.documento })) setUltimo(null) }
  async function copiar(texto, clave) {
    try { await navigator.clipboard.writeText(texto); setCopiado(clave); setTimeout(() => setCopiado(''), 1500) } catch { /* sin portapapeles */ }
  }

  const chip = activo => ({ padding: '5px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', border: '1.5px solid ' + (activo ? C.orange : C.border), background: activo ? C.orangeLight : 'white', color: activo ? C.orangeDark : C.textSub })
  const fila = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, padding: '8px 0', borderTop: '1px solid ' + C.border }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ ...styles.sectionTitle, fontSize: 20 }}>Documentos tributarios</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="https://eboleta.sii.cl/" target="_blank" rel="noreferrer" style={{ ...styles.btnSecondary, fontSize: 12, padding: '7px 12px', textDecoration: 'none' }}>Abrir e-Boleta SII ↗</a>
          <button onClick={cargar} style={{ ...styles.btnSecondary, fontSize: 12, padding: '7px 12px' }}>{cargando ? 'Cargando...' : 'Actualizar'}</button>
        </div>
      </div>
      {error && <div style={styles.errorBox}>{error}</div>}

      <div data-testid="dte-por-emitir" style={{ ...styles.card, padding: '14px 18px', marginBottom: 14, border: '1px solid #FCD34D', background: '#FFFBEB' }}>
        <div style={{ fontSize: 14, color: '#92400E', marginBottom: 8 }}>
          🧾 <strong>{porEmitir.length ? `${porEmitir.length} por emitir` : 'Todo emitido'}</strong>
          {porEmitir.length > 0 && <> · {fmt(porEmitir.reduce((s, p) => s + p.total, 0))} con IVA</>}
        </div>
        {meses.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <button onClick={() => setMes('todos')} style={chip(mes === 'todos')}>Todos</button>
            {meses.map(m => <button key={m} onClick={() => setMes(m)} style={chip(mes === m)}>{new Intl.DateTimeFormat('es-CL', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(m + '-15T12:00:00Z'))} · {porEmitir.filter(p => p.fecha.startsWith(m)).length}</button>)}
          </div>
        )}
        {ultimo && (
          <div style={{ margin: '6px 0', fontSize: 12.5, color: C.green, display: 'flex', alignItems: 'center', gap: 8 }}>
            ✓ {ultimo.cliente} (N° {ultimo.cotNum}) quedó como {emitido(ultimo.documento)}.
            <button onClick={deshacer} disabled={Boolean(emitiendo)} style={{ ...styles.btnSecondary, fontSize: 11.5, padding: '3px 10px' }}>Deshacer</button>
          </div>
        )}
        {lista.map(p => {
          const detalle = detalleBoleta(p.cliente)
          return (
            <div key={p.cotNum} style={{ ...fila, borderTopColor: '#FDE68A' }}>
              <span style={{ color: C.textMuted, minWidth: 80 }}>{fechaCorta(p.fecha)}</span>
              <strong style={{ minWidth: 40, color: C.red }}>{p.documento}</strong>
              <strong style={{ minWidth: 86 }}>{fmt(p.total)}</strong>
              <span style={{ flex: 1, minWidth: 160, color: C.textSub }}>{p.cliente} · N° {p.cotNum}{p.email ? <span style={{ color: C.textMuted }}> · {p.email}</span> : null}</span>
              <button onClick={() => copiar(detalle, p.cotNum)} title={detalle} style={{ ...styles.btnSecondary, fontSize: 12, padding: '5px 10px' }}>{copiado === p.cotNum ? 'Copiado ✓' : 'Copiar detalle'}</button>
              <button onClick={() => marcarEmitida(p)} disabled={Boolean(emitiendo)} aria-label={`Marcar ${p.documento} de ${p.cliente} como emitida`}
                style={{ ...styles.btnSecondary, fontSize: 12, padding: '5px 12px', color: C.green, borderColor: C.green, opacity: emitiendo && emitiendo !== p.cotNum ? 0.5 : 1 }}>
                {emitiendo === p.cotNum ? 'Guardando...' : `✓ Emitida (${emitido(p.documento)})`}
              </button>
            </div>
          )
        })}
      </div>

      <div data-testid="dte-emitidos" style={{ ...styles.card, padding: '14px 18px' }}>
        <div style={{ fontSize: 14, marginBottom: 6 }}><strong>Emitidos</strong> <span style={{ color: C.textMuted }}>· {emitidos.length} con folio anotado</span></div>
        {emitidos.length === 0 && <div style={{ fontSize: 13, color: C.textMuted, padding: '8px 0' }}>Todavía no hay documentos con folio anotado.</div>}
        {emitidos.map(d => (
          <div key={d.cotNum} style={fila}>
            <span style={{ color: C.textMuted, minWidth: 90 }}>{fechaLarga(d.fecha)}</span>
            <strong style={{ minWidth: 110 }}>{d.tipo === 'factura' ? 'Factura' : 'Boleta'} N° {d.folio}</strong>
            <strong style={{ minWidth: 86 }}>{fmt(d.monto)}</strong>
            <span style={{ flex: 1, minWidth: 160, color: C.textSub }}>{d.cliente} · venta N° {d.cotNum}<br /><span style={{ fontSize: 11.5, color: C.textMuted }}>{d.detalle}{d.receptor ? ` · enviada a ${d.receptor}` : ''}</span></span>
            <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 99, background: '#EEF0F3', color: C.textSub }}>{d.via}</span>
            {d.pdf
              ? <a href={d.pdf} target="_blank" rel="noreferrer" style={{ ...styles.btnSecondary, fontSize: 12, padding: '5px 12px', textDecoration: 'none' }}>Descargar PDF</a>
              : <span style={{ fontSize: 12, color: C.textMuted }}>Sin PDF</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
