import React, { useState, useEffect } from 'react'
import { ADMIN_PASSWORD, SESSION_KEY, SECTIONS, C, styles } from './admin/utils.js'
import VisitasSection        from './admin/Visitas.jsx'
import PorCotizarSection     from './admin/PorCotizar.jsx'
import CotizacionesSection   from './admin/Cotizaciones.jsx'
import InstalacionesSection  from './admin/Instalaciones.jsx'

function Icon({ name, size = 16, color = 'currentColor' }) {
  const icons = {
    calendar: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>),
    doc:      (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>),
    files:    (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>),
    wrench:   (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>),
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
  const [pwd, setPwd]     = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (pwd === ADMIN_PASSWORD) { sessionStorage.setItem(SESSION_KEY, '1'); onLogin() }
    else { setError('Contrasena incorrecta'); setPwd('') }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #18181B 0%, #2c1a08 60%, #1a1005 100%)', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px' }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,121,32,.15) 0%, transparent 70%)' }}/>
        <div style={{ position: 'absolute', bottom: '-10%', left: '-10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,121,32,.08) 0%, transparent 70%)' }}/>
      </div>
      <div style={{ background: 'rgba(255,255,255,.97)', borderRadius: 20, padding: '40px 32px', width: '100%', maxWidth: 380, boxShadow: '0 30px 80px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <img src="/logo.png" alt="Don Maxi" style={{ height: 52, marginBottom: 10, objectFit: 'contain' }} onError={e => { e.target.style.display='none' }} />
          <div style={{ fontSize: 10, letterSpacing: 3, color: '#aaa', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>Panel Administrativo</div>
        </div>
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#999', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Contrasena</label>
            <input type="password" value={pwd} autoFocus onChange={e => { setPwd(e.target.value); setError('') }} placeholder="••••••••"
              style={{ width: '100%', padding: '13px 14px', borderRadius: 10, fontSize: 16, border: '1.5px solid ' + (error ? '#EF4444' : '#E8E8EC'), outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#FAFAFA' }} />
            {error && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 6, marginBottom: 0 }}>{error}</p>}
          </div>
          <button type="submit" style={{ ...styles.btnPrimary, width: '100%', padding: '14px', fontSize: 15, borderRadius: 11, marginTop: 4 }}>Ingresar</button>
        </form>
      </div>
    </div>
  )
}

export default function AdminApp() {
  const [authed, setAuthed]                       = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  const [section, setSection]                     = useState('visitas')
  const [statuses, setStatuses]                   = useState({})
  const [visitaParaCotizar, setVisitaParaCotizar] = useState(null)
  const [allVisits, setAllVisits]                 = useState([])
  const isMobile = useIsMobile()

  function handleStatusChange(visitId, newStatus) { setStatuses(prev => ({ ...prev, [visitId]: newStatus })) }
  function navigateTo(sec, visitData) {
    setSection(sec)
    if (sec === 'por-cotizar' && visitData) setVisitaParaCotizar(visitData)
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />

  const currentSection = SECTIONS.find(s => s.id === section)

  // ── MOBILE: barra inferior ─────────────────────────────────────────────────
  if (isMobile) return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header móvil */}
      <header style={{ background: C.sidebar, padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Don Maxi" style={{ height: 28, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} onError={e => { e.target.style.display='none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={currentSection?.icon} size={15} color={C.orange} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{currentSection?.label}</span>
        </div>
        <button onClick={() => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
          <Icon name="logout" size={18} color="#6B7280" />
        </button>
      </header>

      {/* Contenido */}
      <main style={{ flex: 1, padding: '16px', paddingBottom: 80, overflowY: 'auto' }}>
        {section === 'visitas'       && <VisitasSection statuses={statuses} onStatusChange={handleStatusChange} navigateTo={navigateTo} onVisitsLoaded={setAllVisits} />}
        {section === 'por-cotizar'   && <PorCotizarSection statuses={statuses} visitaSeleccionada={visitaParaCotizar} allVisits={allVisits} />}
        {section === 'cotizaciones'  && <CotizacionesSection />}
        {section === 'instalaciones' && <InstalacionesSection />}
      </main>

      {/* Tab bar inferior */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.sidebar, borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {SECTIONS.map(s => {
          const active = section === s.id
          return (
            <button key={s.id} onClick={() => navigateTo(s.id)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, padding: '10px 4px', border: 'none', cursor: 'pointer',
              background: 'transparent',
              color: active ? C.orange : '#6B7280',
              transition: 'color .15s',
            }}>
              <Icon name={s.icon} size={20} color={active ? C.orange : '#6B7280'} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: .2 }}>{s.label}</span>
              {active && <div style={{ position: 'absolute', top: 0, width: 32, height: 2, borderRadius: '0 0 2px 2px', background: C.orange, marginTop: 0 }}/>}
            </button>
          )
        })}
      </nav>
    </div>
  )

  // ── DESKTOP: sidebar lateral ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', background: C.bg }}>
      <aside style={{ width: 230, background: C.sidebar, color: 'white', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50 }}>
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <img src="/logo.png" alt="Don Maxi" style={{ height: 38, objectFit: 'contain', filter: 'brightness(0) invert(1)', maxWidth: '100%' }}
            onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
          <div style={{ display: 'none', alignItems: 'center', gap: 10 }}>
            <svg width="28" height="28" viewBox="0 0 44 44" fill="none">
              <rect x="4" y="14" width="36" height="5" rx="2" fill="#F47920"/>
              <rect x="4" y="22" width="36" height="5" rx="2" fill="#F47920"/>
              <rect x="4" y="30" width="36" height="5" rx="2" fill="#F47920"/>
              <rect x="8" y="8" width="5" height="30" rx="2" fill="#F47920" opacity=".4"/>
              <rect x="31" y="8" width="5" height="30" rx="2" fill="#F47920" opacity=".4"/>
            </svg>
            <div><div style={{ fontWeight: 800, fontSize: 14 }}>DON MAXI</div></div>
          </div>
        </div>
        <nav style={{ flex: 1, padding: '10px' }}>
          {SECTIONS.map(s => {
            const active = section === s.id
            return (
              <button key={s.id} onClick={() => navigateTo(s.id)} style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                padding: '10px 14px', marginBottom: 2,
                border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 10, transition: 'all .15s',
                background: active ? 'rgba(244,121,32,.18)' : 'transparent',
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
          <button onClick={() => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: '#4B5563', fontSize: 13, padding: '8px 10px', borderRadius: 8 }}>
            <Icon name="logout" size={14} color="#4B5563" />
            Cerrar sesion
          </button>
        </div>
      </aside>

      <div style={{ marginLeft: 230, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <header style={{ background: C.surface, borderBottom: '1px solid ' + C.border, padding: '0 32px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name={currentSection?.icon} size={17} color={C.orange} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{currentSection?.label}</span>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, background: C.bg, padding: '4px 12px', borderRadius: 6, fontWeight: 500 }}>Repisas Don Maxi</div>
        </header>
        <main style={{ flex: 1, padding: '28px 32px', maxWidth: 960, width: '100%' }}>
          {section === 'visitas'       && <VisitasSection statuses={statuses} onStatusChange={handleStatusChange} navigateTo={navigateTo} onVisitsLoaded={setAllVisits} />}
          {section === 'por-cotizar'   && <PorCotizarSection statuses={statuses} visitaSeleccionada={visitaParaCotizar} allVisits={allVisits} />}
          {section === 'cotizaciones'  && <CotizacionesSection />}
          {section === 'instalaciones' && <InstalacionesSection />}
        </main>
      </div>
    </div>
  )
}
