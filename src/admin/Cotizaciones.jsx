import React, { useEffect, useState, useCallback } from 'react'
import { QUOTE_STATUS_LABELS, C, apiFetch, styles } from './utils.js'

function Badge({ status }) {
  const s = QUOTE_STATUS_LABELS[status] || QUOTE_STATUS_LABELS['por confirmar']
  return <span style={styles.badge(s.color)}>{s.label}</span>
}

export default function CotizacionesSection() {
  const [quotes, setQuotes]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [updating, setUpdating] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await apiFetch('/.netlify/functions/get-quotes')
      if (data.ok) setQuotes(data.quotes)
      else setError(data.error || 'Error al cargar cotizaciones')
    } catch { setError('No se pudo conectar') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function updateStatus(cotNum, newStatus, quote) {
    setUpdating(cotNum)
    try {
      await apiFetch('/.netlify/functions/save-quote', {
        method: 'POST',
        body: JSON.stringify({ ...quote, cotNum, status: newStatus }),
      })
      setQuotes(prev => prev.map(q => q.cotNum === cotNum ? { ...q, status: newStatus } : q))
    } catch { alert('Error al actualizar estado') }
    finally { setUpdating(null) }
  }

  const byStatus = {
    'por confirmar': quotes.filter(q => q.status === 'por confirmar'),
    'confirmada':    quotes.filter(q => q.status === 'confirmada'),
    'rechazada':     quotes.filter(q => q.status === 'rechazada'),
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={styles.sectionTitle}>Cotizaciones</h2>
        <button onClick={load} style={styles.btnSecondary}>Actualizar</button>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {Object.entries(QUOTE_STATUS_LABELS).map(([key, { label, color }]) => (
          <div key={key} style={{ ...styles.card, textAlign: 'center', paddingTop: 22, paddingBottom: 22 }}>
            <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1, marginBottom: 6 }}>
              {byStatus[key]?.length || 0}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8 }}>{label}</div>
            <div style={{ marginTop: 12, height: 3, borderRadius: 2, background: color + '30', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2, background: color, width: quotes.length ? (byStatus[key]?.length / quotes.length * 100) + '%' : '0%', transition: 'width .4s' }}/>
            </div>
          </div>
        ))}
      </div>

      {loading && <div style={styles.empty}>Cargando cotizaciones...</div>}
      {error   && <div style={styles.errorBox}>{error}</div>}
      {!loading && !error && quotes.length === 0 && <div style={styles.empty}>No hay cotizaciones guardadas aun.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {quotes.map(q => {
          const isUpdating = updating === q.cotNum
          const statusColor = QUOTE_STATUS_LABELS[q.status]?.color || C.border
          return (
            <div key={q.cotNum} style={{ ...styles.card, borderLeft: '3px solid ' + statusColor }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 5 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{q.nombre}</span>
                    <span style={{ fontSize: 12, color: C.textMuted, background: C.bg, padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>N {q.cotNum}</span>
                    <Badge status={q.status} />
                  </div>
                  <div style={{ fontSize: 12, color: C.textSub, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {q.fechaVisita && <span>Visita: {q.fechaVisita}</span>}
                    {q.total       && <span style={{ fontWeight: 700, color: C.orangeDark }}>{q.total}</span>}
                    {q.email       && <span>{q.email}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {Object.entries(QUOTE_STATUS_LABELS).map(([s, sl]) => {
                    const active = q.status === s
                    return (
                      <button key={s}
                        onClick={() => !active && !isUpdating && updateStatus(q.cotNum, s, q)}
                        disabled={active || isUpdating}
                        style={{
                          padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                          cursor: active ? 'default' : 'pointer',
                          border: '1.5px solid ' + (active ? sl.color : C.border),
                          background: active ? sl.color + '18' : C.surface,
                          color: active ? sl.color : C.textSub,
                          opacity: isUpdating ? .5 : 1, transition: 'all .15s',
                        }}>{sl.label}</button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
