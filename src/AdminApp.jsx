import React, { useState, useEffect } from 'react'
import { SECTIONS, SESSION_EXPIRED_EVENT, C, styles, leerSesion, guardarSesion, cerrarSesion } from './admin/utils.js'
import DashboardSection    from './admin/Dashboard.jsx'
import VisitasSection      from './admin/Visitas.jsx'
import PorCotizarSection   from './admin/PorCotizar.jsx'
import CotizacionesSection from './admin/Cotizaciones.jsx'
import HorariosSection     from './admin/Horarios.jsx'
import CalendarioSection   from './admin/Calendario.jsx'
import EstadisticasSection from './admin/Instalaciones.jsx'
import PlanillaSection from './admin/Planilla.jsx'
import FotosWebSection from './admin/FotosWeb.jsx'

function Icon({ name, size = 16, color = 'currentColor' }) {
  const icons = {
    home:     (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>),
    calendar: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>),
    doc:      (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>),
    files:    (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>),
    agenda:   (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><rect x="7" y="13" width="4" height="4" rx="1" fill={color} stroke="none"/></svg>),
    clock:    (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>),
    chart:    (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="20" x2="20" y2="20"/><rect x="5" y="11" width="3" height="6" rx="1"/><rect x="10.5" y="7" width="3" height="10" rx="1"/><rect x="16" y="4" width="3" height="13" rx="1"/></svg>),
    table:    (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="4" x2="9" y2="20"/></svg>),
    image:    (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>),
    logout:   (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>),
  }
  return icons[name] || null
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

