export const ADMIN_PASSWORD = '2003'
export const SESSION_KEY = 'dm_admin_auth'
export const CONVERTAPI_SECRET = 'SR5rDhdFxm8ddVMXxHjJdLmg3Rf0JLok'

export const VISIT_STATUS_LABELS = {
  pendiente: { label: 'Pendiente', color: '#6B7280' },
  cancelada: { label: 'Cancelada', color: '#EF4444' },
  reagendar: { label: 'Reagendar', color: '#F59E0B' },
  realizada: { label: 'Realizada', color: '#10B981' },
}

export const QUOTE_STATUS_LABELS = {
  'por confirmar': { label: 'Por confirmar', color: '#F59E0B' },
  'confirmada':    { label: 'Confirmada',    color: '#10B981' },
  'rechazada':     { label: 'Rechazada',     color: '#EF4444' },
}

export const SECTIONS = [
  { id: 'visitas',       label: 'Visitas',       icon: '📅' },
  { id: 'por-cotizar',   label: 'Por Cotizar',   icon: '📋' },
  { id: 'cotizaciones',  label: 'Cotizaciones',  icon: '📄' },
  { id: 'instalaciones', label: 'Instalaciones', icon: '🔧' },
]

export const DEFAULTS_REPISA = { l: 2.43, p: 0.48, a: 2, n: 4, u: 1, v: 130000 }

export function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('es-CL', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      timeZone: 'America/Santiago',
    }).format(new Date(iso))
  } catch { return iso }
}

export function fmtTime(iso) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('es-CL', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago',
    }).format(new Date(iso))
  } catch { return '' }
}

export function fmt(n) {
  return '$' + Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': ADMIN_PASSWORD,
      ...(opts.headers || {}),
    },
  })
  return res.json()
}

export const styles = {
  sectionTitle: { margin: 0, fontSize: 22, fontWeight: 800, color: '#1a1a1a' },
  card: {
    background: 'white', borderRadius: 12, padding: '18px 20px',
    boxShadow: '0 2px 10px rgba(0,0,0,.06)', border: '1px solid #f0f0f0',
  },
  cardLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#999',
    textTransform: 'uppercase', marginBottom: 12,
  },
  tab: {
    padding: '8px 18px', borderRadius: 8, border: '1.5px solid #e0e0e0',
    background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#555',
    transition: 'all .15s',
  },
  tabActive: { background: '#F47920', borderColor: '#F47920', color: 'white' },
  btnPrimary: {
    background: 'linear-gradient(135deg, #F47920, #D4600A)',
    color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(244,121,32,.3)',
  },
  btnSecondary: {
    background: 'white', border: '1.5px solid #ddd', borderRadius: 8,
    padding: '7px 14px', fontSize: 13, fontWeight: 600, color: '#555', cursor: 'pointer',
  },
  empty:    { textAlign: 'center', color: '#aaa', fontSize: 14, padding: '40px 0' },
  errorBox: {
    background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
    padding: '12px 16px', color: '#b91c1c', fontSize: 13, marginBottom: 16,
  },
  detailGrid: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px' },
  detailLabel: {
    color: '#999', fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
    letterSpacing: '.5px', alignSelf: 'center',
  },
}
