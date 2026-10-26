import React, { Suspense, lazy, useEffect, useState, useCallback } from 'react'
import { VISIT_STATUS_LABELS, C, apiFetch, fmtDate, fmtTime, styles } from './utils.js'
import { VISITA_VIGENTE, horarioVisita, mensajeConfirmarVisita, mensajeVisitaReagendada, textoVisitas } from './listaVisitas.js'
import CopiarMensaje from './CopiarMensaje.jsx'
// El mapa (Leaflet) se carga solo al abrirlo.
const MapaVisitas = lazy(() => import('./MapaVisitas.jsx'))
const Concentracion = lazy(() => import('./Concentracion.jsx'))

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

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const diaCorto = f => { const [y, m, d] = f.split('-').map(Number); return `${DIAS_CORTOS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MESES_CORTOS[m - 1]}` }
const chip = activo => ({
  padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  border: '1.5px solid ' + (activo ? C.orange : C.border), background: activo ? C.orangeLight : C.surface, color: activo ? C.orangeDark : C.textSub,
})

// Elegir otro dia y rango con cupo (pestaña Horarios) y mover la visita en el calendario.
function ReagendarVisita({ visit, movida, onListo, onCerrar }) {
  const [dias, setDias] = useState(null)
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/.netlify/functions/visita', { method: 'POST', body: JSON.stringify({ accion: 'horas', visitId: visit.id }) })
      .then(r => { if (!r.ok) throw new Error(r.error); setDias(r.dias); setFecha(r.dias[0]?.fecha || '') })
      .catch(e => setError(e.message || 'No se pudieron cargar las horas'))
  }, [])

  async function mover() {
    setEstado('moviendo'); setError('')
    try {
      const r = await apiFetch('/.netlify/functions/visita', { method: 'POST', body: JSON.stringify({ accion: 'reagendar', visitId: visit.id, fecha, hora }) })
      if (!r.ok) throw new Error(r.error)
      const nueva = { ...visit, start: r.start, end: r.end }
      await onListo(nueva)
    } catch (e) { setError(e.message || 'No se pudo reagendar') }
    finally { setEstado('') }
  }

  const rangos = dias?.find(d => d.fecha === fecha)?.rangos || []
  return (
    <div data-testid="reagendar-visita" style={{ marginTop: 10, padding: 12, borderRadius: 10, border: '1px solid ' + C.border, background: '#FAFAFB' }}>
      {movida ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>✓ Reagendada para el {fmtDate(movida.start)}, {horarioVisita(movida)}</span>
          <button onClick={onCerrar} style={{ ...styles.btnSecondary, padding: '6px 12px', fontSize: 12 }}>Listo</button>
          <CopiarMensaje texto={mensajeVisitaReagendada(movida)} etiqueta="📋 Copiar aviso para el cliente" />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Mover a otro día u horario</span>
            <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: 12, color: C.textMuted, cursor: 'pointer', textDecoration: 'underline' }}>Cerrar</button>
          </div>
          {!dias && !error && <div style={{ fontSize: 12, color: C.textMuted }}>Buscando horarios con cupo...</div>}
          {dias && !dias.length && <div style={{ fontSize: 12, color: C.textMuted }}>No quedan horarios con cupo. Abre más días o sube el cupo en la pestaña Horarios.</div>}
          {!!dias?.length && (
            <>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
                {dias.map(d => <button key={d.fecha} onClick={() => { setFecha(d.fecha); setHora('') }} style={chip(d.fecha === fecha)}>{diaCorto(d.fecha)}</button>)}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {rangos.map(r => <button key={r.desde} onClick={() => setHora(r.desde)} style={chip(r.desde === hora)}>{r.desde}–{r.hasta}</button>)}
              </div>
              <button onClick={mover} disabled={!hora || estado === 'moviendo'}
                style={{ ...styles.btnPrimary, marginTop: 10, padding: '7px 14px', fontSize: 12, opacity: hora && !estado ? 1 : .5 }}>
                {estado === 'moviendo' ? 'Moviendo...' : hora ? `Mover al ${diaCorto(fecha)}, ${hora}–${rangos.find(r => r.desde === hora)?.hasta || ''}` : 'Elige un horario'}
              </button>
            </>
          )}
          {error && <div style={{ ...styles.errorBox, marginTop: 8 }}>{error}</div>}
        </>
      )}
    </div>
  )
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
  const [copiado, setCopiado]   = useState('')
  const [reagendando, setReagendando] = useState(null)
  const [verMapa, setVerMapa] = useState(false)
  const [vista, setVista] = useState('lista') // lista | concentracion
  const [filtroCalendly, setFiltroCalendly] = useState('por_revisar')
  const [mapaDia, setMapaDia] = useState('') // el dia (de las proximas) con su mapa abierto
  const [movida, setMovida] = useState(null) // la visita recien reagendada (cambia de dia en la lista)

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
      // Al cancelar, la hora queda libre para otro cliente.
      if (newStatus === 'cancelada' && visit.origen !== 'Calendly') {
        const r = await apiFetch('/.netlify/functions/visita', { method: 'POST', body: JSON.stringify({ accion: 'liberar', visitId: visit.id }) }).catch(() => null)
        if (!r?.ok) console.warn('No se pudo liberar la hora de la visita', visit.id, r?.error)
      }
      await apiFetch('/.netlify/functions/update-visit-status', {
        method: 'POST',
        body: JSON.stringify({
          visitId: visit.id, nombre: visit.nombre,
          fecha: fmtDate(visit.start), hora: horarioVisita(visit),
          email: visit.email, celular: visit.celular,
          direccion: visit.direccion, status: newStatus,
          notas: cancelNote[visit.id] || visit.notas || '',
        }),
      })
      onStatusChange(visit.id, newStatus)
    } catch { alert('Error al actualizar estado') }
    finally { setUpdating(null) }
  }

  // Despues de moverla queda agendada en su nueva hora (hay que volver a confirmarla).
  async function reagendada(nueva) {
    setMovida(nueva)
    setVisits(prev => prev.map(v => v.id === nueva.id ? { ...v, start: nueva.start, end: nueva.end } : v))
    await handleStatus(nueva, 'agendada')
  }

  function cancelar(visit) {
    if (confirm(`¿Cancelar la visita de ${visit.nombre}? La hora queda libre para otro cliente.`)) handleStatus(visit, 'cancelada')
  }

  const now = new Date()

  function getStatus(visit) {
    return statuses[visit.id] || visit.status || 'agendada'
  }

  // Las importadas de Calendly van solo en su pestaña (se concilian a mano); el resto, como siempre.
  const propias = visits.filter(v => v.origen !== 'Calendly')
  const deCalendly = visits.filter(v => v.origen === 'Calendly')
  const calendly = deCalendly.filter(v => filtroCalendly === 'todas' || getStatus(v) === filtroCalendly)
    .sort((a, b) => new Date(b.start) - new Date(a.start))

  const agendadas = propias.filter(v => {
    const s = getStatus(v)
    return VISITA_VIGENTE.includes(s) && new Date(v.start) >= now
  }).sort((a, b) => new Date(a.start) - new Date(b.start))

  const pendientes = propias.filter(v => {
    const s = getStatus(v)
    return VISITA_VIGENTE.includes(s) && new Date(v.start) < now
  }).sort((a, b) => new Date(b.start) - new Date(a.start))

  const realizadas = propias.filter(v => getStatus(v) === 'realizada')
    .sort((a, b) => new Date(b.start) - new Date(a.start))

  const realizadasCotizadas = propias.filter(v => getStatus(v) === 'realizada_cotizada')
    .sort((a, b) => new Date(b.start) - new Date(a.start))

  const canceladas = propias.filter(v => getStatus(v) === 'cancelada')
    .sort((a, b) => new Date(b.start) - new Date(a.start))

  const TABS = [
    { key: 'agendadas',            label: 'Agendadas',             count: agendadas.length,           color: C.blue   },
    { key: 'pendientes',           label: 'Pendientes',            count: pendientes.length,          color: C.yellow, alert: pendientes.length > 0 },
    { key: 'realizadas',           label: 'Realizadas',            count: realizadas.length,          color: C.green  },
    { key: 'realizadas_cotizadas', label: 'Realizadas y cotizadas',count: realizadasCotizadas.length, color: '#8B5CF6'},
    { key: 'canceladas',           label: 'Canceladas',            count: canceladas.length,          color: C.red    },
    ...(deCalendly.length ? [{ key: 'calendly', label: 'Calendly', count: deCalendly.filter(v => getStatus(v) === 'por_revisar').length, color: '#64748B' }] : []),
  ]

  const listMap = { agendadas, pendientes, realizadas, realizadas_cotizadas: realizadasCotizadas, canceladas, calendly }
  const q    = buscar.trim().toLowerCase()
  const list = (listMap[tab] || []).filter(v => !q || (v.nombre || '').toLowerCase().includes(q))

  // Copia las visitas confirmadas de un dia para mandarselas a quien hace las visitas.
  async function copiarDia(group, confirmadas) {
    try { await navigator.clipboard.writeText(textoVisitas(confirmadas)); setCopiado(group.label) }
    catch { setCopiado('error:' + group.label) }
    setTimeout(() => setCopiado(''), 2500)
  }

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre..."
            style={{ ...styles.input, width: 180, padding: '7px 12px', fontSize: 13 }} />
          <button onClick={() => setVista(v => (v === 'lista' ? 'concentracion' : 'lista'))} aria-pressed={vista === 'concentracion'}
            style={vista === 'concentracion' ? { ...styles.btnSecondary, borderColor: C.orange, color: C.orangeDark } : styles.btnSecondary}>
            {vista === 'concentracion' ? '← Volver a la lista' : '📊 Concentración'}
          </button>
          {vista === 'lista' && <button onClick={() => setVerMapa(m => !m)} style={verMapa ? { ...styles.btnSecondary, borderColor: C.orange, color: C.orangeDark } : styles.btnSecondary} aria-pressed={verMapa}>🗺 {verMapa ? 'Ocultar mapa' : 'Mapa'}</button>}
          <button onClick={load} style={styles.btnSecondary}>Actualizar</button>
        </div>
      </div>

      {vista === 'concentracion' && (loading && !visits.length ? <div style={styles.empty}>Cargando visitas...</div> : (
        <Suspense fallback={<div style={styles.empty}>Cargando...</div>}>
          <Concentracion visitas={visits} estadoDe={getStatus} onRecargar={load} />
        </Suspense>
      ))}

      {vista === 'lista' && <>
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

      {verMapa && !loading && (
        <Suspense fallback={<div style={styles.empty}>Cargando mapa...</div>}>
          <MapaVisitas visitas={list} estadoDe={getStatus} />
        </Suspense>
      )}

      {loading && <div style={styles.empty}>Cargando visitas...</div>}
      {error   && <div style={styles.errorBox}>{error}</div>}

      {tab === 'calendly' && (
        <div style={{ ...styles.card, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: C.textSub, marginBottom: 10 }}>
            Visitas antiguas de Calendly: muchas no se hicieron. Marca cada una como corresponda (las que se cotizaron en el cotizador antiguo, como "Realizada y cotizada"). Todas cuentan en el mapa de concentración.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['por_revisar', 'Por revisar'], ['realizada', 'Realizadas'], ['realizada_cotizada', 'Realizadas y cotizadas'], ['cancelada', 'No se hicieron / canceladas'], ['todas', 'Todas']].map(([k, n]) => {
              const cuantas = k === 'todas' ? deCalendly.length : deCalendly.filter(v => getStatus(v) === k).length
              return <button key={k} onClick={() => setFiltroCalendly(k)} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + (filtroCalendly === k ? C.orange : C.border), background: filtroCalendly === k ? C.orangeLight : C.surface, color: filtroCalendly === k ? C.orangeDark : C.textSub }}>{n} ({cuantas})</button>
            })}
          </div>
        </div>
      )}

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
        {grouped.map(group => {
          const confirmadas = group.visits.filter(v => getStatus(v) === 'confirmada')
          return (
          <div key={group.label} data-testid="dia-visitas">
            {/* Encabezado del domingo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.orange, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                {group.label}
              </span>
              <div style={{ flex: 1, height: 1, background: C.orange + '30' }} />
              <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap' }}>
                {group.visits.length} {group.visits.length === 1 ? 'visita' : 'visitas'}
              </span>
              {tab === 'agendadas' && (
                <button onClick={() => setMapaDia(mapaDia === group.label ? '' : group.label)}
                  title="Las visitas de este día en el mapa, numeradas por hora, para mandárselo a quien hace las visitas"
                  style={{ ...styles.btnSecondary, padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap', ...(mapaDia === group.label ? { borderColor: C.orange, color: C.orangeDark } : {}) }}>
                  🗺 {mapaDia === group.label ? 'Ocultar mapa' : 'Mapa del día'}
                </button>
              )}
              {tab === 'agendadas' && (
                <button onClick={() => copiarDia(group, confirmadas)} disabled={!confirmadas.length}
                  title="Copia las visitas confirmadas de este día, en orden y con todos sus datos, para mandarlas por WhatsApp"
                  style={{ ...styles.btnPrimary, padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap', opacity: confirmadas.length ? 1 : .45, cursor: confirmadas.length ? 'pointer' : 'default' }}>
                  {copiado === group.label ? '✓ Copiado' : copiado === 'error:' + group.label ? 'No se pudo copiar' : `📋 Copiar confirmadas (${confirmadas.length}/${group.visits.length})`}
                </button>
              )}
            </div>

            {tab === 'agendadas' && mapaDia === group.label && (
              <Suspense fallback={<div style={styles.empty}>Cargando mapa...</div>}>
                <MapaVisitas visitas={group.visits} estadoDe={getStatus} numerar alto="min(460px, 60vh)"
                  descargable={`Visitas ${group.visits[0]?.start?.slice(0, 10) || ''}`} />
              </Suspense>
            )}

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
                            <span style={{ fontWeight: 600, color: C.text }}>{horarioVisita(visit)}</span>
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

                    {/* Confirmar con el cliente (el dia anterior) */}
                    {tab === 'agendadas' && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                        {status === 'confirmada' ? (
                          <>
                            <span style={{ fontSize: 12, fontWeight: 700, color: VISIT_STATUS_LABELS.confirmada.color }}>✓ El cliente confirmó</span>
                            <button onClick={() => handleStatus(visit, 'agendada')} disabled={isUpdating}
                              style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: C.textMuted, textDecoration: 'underline', cursor: 'pointer' }}>Deshacer</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => handleStatus(visit, 'confirmada')} disabled={isUpdating}
                              style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1.5px solid ' + VISIT_STATUS_LABELS.confirmada.color, background: C.surface, color: VISIT_STATUS_LABELS.confirmada.color, opacity: isUpdating ? .5 : 1 }}>✓ Confirmó</button>
                          </>
                        )}
                        <button onClick={() => setReagendando(reagendando === visit.id ? null : visit.id)} disabled={isUpdating}
                          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + C.border, background: reagendando === visit.id ? C.orangeLight : C.surface, color: C.textSub }}>📅 Reagendar</button>
                        <button onClick={() => cancelar(visit)} disabled={isUpdating}
                          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + C.border, background: C.surface, color: C.red }}>✕ Cancelar</button>
                        {status !== 'confirmada' && <CopiarMensaje texto={mensajeConfirmarVisita(visit)} etiqueta="📋 Copiar mensaje de confirmación" />}
                      </div>
                    )}
                    {tab === 'calendly' && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }} data-testid="conciliar-calendly">
                        <StatusBtn target="realizada" label="Realizada" visit={visit} />
                        <StatusBtn target="realizada_cotizada" label="Realizada y cotizada" visit={visit} />
                        <StatusBtn target="cancelada" label="No se hizo" visit={visit} />
                        {status !== 'por_revisar' && <StatusBtn target="por_revisar" label="Por revisar" visit={visit} />}
                        {visit.celular && <a href={`https://wa.me/${visit.celular.replace(/\D/g, '').replace(/^(9\d{8})$/, '56$1')}`} target="_blank" rel="noopener" style={{ fontSize: 12, fontWeight: 600, color: C.green }}>💬 WhatsApp</a>}
                        {/💡/.test(visit.notas || '') && <span style={{ fontSize: 12, color: '#8B5CF6', fontWeight: 600 }}>{visit.notas.match(/💡[^·]*/)[0].trim()}</span>}
                      </div>
                    )}
                    {reagendando === visit.id && (tab === 'agendadas' || tab === 'pendientes') && (
                      <ReagendarVisita visit={visit} movida={movida?.id === visit.id ? movida : null} onListo={reagendada} onCerrar={() => { setReagendando(null); setMovida(null) }} />
                    )}

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
                              <button onClick={() => setReagendando(reagendando === visit.id ? null : visit.id)} disabled={!!updating}
                                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + C.border, background: C.surface, color: C.textSub }}>Reagendar</button>
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
          )
        })}
      </div>
      </>}
    </div>
  )
}