function LoginScreen({ onLogin }) {
  const [pwd, setPwd]         = useState('')
  const [error, setError]     = useState('')
  const [entrando, setEntrando] = useState(false)
  async function handleSubmit(e) {
    e.preventDefault()
    if (!pwd || entrando) return
    setEntrando(true); setError('')
    try {
      const res = await fetch('/.netlify/functions/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.token) { guardarSesion(data); onLogin(); return }
      setError(data.error || 'No se pudo ingresar'); setPwd('')
    } catch { setError('No se pudo conectar con el servidor') }
    finally { setEntrando(false) }
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #18181B 0%, #2c1a08 60%, #1a1005 100%)', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px' }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(219,153,43,.15) 0%, transparent 70%)' }}/>
        <div style={{ position: 'absolute', bottom: '-10%', left: '-10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(219,153,43,.08) 0%, transparent 70%)' }}/>
      </div>
      <div style={{ background: 'rgba(255,255,255,.97)', borderRadius: 20, padding: '40px 32px', width: '100%', maxWidth: 380, boxShadow: '0 30px 80px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <img src="/logo.png" alt="Don Maxi" style={{ height: 52, marginBottom: 10, objectFit: 'contain' }} onError={e => { e.target.style.display='none' }} />
          <div style={{ fontSize: 10, letterSpacing: 3, color: '#aaa', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>Panel Administrativo</div>
        </div>
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#999', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Contrasena</label>
            <input type="password" value={pwd} autoFocus
              onChange={e => { setPwd(e.target.value); setError('') }}
              placeholder="********"
              style={{ width: '100%', padding: '13px 14px', borderRadius: 10, fontSize: 16, border: '1.5px solid ' + (error ? '#EF4444' : '#E8E8EC'), outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#FAFAFA' }} />
            {error && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 6, marginBottom: 0 }}>{error}</p>}
          </div>
          <button type="submit" disabled={entrando} style={{ ...styles.btnPrimary, width: '100%', padding: '14px', fontSize: 15, borderRadius: 11, marginTop: 4, opacity: entrando ? .6 : 1 }}>{entrando ? 'Ingresando...' : 'Ingresar'}</button>
        </form>
      </div>
    </div>
  )
}

function SectionContent({ section, statuses, onStatusChange, navigateTo, setAllVisits: handleVisitsLoaded, allVisits, visitaParaCotizar, onVisitCotizada, cotizacionParaAbrir, abrirCotizacion, cotizacionEnfocada, verCotizacion }) {
  if (section === 'inicio')       return <DashboardSection navigateTo={navigateTo} />
  if (section === 'visitas')      return <VisitasSection statuses={statuses} onStatusChange={onStatusChange} navigateTo={navigateTo} onVisitsLoaded={handleVisitsLoaded} />
  if (section === 'cotizador')    return <PorCotizarSection statuses={statuses} visitaSeleccionada={visitaParaCotizar} cotizacionAbierta={cotizacionParaAbrir} allVisits={allVisits} onVisitCotizada={onVisitCotizada} />
  if (section === 'cotizaciones') return <CotizacionesSection onAbrirEnCotizador={abrirCotizacion} enfocar={cotizacionEnfocada} />
  if (section === 'calendario')   return <CalendarioSection onVerCotizacion={verCotizacion} />
  if (section === 'instalaciones') return <PlanillaSection onVerCotizacion={verCotizacion} />
  if (section === 'estadisticas') return <EstadisticasSection onVerCotizacion={verCotizacion} />
  if (section === 'horarios')     return <HorariosSection />
  if (section === 'web')          return <FotosWebSection />
  return null
}

export default function AdminApp() {
  const [authed, setAuthed]                       = useState(() => Boolean(leerSesion()))
  const [section, setSection]                     = useState('inicio')
  const [statuses, setStatuses]                   = useState({})
  const [visitaParaCotizar, setVisitaParaCotizar] = useState(null)
  const [allVisits, setAllVisits]                 = useState([])
  const [cotizacionParaAbrir, setCotizacionParaAbrir] = useState(null)
  const [cotizacionEnfocada, setCotizacionEnfocada]   = useState(null)
  const isMobile = useIsMobile()

  // Cualquier llamada rechazada por sesion vencida devuelve al login.
  useEffect(() => {
    const alVencer = () => setAuthed(false)
    window.addEventListener(SESSION_EXPIRED_EVENT, alVencer)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, alVencer)
  }, [])

  function salir() { cerrarSesion(); setAuthed(false) }

  function handleStatusChange(visitId, newStatus) {
    setStatuses(prev => ({ ...prev, [visitId]: newStatus }))
  }

  function handleVisitCotizada(visitId, newStatus) {
    setStatuses(prev => ({ ...prev, [visitId]: newStatus }))
  }

  function handleVisitsLoaded(visits) {
    setAllVisits(visits)
    setStatuses(prev => {
      const next = { ...prev }
      visits.forEach(v => { if (v.status && !next[v.id]) next[v.id] = v.status })
      return next
    })
  }

  function navigateTo(sec, visitData) {
    setSection(sec)
    if (sec === 'cotizador' && visitData) { setVisitaParaCotizar(visitData); setCotizacionParaAbrir(null) }
    else if (sec !== 'cotizador') { setVisitaParaCotizar(null); setCotizacionParaAbrir(null) }
  }

  // Desde el calendario: ir a la cotizacion de un evento, abierta.
  function verCotizacion(cotNum) {
    setCotizacionEnfocada({ cotNum, en: Date.now() })
    setSection('cotizaciones')
  }

  // Lleva una cotizacion guardada (con su proyecto 3D) al cotizador para seguir editandola.
  function abrirCotizacion(quote) {
    setVisitaParaCotizar(null)
    setCotizacionParaAbrir({ ...quote, abiertaEn: Date.now() })
    setSection('cotizador')
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />

  const currentSection = SECTIONS.find(s => s.id === section)
  const contentProps = {
    section, statuses, onStatusChange: handleStatusChange,
    navigateTo, setAllVisits: handleVisitsLoaded, allVisits, visitaParaCotizar,
    onVisitCotizada: handleVisitCotizada,
    cotizacionParaAbrir, abrirCotizacion, cotizacionEnfocada, verCotizacion,
  }

  // MOBILE
  if (isMobile) return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Instalada como app en el iPhone, la pantalla llega hasta arriba: el encabezado deja libre la hora y la isla. */}
      <header style={{ background: C.sidebar, padding: '0 16px', paddingTop: 'env(safe-area-inset-top)', height: 'calc(52px + env(safe-area-inset-top))', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <img src="/logo.png" alt="Don Maxi" style={{ height: 28, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} onError={e => { e.target.style.display='none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={currentSection?.icon} size={15} color={C.orange} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{currentSection?.label}</span>
        </div>
        <button onClick={salir}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
          <Icon name="logout" size={18} color="#6B7280" />
        </button>
      </header>
      <main style={{ flex: 1, padding: '16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))', overflowY: 'auto' }}>
        <SectionContent {...contentProps} />
      </main>
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.sidebar, borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {SECTIONS.map(s => {
          const active = section === s.id
          return (
            <button key={s.id} onClick={() => navigateTo(s.id)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, padding: '8px 2px', border: 'none', cursor: 'pointer',
              background: 'transparent', color: active ? C.orange : '#6B7280', transition: 'color .15s',
              position: 'relative',
            }}>
              {active && <div style={{ position: 'absolute', top: 0, width: 28, height: 2, borderRadius: '0 0 2px 2px', background: C.orange }}/>}
              <Icon name={s.icon} size={19} color={active ? C.orange : '#6B7280'} />
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, letterSpacing: .2, whiteSpace: 'nowrap' }}>{s.corto || s.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )

  // DESKTOP
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', background: C.bg }}>
      <aside style={{ width: 220, background: C.sidebar, color: 'white', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50 }}>
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <img src="/logo.png" alt="Don Maxi"
            style={{ height: 38, objectFit: 'contain', filter: 'brightness(0) invert(1)', maxWidth: '100%' }}
            onError={e => { e.target.style.display = 'none' }} />
        </div>
        <nav style={{ flex: 1, padding: '10px' }}>
          {SECTIONS.map(s => {
            const active = section === s.id
            return (
              <button key={s.id} onClick={() => navigateTo(s.id)} style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                padding: '10px 14px', marginBottom: 2,
                border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 10, transition: 'all .15s',
                background: active ? 'rgba(219,153,43,.18)' : 'transparent',
                color: active ? C.orange : '#9CA3AF',
                fontSize: 14, fontWeight: active ? 700 : 400,
              }}>
                <Icon name={s.icon} size={16} color={active ? C.orange : '#6B7280'} />
                {s.label}
                {active && <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: C.orange }}/>}
              </button>
            )
          })}
        </nav>
        <div style={{ padding: '14px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
          <button onClick={salir}
            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: '#4B5563', fontSize: 13, padding: '8px 10px', borderRadius: 8 }}>
            <Icon name="logout" size={14} color="#4B5563" />
            Cerrar sesion
          </button>
        </div>
      </aside>
      <div style={{ marginLeft: 220, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <header style={{ background: C.surface, borderBottom: '1px solid ' + C.border, padding: '0 32px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name={currentSection?.icon} size={17} color={C.orange} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{currentSection?.label}</span>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, background: C.bg, padding: '4px 12px', borderRadius: 6, fontWeight: 500 }}>Repisas Don Maxi</div>
        </header>
        {/* La planilla de instalaciones usa todo el ancho, como el Excel; el resto, una columna legible. */}
        <main style={{ flex: 1, padding: '28px 32px', maxWidth: section === 'instalaciones' ? 'none' : 960, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
          <SectionContent {...contentProps} />
        </main>
      </div>
    </div>
  )
}
