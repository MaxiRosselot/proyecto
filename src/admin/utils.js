// La contraseña del panel ya no vive en el navegador: admin-login la valida en el servidor y
// devuelve un token que vence. Aca solo se guarda ese token, por pestaña.
export const SESSION_KEY = 'dm_admin_session'
export const SESSION_EXPIRED_EVENT = 'dm:sesion-vencida'

export function leerSesion() {
  try {
    const sesion = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    return sesion?.token && sesion.expiresAt > Date.now() ? sesion : null
  } catch { return null }
}
export function guardarSesion({ token, expiresAt }) { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt })) }
export function cerrarSesion() { sessionStorage.removeItem(SESSION_KEY) }
export function authHeaders() {
  const sesion = leerSesion()
  return sesion ? { Authorization: 'Bearer ' + sesion.token } : {}
}

export const VISIT_STATUS_LABELS = {
  agendada:           { label: 'Agendada',              color: '#3B82F6' },
  confirmada:         { label: 'Confirmada',            color: '#0D9488' },
  pendiente:          { label: 'Pendiente de declarar', color: '#F59E0B' },
  realizada:          { label: 'Realizada',             color: '#10B981' },
  realizada_cotizada: { label: 'Realizada y cotizada',  color: '#8B5CF6' },
  cancelada:          { label: 'Cancelada',             color: '#EF4444' },
  reagendar:          { label: 'Reagendar',             color: '#F97316' },
  por_revisar:        { label: 'Por revisar',           color: '#64748B' }, // importadas de Calendly
}

export const QUOTE_STATUS_LABELS = {
  'por confirmar': { label: 'Por confirmar', color: '#F59E0B' },
  'confirmada':    { label: 'Confirmada',    color: '#10B981' },
  'rechazada':     { label: 'Rechazada',     color: '#EF4444' },
}

// Ordenadas por uso real (registro de uso, 11–25 nov 2026): arriba lo que se abre a diario; las que
// casi no se usan van juntas bajo "Más" (en el PC al final del menu; en el celular, en el boton Más).
// barraMovil: las pocas que van en la barra de abajo del celular, en ese orden. soloPc: no sale en el celular.
// Instalaciones es la central (la planilla de ventas); Estadisticas, los graficos y resumenes.
export const SECTIONS = [
  { id: 'inicio',        label: 'Inicio',        icon: 'home', barraMovil: 1 },
  { id: 'cotizaciones',  label: 'Cotizaciones',  icon: 'files', corto: 'Cotiz.', barraMovil: 3 },
  { id: 'whatsapp',      label: 'WhatsApp',      icon: 'chat', soloPc: true },
  { id: 'instalaciones', label: 'Instalaciones', icon: 'table', corto: 'Instal.', barraMovil: 2 },
  { id: 'cotizador',     label: 'Cotizar',       icon: 'doc'   },
  { id: 'calendario',    label: 'Calendario',    icon: 'agenda', corto: 'Agenda', barraMovil: 4 },
  { id: 'dte',           label: 'DTE',           icon: 'doc' },
  { id: 'visitas',       label: 'Visitas',       icon: 'calendar', mas: true },
  { id: 'estadisticas',  label: 'Estadísticas',  icon: 'chart', corto: 'Stats', mas: true },
  { id: 'horarios',      label: 'Horarios',      icon: 'clock', mas: true },
  { id: 'pendientes',    label: 'Pendientes',    icon: 'list', mas: true },
  { id: 'web',           label: 'Web',           icon: 'image', mas: true },
]
export const BARRA_MOVIL = SECTIONS.filter(s => s.barraMovil).sort((a, b) => a.barraMovil - b.barraMovil)

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

// Llama a una funcion del panel con la sesion. Si el servidor la rechaza (vencio o cambio la
// contraseña) se cierra, y AdminApp vuelve al login en vez de dejar pantallas vacias.
export async function adminFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(opts.headers || {}),
    },
  })
  if (res.status === 401) {
    cerrarSesion()
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  }
  return res
}

export async function apiFetch(path, opts = {}) {
  return (await adminFetch(path, opts)).json()
}

// Mas nuevas arriba. creadoMs lo calcula el servidor desde "Creado" (formato chileno).
export function porCreacion(a, b) {
  return ((b.creadoMs ?? -Infinity) - (a.creadoMs ?? -Infinity)) || (Number(b.cotNum) - Number(a.cotNum))
}

// Design tokens
const C = {
  orange:      '#DB992B',
  orangeDark:  '#A86E14',
  orangeLight: '#FBF3E4',
  bg:          '#F4F5F7',
  surface:     '#FFFFFF',
  border:      '#E8E8EC',
  text:        '#111827',
  textSub:     '#6B7280',
  textMuted:   '#9CA3AF',
  green:       '#10B981',
  red:         '#EF4444',
  yellow:      '#F59E0B',
  blue:        '#3B82F6',
  purple:      '#8B5CF6',
  sidebar:     '#18181B',
  sidebarHover:'#27272A',
}

export { C }

export const styles = {
  sectionTitle: {
    margin: 0, fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.3px',
  },
  card: {
    background: C.surface,
    borderRadius: 14,
    padding: '20px 22px',
    boxShadow: '0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)',
  },
  cardLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.textMuted,
    textTransform: 'uppercase', marginBottom: 14,
  },
  tab: {
    padding: '7px 16px', borderRadius: 8, border: `1.5px solid ${C.border}`,
    background: C.surface, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    color: C.textSub, transition: 'all .15s',
  },
  tabActive: {
    background: C.orange, borderColor: C.orange, color: 'white',
    boxShadow: '0 2px 8px rgba(219,153,43,.35)',
  },
  btnPrimary: {
    background: `linear-gradient(135deg, ${C.orange}, ${C.orangeDark})`,
    color: 'white', border: 'none', borderRadius: 9, padding: '9px 20px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 3px 10px rgba(219,153,43,.3)',
    transition: 'opacity .15s',
  },
  btnSecondary: {
    background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 9,
    padding: '8px 16px', fontSize: 13, fontWeight: 600, color: C.textSub,
    cursor: 'pointer', transition: 'background .15s',
  },
  empty:    { textAlign: 'center', color: C.textMuted, fontSize: 14, padding: '48px 0' },
  errorBox: {
    background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10,
    padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16,
  },
  detailGrid: {
    display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 18px',
  },
  detailLabel: {
    color: C.textMuted, fontWeight: 700, fontSize: 10.5,
    textTransform: 'uppercase', letterSpacing: '.6px', alignSelf: 'center',
    whiteSpace: 'nowrap',
  },
  input: {
    width: '100%', padding: '9px 12px', borderRadius: 9,
    border: `1.5px solid ${C.border}`, fontSize: 14,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
    color: C.text, background: '#FAFAFA',
    transition: 'border-color .15s',
  },
  badge: (color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 99,
    fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase',
    background: color + '18', color: color,
    border: `1px solid ${color}30`,
  }),
}
