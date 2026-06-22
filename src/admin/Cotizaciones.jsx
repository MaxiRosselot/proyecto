import React, { useEffect, useState, useCallback } from 'react'
import { QUOTE_STATUS_LABELS, apiFetch, fmtDate, styles } from './utils.js'

function QuoteBadge({ status }) {
  const s = QUOTE_STATUS_LABELS[status] || QUOTE_STATUS_LABELS['por confirmar']
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 99,
      fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase',
      background: s.color + '22', color: s.color, border: `1px solid ${s.color}44`,
    }}>{s.label}</span>
  )
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={styles.sectionTitle}>📄 Cotizaciones</h2>
        <button onClick={load} style={styles.btnSecondary}>↻ Actualizar</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {Object.entries(QUOTE_STATUS_LABELS).map(([key, { label, color }]) => (
          <div key={key} style={{ ...styles.card, textAlign: 'center', borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{byStatus[key]?.length || 0}</div>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
          </div>
        ))}
      </div>

      {loading && <div style={styles.empty}>Cargando cotizaciones…</div>}
      {error   && <div style={styles.errorBox}>{error}</div>}
      {!loading && !error && quotes.length === 0 && <div style={styles.empty}>No hay cotizaciones guardadas aún.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {quotes.map(q => {
          const isUpdating = updating === q.cotNum
          return (
            <div key={q.cotNum} style={{ ...styles.card, display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{q.nombre}</span>
                  <span style={{ fontSize: 12, color: '#aaa' }}>N° {q.cotNum}</span>
                  <QuoteBadge status={q.status} />
                </div>
                <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {q.fechaVisita && <span>Visita: {q.fechaVisita}</span>}
                  {q.total       && <span style={{ fontWeight: 700, color: '#D4600A' }}>{q.total}</span>}
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
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        cursor: active ? 'default' : 'pointer',
                        border: `1.5px solid ${active ? sl.color : '#ddd'}`,
                        background: active ? sl.color + '22' : 'white',
                        color: active ? sl.color : '#666',
                        opacity: isUpdating ? .5 : 1,
                      }}>{sl.label}</button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
