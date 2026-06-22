import React, { useEffect, useState, useCallback } from 'react'
import { VISIT_STATUS_LABELS, apiFetch, fmtDate, fmtTime, styles } from './utils.js'

function VisitBadge({ status }) {
  const s = VISIT_STATUS_LABELS[status] || VISIT_STATUS_LABELS.pendiente
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 99,
      fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase',
      background: s.color + '22', color: s.color, border: `1px solid ${s.color}44`,
    }}>{s.label}</span>
  )
}

function StatusBtn({ current, target, label, onClick, loading }) {
  const s = VISIT_STATUS_LABELS[target]
  const active = current === target
  return (
    <button onClick={() => !active && !loading && onClick(target)} disabled={active || loading}
      style={{
        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
        cursor: active ? 'default' : 'pointer',
        border: `1.5px solid ${active ? s.color : '#ddd'}`,
        background: active ? s.color + '22' : 'white',
        color: active ? s.color : '#555',
        opacity: loading ? .5 : 1, transition: 'all .15s',
      }}>{label}</button>
  )
}

export default function VisitasSection({ statuses, onStatusChange, navigateTo, onVisitsLoaded }) {
  const [visits, setVisits]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState('por-realizar')
  const [updating, setUpdating] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await apiFetch('/.netlify/functions/get-visits')
      if (data.ok) { setVisits(data.visits); onVisitsLoaded?.(data.visits) }
      else setError(data.error || 'Error al cargar visitas')
    } catch { setError('No se pudo conectar') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleStatus(visit, newStatus) {
    setUpdating(visit.id)
    try {
      await apiFetch('/.netlify/functions/update-visit-status', {
        method: 'POST',
        body: JSON.stringify({
          visitId: visit.id, nombre: visit.nombre,
          fecha: fmtDate(visit.start), hora: fmtTime(visit.start),
          email: visit.email, celular: visit.celular,
          direccion: visit.direccion, status: newStatus, notas: visit.notas,
        }),
      })
      onStatusChange(visit.id, newStatus)
    } catch { alert('Error al actualizar estado') }
    finally { setUpdating(null) }
  }

  const now = new Date()
  const porRealizar = visits.filter(v => new Date(v.start) >= now)
  const realizadas  = visits.filter(v => new Date(v.start) < now)
  const list = tab === 'por-realizar' ? porRealizar : realizadas

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={styles.sectionTitle}>📅 Visitas</h2>
        <button onClick={load} style={styles.btnSecondary}>↻ Actualizar</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'por-realizar', label: `Por Realizar (${porRealizar.length})` },
          { key: 'realizadas',   label: `Realizadas (${realizadas.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ ...styles.tab, ...(tab === t.key ? styles.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={styles.empty}>Cargando visitas…</div>}
      {error   && <div style={styles.errorBox}>{error}</div>}
      {!loading && !error && list.length === 0 && <div style={styles.empty}>No hay visitas en esta sección.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map(visit => {
          const status     = statuses[visit.id] || 'pendiente'
          const isExpanded = expanded === visit.id
          const isUpdating = updating === visit.id
          return (
            <div key={visit.id} style={styles.card}>
              <div onClick={() => setExpanded(isExpanded ? null : visit.id)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>{visit.nombre}</span>
                    <VisitBadge status={status} />
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 3 }}>
                    {fmtDate(visit.start)} · {fmtTime(visit.start)}
                  </div>
                </div>
                <span style={{ color: '#aaa', fontSize: 18 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f0f0f0' }}>
                  <div style={styles.detailGrid}>
                    {visit.email     && <><span style={styles.detailLabel}>Email</span><span style={{fontSize:13}}>{visit.email}</span></>}
                    {visit.celular   && <><span style={styles.detailLabel}>Celular</span><span style={{fontSize:13}}>{visit.celular}</span></>}
                    {visit.direccion && <><span style={styles.detailLabel}>Dirección</span><span style={{fontSize:13}}>{visit.direccion}</span></>}
                    {visit.notas     && <><span style={styles.detailLabel}>Notas</span><span style={{fontSize:13}}>{visit.notas}</span></>}
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#999', marginRight: 4 }}>Marcar como:</span>
                    <StatusBtn current={status} target="cancelada" label="✕ Cancelada" onClick={s => handleStatus(visit, s)} loading={isUpdating} />
                    <StatusBtn current={status} target="reagendar" label="↺ Reagendar" onClick={s => handleStatus(visit, s)} loading={isUpdating} />
                    <StatusBtn current={status} target="realizada" label="✓ Realizada" onClick={s => handleStatus(visit, s)} loading={isUpdating} />
                    {status === 'realizada' && (
                      <button onClick={() => navigateTo('por-cotizar', visit)}
                        style={{ ...styles.btnPrimary, padding: '5px 14px', fontSize: 12 }}>
                        📋 Ir a Cotizar →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
