import React, { useEffect, useState, useCallback } from 'react'
import { C, apiFetch, fmt, fmtDate, fmtTime, styles } from './utils.js'

function KpiCard({ label, value, sub, color, icon, onClick, alert }) {
  return (
    <div onClick={onClick} style={{
      ...styles.card,
      flex: 1, minWidth: 160,
      cursor: onClick ? 'pointer' : 'default',
      borderLeft: '4px solid ' + (color || C.orange),
      transition: 'box-shadow .15s, transform .15s',
      position: 'relative',
      overflow: 'hidden',
    }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
    >
      {alert > 0 && (
        <div style={{ position:'absolute', top:14, right:14, background:C.red, color:'white', borderRadius:99, width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800 }}>{alert}</div>
      )}
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.2, color:C.textMuted, textTransform:'uppercase', marginBottom:10 }}>{label}</div>
      <div style={{ fontSize:32, fontWeight:800, color: color || C.text, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:C.textSub, marginTop:6 }}>{sub}</div>}
    </div>
  )
}

function SectionCard({ title, children, action, actionLabel }) {
  return (
    <div style={{ ...styles.card, marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={styles.cardLabel}>{title}</div>
        {action && <button onClick={action} style={{ ...styles.btnSecondary, fontSize:11, padding:'4px 10px' }}>{actionLabel}</button>}
      </div>
      {children}
    </div>
  )
}

function Row({ left, right, sub, accent, onClick }) {
  return (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'9px 0', borderBottom:'1px solid '+C.border,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div>
        <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{left}</div>
        {sub && <div style={{ fontSize:11, color:C.textMuted, marginTop:1 }}>{sub}</div>}
      </div>
      {right && <div style={{ fontSize:12, fontWeight:700, color: accent || C.textSub, whiteSpace:'nowrap', marginLeft:12 }}>{right}</div>}
    </div>
  )
}

export default function DashboardSection({ navigateTo }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [visitRes, cotRes, instRes] = await Promise.all([
        apiFetch('/.netlify/functions/get-visits').catch(() => ({ ok:false, visits:[] })),
        apiFetch('/.netlify/functions/get-quotes').catch(() => ({ ok:false, quotes:[] })),
        apiFetch('/.netlify/functions/get-installations').catch(() => ({ ok:false, installations:[] })),
      ])

      const now   = new Date()
      const hoy   = new Date(now.toLocaleDateString('en-CA', { timeZone:'America/Santiago' }) + 'T00:00:00')
      const mañana = new Date(hoy); mañana.setDate(hoy.getDate()+1)
      const en7   = new Date(hoy); en7.setDate(hoy.getDate()+7)

      const visits       = visitRes.visits || []
      const quotes       = cotRes.quotes   || []
      const installations = instRes.installations || []

      // KPIs
      const visitasProximas  = visits.filter(v => new Date(v.start) >= hoy && new Date(v.start) < en7)
      const porConfirmar     = quotes.filter(q => q.status === 'por confirmar')
      const instProximas     = installations.filter(i => new Date(i.start) >= hoy && new Date(i.start) < en7)
      const cobrarPendiente  = installations.filter(i => !i.pago || i.pago === 'Pendiente')

      // Seguimiento
      const tresDias = new Date(hoy); tresDias.setDate(hoy.getDate()-3)
      const cotSinRespuesta = porConfirmar.filter(q => {
        if (!q.creado) return false
        try { return new Date(q.creado) < tresDias } catch { return false }
      })

      // Mañana
      const visitasMañana = visits.filter(v => {
        const d = new Date(v.start)
        return d >= mañana && d < new Date(mañana.getTime() + 24*60*60*1000)
      })
      const instMañana = installations.filter(i => {
        const d = new Date(i.start)
        return d >= mañana && d < new Date(mañana.getTime() + 24*60*60*1000)
      })

      // Total pendiente de cobrar
      const totalPendiente = cobrarPendiente.reduce((s, i) => s + (parseFloat(i.total)||0), 0)

      setData({ visitasProximas, porConfirmar, instProximas, cobrarPendiente, cotSinRespuesta, visitasMañana, instMañana, totalPendiente })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={styles.empty}>Cargando resumen...</div>
  if (!data) return null

  const { visitasProximas, porConfirmar, instProximas, cobrarPendiente, cotSinRespuesta, visitasMañana, instMañana, totalPendiente } = data

  const now = new Date()
  const hoy = now.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', timeZone:'America/Santiago' })

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ ...styles.sectionTitle, marginBottom:2 }}>Inicio</h2>
          <div style={{ fontSize:13, color:C.textMuted, textTransform:'capitalize' }}>{hoy}</div>
        </div>
        <button onClick={load} style={styles.btnSecondary}>Actualizar</button>
      </div>

      {/* KPIs */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <KpiCard
          label="Visitas próx. 7 días"
          value={visitasProximas.length}
          sub={visitasMañana.length > 0 ? visitasMañana.length + ' mañana' : 'Ninguna mañana'}
          color={C.orange}
          onClick={() => navigateTo('visitas')}
        />
        <KpiCard
          label="Por confirmar"
          value={porConfirmar.length}
          sub={cotSinRespuesta.length > 0 ? cotSinRespuesta.length + ' sin respuesta 3d+' : 'Al día'}
          color={C.yellow}
          alert={cotSinRespuesta.length}
          onClick={() => navigateTo('cotizaciones')}
        />
        <KpiCard
          label="Instalaciones próx. 7d"
          value={instProximas.length}
          sub={instMañana.length > 0 ? instMañana.length + ' mañana' : 'Ninguna mañana'}
          color={C.green}
          onClick={() => navigateTo('instalaciones')}
        />
        <KpiCard
          label="Por cobrar"
          value={cobrarPendiente.length}
          sub={totalPendiente > 0 ? fmt(totalPendiente) + ' total' : ''}
          color={cobrarPendiente.length > 0 ? C.red : C.green}
          alert={cobrarPendiente.length}
          onClick={() => navigateTo('instalaciones')}
        />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>
        {/* Mañana */}
        <SectionCard title="Mañana" action={() => navigateTo('visitas')} actionLabel="Ver visitas">
          {visitasMañana.length === 0 && instMañana.length === 0
            ? <div style={{ fontSize:13, color:C.textMuted, padding:'10px 0' }}>Sin actividad mañana.</div>
            : <>
                {visitasMañana.map(v => (
                  <Row key={v.id} left={v.nombre} right={fmtTime(v.start)} sub="Visita" accent={C.orange} />
                ))}
                {instMañana.map(i => (
                  <Row key={i.id} left={i.nombre} right={fmtTime(i.start)} sub={'Instalación' + (i.total ? ' · ' + fmt(i.total) : '')} accent={C.green} />
                ))}
              </>
          }
        </SectionCard>

        {/* Cotizaciones pendientes */}
        <SectionCard title="Cotizaciones por confirmar" action={() => navigateTo('cotizaciones')} actionLabel="Ver todas">
          {porConfirmar.length === 0
            ? <div style={{ fontSize:13, color:C.textMuted, padding:'10px 0' }}>Ninguna pendiente.</div>
            : porConfirmar.slice(0,5).map(q => {
                const dias = q.creado ? Math.floor((new Date() - new Date(q.creado)) / (1000*60*60*24)) : null
                const sinRespuesta = dias >= 3
                return (
                  <Row key={q.cotNum}
                    left={q.nombre}
                    right={sinRespuesta ? dias + 'd' : fmt(q.total)}
                    sub={'N°' + q.cotNum + (q.fechaVisita ? ' · ' + fmtDate(q.fechaVisita) : '')}
                    accent={sinRespuesta ? C.red : C.textSub}
                    onClick={() => navigateTo('cotizaciones')}
                  />
                )
              })
          }
          {porConfirmar.length > 5 && (
            <div style={{ fontSize:12, color:C.textMuted, paddingTop:8, textAlign:'center' }}>+ {porConfirmar.length - 5} más</div>
          )}
        </SectionCard>

        {/* Instalaciones próximas */}
        <SectionCard title="Instalaciones próximas (7 días)" action={() => navigateTo('instalaciones')} actionLabel="Ver todas">
          {instProximas.length === 0
            ? <div style={{ fontSize:13, color:C.textMuted, padding:'10px 0' }}>Sin instalaciones esta semana.</div>
            : instProximas.slice(0,5).map(i => (
                <Row key={i.id}
                  left={i.nombre}
                  right={fmtTime(i.start)}
                  sub={fmtDate(i.start) + (i.total ? ' · ' + fmt(i.total) : '')}
                  accent={C.green}
                  onClick={() => navigateTo('instalaciones')}
                />
              ))
          }
        </SectionCard>

        {/* Por cobrar */}
        <SectionCard title="Instalaciones por cobrar" action={() => navigateTo('instalaciones')} actionLabel="Ver todas">
          {cobrarPendiente.length === 0
            ? <div style={{ fontSize:13, color:C.textMuted, padding:'10px 0' }}>Todo al día.</div>
            : cobrarPendiente.slice(0,5).map(i => (
                <Row key={i.id}
                  left={i.nombre}
                  right={i.total ? fmt(i.total) : '—'}
                  sub={i.start ? fmtDate(i.start) : ''}
                  accent={C.red}
                  onClick={() => navigateTo('instalaciones')}
                />
              ))
          }
          {cobrarPendiente.length > 5 && (
            <div style={{ fontSize:12, color:C.textMuted, paddingTop:8, textAlign:'center' }}>+ {cobrarPendiente.length - 5} más</div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
