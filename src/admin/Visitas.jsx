import React, { useEffect, useState, useCallback } from 'react'
import { VISIT_STATUS_LABELS, C, apiFetch, fmtDate, fmtTime, styles } from './utils.js'

function Badge({ status }) {
  const s = VISIT_STATUS_LABELS[status] || VISIT_STATUS_LABELS.agendada
  return <span style={styles.badge(s.color)}>{s.label}</span>
}

function groupByDate(visits) {
  const groups = {}
  const order  = []
  for (const v of visits) {
    const isoKey = v.start ? v.start.slice(0, 10) : '0000-00-00'
    const label  = v.start
      ? new Date(v.start).toLocaleDateString('es-CL', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          timeZone: 'America/Santiago',
        })
      : 'Sin fecha'
    if (!groups[isoKey]) { groups[isoKey] = { label, visits: [] }; order.push(isoKey) }
    groups[isoKey].visits.push(v)
  }
  // Dentro de cada domingo, ordenar por hora ascendente
  order.forEach(k => groups[k].visits.sort((a, b) => new Date(a.start) - new Date(b.start)))
  return order.map(k => groups[k])
}

export default function VisitasSection({ statuses, onStatusChange, navigateTo, onVisitsLoaded }) {
  const [visits, setVisits]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [tab, setTab]           = useState('agendadas')
  const [updating, setUpdating] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [cancelNote, setCancelNote] = useState({})
  const [buscar, setBuscar]     = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const visitData = await apiFetch('/.netlify/functions/get-visits')
      if (visitData.ok) { setVisits(visitData.visits); onVisitsLoaded?.(visitData.visits) }
      else setError(visitData.error || 'Error al cargar visitas')
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
          direccion: visit.direccion, status: newStatus,
          notas: cancelNote[visit.id] || visit.notas || '',
        }),
      })
      onStatusChange(visit.id, newStatus)
    } catch { alert('Error al actualizar estado') }
    finally { setUpdating(null) }
  }

  const now = new Date()

  function getStatus(visit) {
    return statuses[visit.id] || visit.status || 'agendada'
  }

  const agendadas = visits.filter(v => {
    const s = getStatus(v)
    return (s === 'agendada' || s === 'reagendar') && new Date(v.start) >= now
  }).sort((a, b) => new Date(a.start) - new Date(b.start))

  const pendientes = visits.filter(v => {
    const s = getStatus(v)
    return (s === 'agendada' || s === 'reagendar') && new Date(v.start) < now
  }).sort((a, b) => new Date(b.start) - new Date(a.start))

  const realizadas = visits.filter(v => getStatus(v) === 'realizada')
    .sort((a, b) => new Date(b.start) - new Date(a.start))

  const realizadasCotizadas = visits.filter(v => getStatus(v) === 'realizada_cotizada')
    .sort((a, b) => new Date(b.start) - new Date(a.start))

  const canceladas = visits.filter(v => getStatus(v) === 'cancelada')
    .sort((a, b) => new Date(b.start) - new Date(a.start))

  const TABS = [
    { key: 'agendadas',            label: 'Agendadas',             count: agendadas.length,           color: C.blue   },
    { key: 'pendientes',           label: 'Pendientes',            count: pendientes.length,          color: C.yellow, alert: pendientes.length > 0 },
    { key: 'realizadas',           label: 'Realizadas',            count: realizadas.length,          color: C.green  },
    { key: 'realizadas_cotizadas', label: 'Realizadas y cotizadas',count: realizadasCotizadas.length, color: '#8B5CF6'},
    { key: 'canceladas',           label: 'Canceladas',            count: canceladas.length,          color: C.red    },
  ]

  const listMap = { agendadas, pendientes, realizadas, realizadas_cotizadas: realizadasCotizadas, canceladas }
  const q    = buscar.trim().toLowerCase()
  const list = (listMap[tab] || []).filter(v => !q || (v.nombre || '').toLowerCase().includes(q))

  // Agrupado por fecha, con horas ordenadas asc dentro de cada grupo
  const grouped = groupByDate(list)

  function StatusBtn({ target, label, visit, color }) {
    const current = getStatus(visit)
    const active  = current === target
    const c = color || VISIT_STATUS_LABELS[target]?.color || C.border
    return (
      <button
        onClick={() => !active && !updating && handleStatus(visit, target)}
        disabled={active || !!updating}
        style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          cursor: active ? 'default' : 'pointer',
          border: '1.5px solid ' + (active ? c : C.border),
          background: active ? c + '18' : C.surface,
          color: active ? c : C.textSub,
          opacity: updating === visit.id ? .5 : 1, transition: 'all .15s',
        }}
      >{label}</button>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={styles.sectionTitle}>Visitas</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre..."
            style={{ ...styles.input, width: 180, padding: '7px 12px', fontSize: 13 }} />
          <button onClick={load} style={styles.btnSecondary}>Actualizar</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            ...styles.tab,
            ...(tab === t.key ? { background: t.color, borderColor: t.color, color: 'white', boxShadow: '0 2px 8px ' + t.color + '40' } : {}),
            position: 'relative',
          }}>
            {t.label}
            <span style={{
              marginLeft: 7, padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 700,
              background: tab === t.key ? 'rgba(255,255,255,.25)' : C.bg,
              color: tab === t.key ? 'white' : C.textMuted,
            }}>{t.count}</span>
            {t.alert && tab !== t.key && (
              <span style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: 99, background: C.red, border: '2px solid white' }} />
            )}
          </button>
        ))}
      </div>

      {loading && <div style={styles.empty}>Cargando visitas...</div>}
      {error   && <div style={styles.errorBox}>{error}</div>}

      {tab === 'pendientes' && pendientes.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#92400E', fontWeight: 600 }}>
          Estas visitas ya pasaron su fecha. Debes declarar que ocurrio con cada una.
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div style={styles.empty}>
          {buscar ? 'Sin resultados para "' + buscar + '"\.' : 'No hay visitas en esta seccion.'}
        </div>
      )}

      {/* Lista agrupada por domingo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {grouped.map(group => (
          <div key={group.label}>
            {/* Encabezado del domingo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.orange, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                {group.label}
              </span>
              <div style={{ flex: 1, height: 1, background: C.orange + '30' }} />
              <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap' }}>
                {group.visits.length} {group.visits.length === 1 ? 'visita' : 'visitas'}
              </span>
            </div>

            {/* Tarjetas del grupo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.visits.map(visit => {
                const status     = getStatus(visit)
                const isExpanded = expanded === visit.id
                const isUpdating = updating === visit.id
                const borderColor = VISIT_STATUS_LABELS[status]?.color || C.border

                return (
                  <div key={visit.id} style={{ ...styles.card, borderLeft: '3px solid ' + borderColor }}>
                    {/* Header */}
                    <div onClick={() => setExpanded(isExpanded ? null : visit.id)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{visit.nombre}</span>
                          <Badge status={status} />
                        </div>
                        <div style={{ fontSize: 13, color: C.textSub }}>
                          {fmtTime(visit.start) && (
                            <span style={{ fontWeight: 600, color: C.text }}>{fmtTime(visit.start)}</span>
                          )}
                          {visit.direccion && (
                            <span style={{ marginLeft: fmtTime(visit.start) ? 10 : 0, color: C.textMuted }}>{visit.direccion}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ color: C.textMuted, transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                    </div>

                    {/* Detalle expandido */}
                    {isExpanded && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid ' + C.border }}>
                        <div style={{ ...styles.detailGrid, marginBottom: 16 }}>
                          {visit.email     && <><span style={styles.detailLabel}>Email</span><span style={{ fontSize: 13 }}>{visit.email}</span></>}
                          {visit.celular   && <><span style={styles.detailLabel}>Celular</span><span style={{ fontSize: 13 }}>{visit.celular}</span></>}
                          {visit.direccion && <><span style={styles.detailLabel}>Direccion</span><span style={{ fontSize: 13 }}>{visit.direccion}</span></>}
                          {visit.notas     && <><span style={styles.detailLabel}>Notas</span><span style={{ fontSize: 13 }}>{visit.notas}</span></>}
                        </div>

                        {(tab === 'agendadas' || tab === 'pendientes') && (
                          <div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                              <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, marginRight: 4 }}>Declarar estado</span>
                              <StatusBtn target="realizada"  label="Realizada"  visit={visit} />
                              <StatusBtn target="reagendar"  label="Reagendar"  visit={visit} />
                              <StatusBtn target="cancelada"  label="Cancelada"  visit={visit} />
                            </div>
                            <input
                              placeholder="Comentario (opcional)..."
                              value={cancelNote[visit.id] || ''}
                              onChange={e => setCancelNote(prev => ({ ...prev, [visit.id]: e.target.value }))}
                              style={{ ...styles.input, fontSize: 12, padding: '7px 10px', width: '100%', maxWidth: 340, boxSizing: 'border-box' }}
                            />
                          </div>
                        )}

                        {tab === 'realizadas' && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => navigateTo('cotizador', visit)}
                              style={{ ...styles.btnPrimary, padding: '8px 18px', fontSize: 13 }}
                            >
                              Cotizar esta visita
                            </button>
                            <StatusBtn target="cancelada" label="Cancelar visita" visit={visit} />
                          </div>
                        )}

                        {(tab === 'realizadas_cotizadas' || tab === 'canceladas') && (
                          <div style={{ fontSize: 13, color: C.textMuted, fontStyle: 'italic' }}>
                            {tab === 'realizadas_cotizadas' ? 'Esta visita ya fue cotizada.' : 'Esta visita fue cancelada.'}
                          </div>
                        )}

                        {isUpdating && (
                          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>Actualizando...</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
