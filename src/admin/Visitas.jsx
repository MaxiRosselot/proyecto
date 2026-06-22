import React, { useEffect, useState, useCallback } from 'react'
import { VISIT_STATUS_LABELS, C, apiFetch, fmtDate, fmtTime, styles } from './utils.js'

function Badge({ status }) {
  const s = VISIT_STATUS_LABELS[status] || VISIT_STATUS_LABELS.pendiente
  return <span style={styles.badge(s.color)}>{s.label}</span>
}

function StatusBtn({ current, target, label, onClick, loading }) {
  const s = VISIT_STATUS_LABELS[target]
  const active = current === target
  return (
    <button onClick={() => !active && !loading && onClick(target)} disabled={active || loading} style={{
      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
      cursor: active ? 'default' : 'pointer',
      border: '1.5px solid ' + (active ? s.color : C.border),
      background: active ? s.color + '18' : C.surface,
      color: active ? s.color : C.textSub,
      opacity: loading ? .5 : 1, transition: 'all .15s',
    }}>{label}</button>
  )
}

export default function VisitasSection({ statuses, onStatusChange, navigateTo, onVisitsLoaded }) {
  const [visits, setVisits]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [tab, setTab]           = useState('por-realizar')
  const [updating, setUpdating] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [sortAsc, setSortAsc]   = useState(false)

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
  const sortFn = (a, b) => sortAsc
    ? new Date(a.start) - new Date(b.start)
    : new Date(b.start) - new Date(a.start)

  const porRealizar = visits.filter(v => new Date(v.start) >= now && statuses[v.id] !== 'cancelada').sort(sortFn)
  const realizadas  = visits.filter(v => new Date(v.start) < now  && statuses[v.id] !== 'cancelada').sort(sortFn)
  const canceladas  = visits.filter(v => statuses[v.id] === 'cancelada').sort(sortFn)

  const listMap = { 'por-realizar': porRealizar, realizadas, canceladas }
  const list = listMap[tab] || []

  const TABS = [
    { key: 'por-realizar', label: 'Por realizar', count: porRealizar.length },
    { key: 'realizadas',   label: 'Realizadas',   count: realizadas.length },
    { key: 'canceladas',   label: 'Canceladas',   count: canceladas.length },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={styles.sectionTitle}>Visitas</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setSortAsc(v => !v)} style={{ ...styles.btnSecondary, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>
            {sortAsc ? 'Mas antiguas' : 'Mas nuevas'}
          </button>
          <button onClick={load} style={styles.btnSecondary}>Actualizar</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ ...styles.tab, ...(tab === t.key ? styles.tabActive : {}) }}>
            {t.label}
            <span style={{
              marginLeft: 7, padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 700,
              background: tab === t.key ? 'rgba(255,255,255,.25)' : C.bg,
              color: tab === t.key ? 'white' : C.textMuted,
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {loading && <div style={styles.empty}>Cargando visitas...</div>}
      {error   && <div style={styles.errorBox}>{error}</div>}
      {!loading && !error && list.length === 0 && <div style={styles.empty}>No hay visitas en esta seccion.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map(visit => {
          const status      = statuses[visit.id] || 'pendiente'
          const isExpanded  = expanded === visit.id
          const isUpdating  = updating === visit.id
          const borderColor = VISIT_STATUS_LABELS[status]?.color || C.border
          return (
            <div key={visit.id} style={{ ...styles.card, borderLeft: '3px solid ' + borderColor }}>
              <div onClick={() => setExpanded(isExpanded ? null : visit.id)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{visit.nombre}</span>
                    <Badge status={status} />
                  </div>
                  <div style={{ fontSize: 13, color: C.textSub }}>
                    {fmtDate(visit.start)} {'·'} {fmtTime(visit.start)}
                    {visit.direccion && <span style={{ marginLeft: 12, color: C.textMuted }}>{visit.direccion}</span>}
                  </div>
                </div>
                <div style={{ color: C.textMuted, transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid ' + C.border }}>
                  <div style={{ ...styles.detailGrid, marginBottom: 16 }}>
                    {visit.email     && <><span style={styles.detailLabel}>Email</span><span style={{ fontSize: 13 }}>{visit.email}</span></>}
                    {visit.celular   && <><span style={styles.detailLabel}>Celular</span><span style={{ fontSize: 13 }}>{visit.celular}</span></>}
                    {visit.direccion && <><span style={styles.detailLabel}>Direccion</span><span style={{ fontSize: 13 }}>{visit.direccion}</span></>}
                    {visit.notas     && <><span style={styles.detailLabel}>Notas</span><span style={{ fontSize: 13 }}>{visit.notas}</span></>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, marginRight: 4 }}>Estado</span>
                    <StatusBtn current={status} target="pendiente" label="Pendiente" onClick={s => handleStatus(visit, s)} loading={isUpdating} />
                    <StatusBtn current={status} target="cancelada" label="Cancelada" onClick={s => handleStatus(visit, s)} loading={isUpdating} />
                    <StatusBtn current={status} target="reagendar" label="Reagendar"  onClick={s => handleStatus(visit, s)} loading={isUpdating} />
                    <StatusBtn current={status} target="realizada" label="Realizada"  onClick={s => handleStatus(visit, s)} loading={isUpdating} />
                    {status === 'realizada' && (
                      <button onClick={() => navigateTo('cotizador', visit)}
                        style={{ ...styles.btnPrimary, padding: '6px 16px', fontSize: 12, marginLeft: 8 }}>
                        Cotizar visita
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
