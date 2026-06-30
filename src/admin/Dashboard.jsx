import React, { useEffect, useState, useCallback } from 'react'
import { C, apiFetch, fmt, fmtDate, fmtTime, styles, VISIT_STATUS_LABELS } from './utils.js'

function KpiCard({ label, value, sub, color, onClick, alert }) {
  return (
    <div onClick={onClick} style={{
      ...styles.card, flex: 1, minWidth: 160,
      cursor: onClick ? 'pointer' : 'default',
      borderLeft: '4px solid ' + (color || C.orange),
      transition: 'box-shadow .15s, transform .15s',
      position: 'relative', overflow: 'hidden',
    }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
    >
      {alert > 0 && (
        <div style={{ position: 'absolute', top: 14, right: 14, background: C.red, color: 'white', borderRadius: 99, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>{alert}</div>
      )}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: color || C.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.textSub, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function SectionCard({ title, children, action, actionLabel }) {
  return (
    <div style={{ ...styles.card, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={styles.cardLabel}>{title}</div>
        {action && <button onClick={action} style={{ ...styles.btnSecondary, fontSize: 11, padding: '4px 10px' }}>{actionLabel}</button>}
      </div>
      {children}
    </div>
  )
}

function Row({ left, right, sub, accent, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 0', borderBottom: '1px solid ' + C.border,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{left}</div>
        {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{sub}</div>}
      </div>
      {right && <div style={{ fontSize: 12, fontWeight: 700, color: accent || C.textSub, whiteSpace: 'nowrap', marginLeft: 12 }}>{right}</div>}
    </div>
  )
}

export default function DashboardSection({ navigateTo }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [visitRes, cotRes] = await Promise.all([
        apiFetch('/.netlify/functions/get-visits').catch(() => ({ ok: false, visits: [] })),
        apiFetch('/.netlify/functions/get-quotes').catch(() => ({ ok: false, quotes: [] })),
      ])

      const now   = new Date()
      const hoy   = new Date(now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) + 'T00:00:00')
      const en7   = new Date(hoy); en7.setDate(hoy.getDate() + 7)

      const visits = visitRes.visits || []
      const quotes = cotRes.quotes   || []

      // Visitas proximas (agendadas, fecha futura)
      const visitasProximas = visits.filter(v => {
        const s = v.status || 'agendada'
        return (s === 'agendada' || s === 'reagendar') && new Date(v.start) >= hoy && new Date(v.start) < en7
      })

      // Pendientes de declarar (fecha pasada, sin estado claro)
      const pendientes = visits.filter(v => {
        const s = v.status || 'agendada'
        return (s === 'agendada' || s === 'reagendar') && new Date(v.start) < now
      })

      // Realizadas sin cotizar
      const realizadasSinCotizar = visits.filter(v => v.status === 'realizada')

      // Cotizaciones
      const porConfirmar = quotes.filter(q => q.status === 'por confirmar')
      const confirmadas  = quotes.filter(q => q.status === 'confirmada')

      // Cotizaciones sin respuesta hace 3+ dias
      const tresDias = new Date(hoy); tresDias.setDate(hoy.getDate() - 3)
      const sinRespuesta = porConfirmar.filter(q => {
        if (!q.creado) return false
        try { return new Date(q.creado) < tresDias } catch { return false }
      })

      // Proximas visitas de hoy
      const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1)
      const visitasHoy = visits.filter(v => {
        const d = new Date(v.start)
        return d >= hoy && d < manana && (v.status === 'agendada' || v.status === 'reagendar')
      })

      setData({ visitasProximas, pendientes, realizadasSinCotizar, porConfirmar, confirmadas, sinRespuesta, visitasHoy })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={styles.empty}>Cargando resumen...</div>
  if (!data)   return null

  const { visitasProximas, pendientes, realizadasSinCotizar, porConfirmar, confirmadas, sinRespuesta, visitasHoy } = data
  const now = new Date()
  const hoy = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ ...styles.sectionTitle, marginBottom: 2 }}>Inicio</h2>
          <div style={{ fontSize: 13, color: C.textMuted, textTransform: 'capitalize' }}>{hoy}</div>
        </div>
        <button onClick={load} style={styles.btnSecondary}>Actualizar</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <KpiCard
          label="Visitas proximas (7d)"
          value={visitasProximas.length}
          sub={visitasHoy.length > 0 ? visitasHoy.length + ' hoy' : 'Ninguna hoy'}
          color={C.orange}
          onClick={() => navigateTo('visitas')}
        />
        <KpiCard
          label="Pendientes de declarar"
          value={pendientes.length}
          sub={pendientes.length > 0 ? 'Requieren atencion' : 'Todo al dia'}
          color={pendientes.length > 0 ? C.yellow : C.green}
          alert={pendientes.length}
          onClick={() => navigateTo('visitas')}
        />
        <KpiCard
          label="Por confirmar"
          value={porConfirmar.length}
          sub={sinRespuesta.length > 0 ? sinRespuesta.length + ' sin respuesta 3d+' : 'Al dia'}
          color={C.yellow}
          alert={sinRespuesta.length}
          onClick={() => navigateTo('cotizaciones')}
        />
        <KpiCard
          label="Confirmadas"
          value={confirmadas.length}
          color={C.green}
          onClick={() => navigateTo('cotizaciones')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Visitas proximas */}
        <SectionCard title="Proximas visitas (7 dias)" action={() => navigateTo('visitas')} actionLabel="Ver todas">
          {visitasProximas.length === 0
            ? <div style={{ fontSize: 13, color: C.textMuted, padding: '10px 0' }}>Sin visitas esta semana.</div>
            : visitasProximas.slice(0, 5).map(v => (
                <Row key={v.id}
                  left={v.nombre}
                  right={fmtTime(v.start)}
                  sub={fmtDate(v.start) + (v.direccion ? ' - ' + v.direccion : '')}
                  accent={C.orange}
                  onClick={() => navigateTo('visitas')}
                />
              ))
          }
        </SectionCard>

        {/* Pendientes de declarar */}
        <SectionCard title="Visitas pendientes de declarar" action={() => navigateTo('visitas')} actionLabel="Resolver">
          {pendientes.length === 0
            ? <div style={{ fontSize: 13, color: C.textMuted, padding: '10px 0' }}>Sin pendientes.</div>
            : pendientes.slice(0, 5).map(v => (
                <Row key={v.id}
                  left={v.nombre}
                  right={fmtDate(v.start)}
                  sub={v.direccion || ''}
                  accent={C.yellow}
                  onClick={() => navigateTo('visitas')}
                />
              ))
          }
          {pendientes.length > 5 && (
            <div style={{ fontSize: 12, color: C.textMuted, paddingTop: 8, textAlign: 'center' }}>+ {pendientes.length - 5} mas</div>
          )}
        </SectionCard>

        {/* Realizadas sin cotizar */}
        <SectionCard title="Realizadas sin cotizar" action={() => navigateTo('cotizador')} actionLabel="Cotizar">
          {realizadasSinCotizar.length === 0
            ? <div style={{ fontSize: 13, color: C.textMuted, padding: '10px 0' }}>Todas cotizadas.</div>
            : realizadasSinCotizar.slice(0, 5).map(v => (
                <Row key={v.id}
                  left={v.nombre}
                  right={fmtDate(v.start)}
                  sub={v.direccion || ''}
                  accent={C.green}
                  onClick={() => navigateTo('cotizador')}
                />
              ))
          }
        </SectionCard>

        {/* Cotizaciones por confirmar */}
        <SectionCard title="Cotizaciones por confirmar" action={() => navigateTo('cotizaciones')} actionLabel="Ver todas">
          {porConfirmar.length === 0
            ? <div style={{ fontSize: 13, color: C.textMuted, padding: '10px 0' }}>Ninguna pendiente.</div>
            : porConfirmar.slice(0, 5).map(q => {
                const dias = q.creado ? Math.floor((new Date() - new Date(q.creado)) / (1000*60*60*24)) : null
                const sinResp = dias >= 3
                return (
                  <Row key={q.cotNum}
                    left={q.nombre}
                    right={sinResp ? dias + 'd sin respuesta' : fmt(q.total)}
                    sub={'N' + q.cotNum + (q.fechaVisita ? ' - ' + fmtDate(q.fechaVisita) : '')}
                    accent={sinResp ? C.red : C.textSub}
                    onClick={() => navigateTo('cotizaciones')}
                  />
                )
              })
          }
          {porConfirmar.length > 5 && (
            <div style={{ fontSize: 12, color: C.textMuted, paddingTop: 8, textAlign: 'center' }}>+ {porConfirmar.length - 5} mas</div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
