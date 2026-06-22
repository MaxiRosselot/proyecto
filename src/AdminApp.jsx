import React, { useState } from 'react'
import { ADMIN_PASSWORD, SESSION_KEY, SECTIONS, styles } from './admin/utils.js'
import VisitasSection        from './admin/Visitas.jsx'
import PorCotizarSection     from './admin/PorCotizar.jsx'
import CotizacionesSection   from './admin/Cotizaciones.jsx'
import InstalacionesSection  from './admin/Instalaciones.jsx'

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [pwd, setPwd]     = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (pwd === ADMIN_PASSWORD) { sessionStorage.setItem(SESSION_KEY, '1'); onLogin() }
    else { setError('Contraseña incorrecta'); setPwd('') }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1a0a 100%)' }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '40px 48px', width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 44 44" fill="none">
            <rect x="4" y="14" width="36" height="5" rx="2" fill="#F47920" opacity=".9"/>
            <rect x="4" y="22" width="36" height="5" rx="2" fill="#F47920" opacity=".9"/>
            <rect x="4" y="30" width="36" height="5" rx="2" fill="#F47920" opacity=".9"/>
            <rect x="8"  y="8" width="5" height="30" rx="2" fill="#F47920" opacity=".5"/>
            <rect x="31" y="8" width="5" height="30" rx="2" fill="#F47920" opacity=".5"/>
          </svg>
          <div style={{ fontFamily: 'sans-serif', fontWeight: 800, fontSize: 22, color: '#1a1a1a', marginTop: 8 }}>DON MAXI</div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#aaa', fontWeight: 600, textTransform: 'uppercase' }}>Panel Admin</div>
        </div>
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#999', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Contraseña</label>
            <input type="password" value={pwd} autoFocus onChange={e => { setPwd(e.target.value); setError('') }}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 8, fontSize: 16, border: `1.5px solid ${error ? '#ef4444' : '#ddd'}`, outline: 'none', fontFamily: 'sans-serif', boxSizing: 'border-box' }} />
            {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 5 }}>{error}</p>}
          </div>
          <button type="submit" style={{ ...styles.btnPrimary, width: '100%', padding: '12px', fontSize: 15, borderRadius: 10 }}>Entrar</button>
        </form>
      </div>
    </div>
  )
}

// ─── Admin App Principal ──────────────────────────────────────────────────────
export default function AdminApp() {
  const [authed, setAuthed]                       = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  const [section, setSection]                     = useState('visitas')
  const [statuses, setStatuses]                   = useState({})
  const [visitaParaCotizar, setVisitaParaCotizar] = useState(null)
  const [allVisits, setAllVisits]                 = useState([])

  function handleStatusChange(visitId, newStatus) {
    setStatuses(prev => ({ ...prev, [visitId]: newStatus }))
  }

  function navigateTo(sec, visitData) {
    setSection(sec)
    if (sec === 'por-cotizar' && visitData) setVisitaParaCotizar(visitData)
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F5F5F5' }}>

      {/* Sidebar */}
      <aside style={{ width: 220, background: '#1a1a1a', color: 'white', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50 }}>
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="32" height="32" viewBox="0 0 44 44" fill="none">
              <rect x="4" y="14" width="36" height="5" rx="2" fill="#F47920" opacity=".9"/>
              <rect x="4" y="22" width="36" height="5" rx="2" fill="#F47920" opacity=".9"/>
              <rect x="4" y="30" width="36" height="5" rx="2" fill="#F47920" opacity=".9"/>
              <rect x="8"  y="8" width="5" height="30" rx="2" fill="#F47920" opacity=".5"/>
              <rect x="31" y="8" width="5" height="30" rx="2" fill="#F47920" opacity=".5"/>
            </svg>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: .5 }}>DON MAXI</div>
              <div style={{ fontSize: 9, letterSpacing: 2, color: '#888', textTransform: 'uppercase' }}>Admin</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '12px 0' }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => navigateTo(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 20px',
                border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background .15s',
                background: section === s.id ? '#F47920' : 'transparent',
                color: section === s.id ? 'white' : '#ccc',
                fontSize: 14, fontWeight: section === s.id ? 700 : 400,
                borderLeft: section === s.id ? '3px solid rgba(255,255,255,.3)' : '3px solid transparent',
              }}>
              <span style={{ fontSize: 16 }}>{s.icon}</span>{s.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #333' }}>
          <button onClick={() => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false) }}
            style={{ color: '#888', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ← Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <header style={{ background: 'white', borderBottom: '1px solid #eee', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0, zIndex: 30 }}>
          <span style={{ fontSize: 16 }}>{SECTIONS.find(s => s.id === section)?.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#444' }}>{SECTIONS.find(s => s.id === section)?.label}</span>
        </header>

        <main style={{ flex: 1, padding: '28px 32px', maxWidth: 900, width: '100%' }}>
          {section === 'visitas' && (
            <VisitasSection statuses={statuses} onStatusChange={handleStatusChange} navigateTo={navigateTo} onVisitsLoaded={setAllVisits} />
          )}
          {section === 'por-cotizar' && (
            <PorCotizarSection statuses={statuses} visitaSeleccionada={visitaParaCotizar} allVisits={allVisits} />
          )}
          {section === 'cotizaciones'  && <CotizacionesSection />}
          {section === 'instalaciones' && <InstalacionesSection />}
        </main>
      </div>
    </div>
  )
}
