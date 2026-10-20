import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { C, apiFetch, fmt, styles } from './utils.js'
import { ahoraEnZona, diaSemana, sumarDias } from '../../netlify/functions/lib/horarios.mjs'
import { duracion, fechaLarga, linkWhatsappRecordatorio } from './whatsappInstalacion.js'
import { mensajeConfirmarInstalacion, mensajeInstalacion } from '../../netlify/functions/lib/mensajes.mjs'
import CopiarMensaje from './CopiarMensaje.jsx'

const TIPOS = {
  instalacion: { nombre: 'Instalación', color: '#059669', fondo: '#D1FAE5', texto: '#065F46' },
  visita:      { nombre: 'Visita',      color: '#2563EB', fondo: '#DBEAFE', texto: '#1E3A8A' },
  otro:        { nombre: 'Otro',        color: '#6B7280', fondo: '#F3F4F6', texto: '#374151' },
}
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const ALTO_HORA = 52
const inicioSemana = iso => sumarDias(iso, -((diaSemana(iso) + 6) % 7))
const diaDelMes = iso => Number(iso.slice(8, 10))
const mesDe = iso => iso.slice(0, 7)
const tituloMes = iso => { const t = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')); return t.charAt(0).toUpperCase() + t.slice(1) }
const mapa = dir => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`

function useEsMovil() {
  const [movil, setMovil] = useState(() => window.innerWidth < 768)
  useEffect(() => { const f = () => setMovil(window.innerWidth < 768); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return movil
}

// Eventos que se cruzan van lado a lado: cada uno recibe su columna y cuantas columnas tiene su grupo.
function acomodar(eventos) {
  const orden = [...eventos].sort((a, b) => a.minutoInicio - b.minutoInicio || b.minutoFin - a.minutoFin)
  const salida = []
  let grupo = [], finGrupo = -1
  const cerrar = () => { const n = Math.max(...grupo.map(g => g.col)) + 1; grupo.forEach(g => salida.push({ ...g, cols: n })); grupo = [] }
  for (const ev of orden) {
    if (grupo.length && ev.minutoInicio >= finGrupo) cerrar()
    const ocupadas = new Set(grupo.filter(g => g.minutoFin > ev.minutoInicio).map(g => g.col))
    let col = 0; while (ocupadas.has(col)) col++
    grupo.push({ ...ev, col }); finGrupo = Math.max(finGrupo, ev.minutoFin)
  }
  if (grupo.length) cerrar()
  return salida
}

function EtiquetaPago({ pago }) {
  if (!pago) return null
  if (pago.saldo === 0 && pago.total > 0) return <span style={{ ...styles.badge(C.green) }}>Pagada</span>
  return <span style={{ ...styles.badge(pago.pagado ? C.yellow : C.red) }}>Saldo {fmt(pago.saldo)}</span>
}

function Detalle({ evento, onCerrar, onVerCotizacion }) {
  const t = TIPOS[evento.tipo]
  const boton = { ...styles.btnSecondary, fontSize: 13, padding: '9px 14px', textDecoration: 'none', display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }
  useEffect(() => { const f = e => e.key === 'Escape' && onCerrar(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onCerrar])
  return (
    <div onClick={e => e.target === e.currentTarget && onCerrar()} role="dialog" aria-modal="true" aria-label={evento.cliente || evento.titulo}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(17,24,39,.35)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 'min(420px, 100%)', height: '100%', background: 'white', boxShadow: '-12px 0 40px rgba(0,0,0,.18)', padding: 24, paddingTop: 'max(24px, env(safe-area-inset-top))', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...styles.badge(t.color) }}>{t.nombre}</span>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.textMuted }}>✕</button>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{evento.cliente || evento.titulo}</div>
          <div style={{ fontSize: 14, color: C.textSub, marginTop: 4 }}>
            {fechaLarga(evento.fecha)}{evento.todoElDia ? ' · todo el día' : ` · ${evento.inicio} a ${evento.fin} (${duracion(evento.inicio, evento.fin)})`}
          </div>
        </div>
        <div style={{ ...styles.detailGrid, fontSize: 14 }}>
          {evento.ubicacion && <><span style={styles.detailLabel}>Dirección</span><a href={mapa(evento.ubicacion)} target="_blank" rel="noreferrer" style={{ color: C.blue }}>{evento.ubicacion}</a></>}
          {evento.telefono && <><span style={styles.detailLabel}>Teléfono</span><a href={'tel:' + evento.telefono.replace(/\s/g, '')} style={{ color: C.blue }}>{evento.telefono}</a></>}
          {evento.email && <><span style={styles.detailLabel}>Correo</span><span>{evento.email}</span></>}
          {evento.cotNum && <><span style={styles.detailLabel}>Cotización</span><span>N° {evento.cotNum}{evento.total ? ` · ${fmt(evento.total)}` : ''}</span></>}
        </div>
        {evento.pago && (
          <div style={{ padding: 12, borderRadius: 10, background: C.bg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>Pagado {fmt(evento.pago.pagado)} de {fmt(evento.pago.total)}</span><EtiquetaPago pago={evento.pago} />
            </div>
            <div style={{ height: 6, borderRadius: 99, background: C.border, overflow: 'hidden' }}>
              <div style={{ width: evento.pago.porcentaje + '%', height: '100%', background: evento.pago.saldo ? C.yellow : C.green }} />
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gap: 8, marginTop: 'auto' }}>
          {evento.tipo !== 'otro' && (
            <a href={linkWhatsappRecordatorio(evento)} target="_blank" rel="noreferrer" style={{ ...boton, background: '#25D366', borderColor: '#25D366', color: 'white' }}>
              Recordatorio por WhatsApp
            </a>
          )}
          {evento.tipo === 'instalacion' && (
            <CopiarMensaje texto={mensajeInstalacion({ nombre: evento.cliente, direccion: evento.ubicacion }, evento)} etiqueta="📋 Copiar mensaje de agendamiento" estilo={{ padding: '9px 12px' }} />
          )}
          {evento.tipo === 'instalacion' && (
            <CopiarMensaje texto={mensajeConfirmarInstalacion({ nombre: evento.cliente, direccion: evento.ubicacion }, evento)} etiqueta="📋 Copiar mensaje de confirmación" estilo={{ padding: '9px 12px' }} />
          )}
          {evento.cotNum && <button onClick={() => onVerCotizacion(evento.cotNum)} style={boton}>Ver cotización y pagos</button>}
          {evento.link && <a href={evento.link} target="_blank" rel="noreferrer" style={boton}>Abrir en Google Calendar</a>}
        </div>
      </div>
    </div>
  )
}

function Bloque({ ev, onAbrir, compacto }) {
  const t = TIPOS[ev.tipo]
  return (
    <button onClick={() => onAbrir(ev)} title={`${ev.inicio}–${ev.fin} · ${ev.cliente || ev.titulo}`}
      style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'block', width: '100%', height: '100%', overflow: 'hidden',
        background: t.fondo, borderLeft: `3px solid ${t.color}`, borderRadius: 6, padding: compacto ? '2px 6px' : '4px 7px', color: t.texto, fontSize: 11.5, lineHeight: 1.3 }}>
      <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.cliente || ev.titulo}</div>
      {!compacto && <div style={{ opacity: .85 }}>{ev.inicio}–{ev.fin}</div>}
      {!compacto && ev.pago && ev.pago.saldo > 0 && <div style={{ fontWeight: 700 }}>Saldo {fmt(ev.pago.saldo)}</div>}
    </button>
  )
}

function VistaSemana({ dias, eventos, hoy, onAbrir }) {
  const conHora = eventos.filter(e => !e.todoElDia)
  const desde = Math.min(7, ...conHora.map(e => Math.floor(e.minutoInicio / 60)))
  const hasta = Math.max(21, ...conHora.map(e => Math.ceil(e.minutoFin / 60)))
  const horas = Array.from({ length: hasta - desde }, (_, i) => desde + i)
  const ahora = ahoraEnZona()
  return (
    <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid ' + C.border, background: '#FAFAFB' }}>
        <div />
        {dias.map((d, i) => (
          <div key={d} style={{ padding: '10px 4px', textAlign: 'center', borderLeft: '1px solid ' + C.border }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase' }}>{DIAS_CORTOS[i]}</div>
            <div style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, marginTop: 2, borderRadius: '50%', fontSize: 15, fontWeight: 800,
              background: d === hoy ? C.orange : 'transparent', color: d === hoy ? 'white' : C.text }}>{diaDelMes(d)}</div>
            {eventos.filter(e => e.fecha === d && e.todoElDia).map(e => <div key={e.id} style={{ marginTop: 4, height: 20 }}><Bloque ev={e} onAbrir={onAbrir} compacto /></div>)}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', position: 'relative', maxHeight: 640, overflowY: 'auto' }}>
        <div>{horas.map(h => <div key={h} style={{ height: ALTO_HORA, fontSize: 11, color: C.textMuted, textAlign: 'right', paddingRight: 8, transform: 'translateY(-7px)' }}>{h}:00</div>)}</div>
        {dias.map(d => (
          <div key={d} data-dia={d} style={{ position: 'relative', borderLeft: '1px solid ' + C.border, background: d === hoy ? '#FFF8F2' : undefined,
            backgroundImage: `repeating-linear-gradient(to bottom, ${C.border} 0, ${C.border} 1px, transparent 1px, transparent ${ALTO_HORA}px)` }}>
            <div style={{ height: horas.length * ALTO_HORA }} />
            {acomodar(conHora.filter(e => e.fecha === d)).map(e => (
              <div key={e.id} style={{ position: 'absolute', top: (e.minutoInicio - desde * 60) / 60 * ALTO_HORA + 1, height: Math.max(22, (e.minutoFin - e.minutoInicio) / 60 * ALTO_HORA - 2),
                left: `calc(${(e.col / e.cols) * 100}% + 2px)`, width: `calc(${100 / e.cols}% - 4px)` }}>
                <Bloque ev={e} onAbrir={onAbrir} compacto={(e.minutoFin - e.minutoInicio) < 45} />
              </div>
            ))}
            {d === ahora.fecha && ahora.minutos >= desde * 60 && ahora.minutos <= hasta * 60 && (
              <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: (ahora.minutos - desde * 60) / 60 * ALTO_HORA, height: 2, background: C.red }}>
                <div style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: '50%', background: C.red }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function VistaMes({ dias, mes, eventos, hoy, onAbrir, onDia }) {
  return (
    <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#FAFAFB', borderBottom: '1px solid ' + C.border }}>
        {DIAS_CORTOS.map(d => <div key={d} style={{ padding: 8, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', textAlign: 'center' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {dias.map(d => {
          const delDia = eventos.filter(e => e.fecha === d)
          return (
            <div key={d} style={{ minHeight: 104, padding: 6, borderRight: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border, background: mesDe(d) === mes ? 'white' : '#FAFAFB' }}>
              <button onClick={() => onDia(d)} style={{ all: 'unset', cursor: 'pointer', display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: '50%', fontSize: 13, fontWeight: 700,
                background: d === hoy ? C.orange : 'transparent', color: d === hoy ? 'white' : mesDe(d) === mes ? C.text : C.textMuted }}>{diaDelMes(d)}</button>
              <div style={{ display: 'grid', gap: 3, marginTop: 4 }}>
                {delDia.slice(0, 3).map(e => (
                  <button key={e.id} onClick={() => onAbrir(e)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, padding: '2px 6px', borderRadius: 5, background: TIPOS[e.tipo].fondo, color: TIPOS[e.tipo].texto, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <strong>{e.todoElDia ? '' : e.inicio + ' '}</strong>{e.cliente || e.titulo}
                  </button>
                ))}
                {delDia.length > 3 && <button onClick={() => onDia(d)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: C.textMuted, fontWeight: 700, paddingLeft: 6 }}>+{delDia.length - 3} más</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VistaAgenda({ dias, eventos, hoy, onAbrir }) {
  const conEventos = dias.filter(d => eventos.some(e => e.fecha === d))
  if (!conEventos.length) return <div style={{ ...styles.card, ...styles.empty }}>No hay nada agendado en estos días.</div>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {conEventos.map(d => (
        <div key={d} style={{ ...styles.card, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: d === hoy ? C.orange : C.text, marginBottom: 8 }}>{d === hoy ? 'Hoy · ' : ''}{fechaLarga(d)}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {eventos.filter(e => e.fecha === d).sort((a, b) => a.minutoInicio - b.minutoInicio).map(e => (
              <button key={e.id} onClick={() => onAbrir(e)} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 10, alignItems: 'center',
                padding: '10px 12px', borderRadius: 10, background: TIPOS[e.tipo].fondo, borderLeft: `4px solid ${TIPOS[e.tipo].color}` }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: TIPOS[e.tipo].texto }}>{e.todoElDia ? 'Día' : e.inicio}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.cliente || e.titulo}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {TIPOS[e.tipo].nombre}{e.todoElDia ? '' : ` · hasta ${e.fin}`}{e.ubicacion ? ' · ' + e.ubicacion : ''}
                  </span>
                </span>
                <EtiquetaPago pago={e.pago} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Recordatorios de mañana: un toque para mandar cada uno por WhatsApp. El correo sale solo a las 10:00.
function Manana({ eventos }) {
  const pendientes = eventos.filter(e => e.tipo !== 'otro')
  if (!pendientes.length) return null
  return (
    <div style={{ ...styles.card, marginBottom: 16, borderLeft: '4px solid ' + C.orange }}>
      <div style={styles.cardLabel}>Recordatorios de mañana · {fechaLarga(pendientes[0].fecha)}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {pendientes.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid ' + C.border }}>
            <span style={{ ...styles.badge(TIPOS[e.tipo].color) }}>{TIPOS[e.tipo].nombre}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{e.inicio} · {e.cliente}</span>
            <span style={{ fontSize: 12, color: e.email ? C.green : C.textMuted }}>{e.email ? '✓ Correo automático' : 'Sin correo'}</span>
            <a href={linkWhatsappRecordatorio(e)} target="_blank" rel="noreferrer"
              style={{ ...styles.btnSecondary, marginLeft: 'auto', fontSize: 12, padding: '6px 12px', textDecoration: 'none', background: '#25D366', borderColor: '#25D366', color: 'white' }}>
              Recordar por WhatsApp
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CalendarioSection({ onVerCotizacion }) {
  const movil = useEsMovil()
  const hoy = ahoraEnZona().fecha
  const [vista, setVista] = useState(() => (window.innerWidth < 768 ? 'agenda' : 'semana'))
  const [cursor, setCursor] = useState(hoy)
  const [eventos, setEventos] = useState([])
  const [manana, setManana] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [filtro, setFiltro] = useState({ instalacion: true, visita: true, otro: true })

  const dias = useMemo(() => {
    if (vista === 'semana') return Array.from({ length: 7 }, (_, i) => sumarDias(inicioSemana(cursor), i))
    if (vista === 'mes') { const inicio = inicioSemana(cursor.slice(0, 8) + '01'); return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i)) }
    return Array.from({ length: 14 }, (_, i) => sumarDias(cursor, i))
  }, [vista, cursor])

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const r = await apiFetch(`/.netlify/functions/calendario?desde=${dias[0]}&hasta=${dias.at(-1)}`)
      if (!r.ok) throw new Error(r.error || 'No se pudo leer el calendario')
      setEventos(r.eventos)
    } catch (e) { setError(e.message) }
    finally { setCargando(false) }
  }, [dias])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const m = sumarDias(hoy, 1)
    apiFetch(`/.netlify/functions/calendario?desde=${m}&hasta=${m}`).then(r => r.ok && setManana(r.eventos)).catch(() => {})
  }, [hoy])

  const paso = vista === 'mes' ? null : vista === 'semana' ? 7 : 14
  const mover = sentido => setCursor(c => {
    if (paso) return sumarDias(c, sentido * paso)
    const [y, m] = c.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + sentido, 1))
    return d.toISOString().slice(0, 10)
  })
  const titulo = vista === 'mes' ? tituloMes(cursor)
    : `${diaDelMes(dias[0])} ${mesDe(dias[0]) !== mesDe(dias.at(-1)) ? tituloMes(dias[0]).split(' ')[0].slice(0, 3).toLowerCase() + ' ' : ''}– ${diaDelMes(dias.at(-1))} de ${tituloMes(dias.at(-1)).toLowerCase()}`
  const visibles = eventos.filter(e => filtro[e.tipo])
  const resumen = { instalacion: eventos.filter(e => e.tipo === 'instalacion').length, visita: eventos.filter(e => e.tipo === 'visita').length }
  const segmento = activo => ({ padding: '7px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: activo ? 'white' : 'transparent', color: activo ? C.text : C.textSub, boxShadow: activo ? '0 1px 3px rgba(0,0,0,.12)' : 'none' })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setCursor(hoy)} style={{ ...styles.btnSecondary, padding: '7px 14px' }}>Hoy</button>
          <button onClick={() => mover(-1)} aria-label="Anterior" style={{ ...styles.btnSecondary, padding: '7px 12px' }}>‹</button>
          <button onClick={() => mover(1)} aria-label="Siguiente" style={{ ...styles.btnSecondary, padding: '7px 12px' }}>›</button>
          <h2 style={{ ...styles.sectionTitle, fontSize: movil ? 16 : 20, marginLeft: 4 }}>{titulo}</h2>
        </div>
        <div style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: '#EEF0F3' }} role="tablist" aria-label="Vista del calendario">
          {[['semana', 'Semana'], ['mes', 'Mes'], ['agenda', 'Agenda']].map(([v, nombre]) => (
            <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)} style={segmento(vista === v)}>{nombre}</button>
          ))}
        </div>
      </div>

      <Manana eventos={manana} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {Object.entries(TIPOS).map(([tipo, t]) => (
          <button key={tipo} onClick={() => setFiltro(f => ({ ...f, [tipo]: !f[tipo] }))} aria-pressed={filtro[tipo]}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              border: '1.5px solid ' + (filtro[tipo] ? t.color : C.border), background: filtro[tipo] ? t.fondo : 'white', color: filtro[tipo] ? t.texto : C.textMuted }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />{t.nombre}{tipo !== 'otro' && resumen[tipo] ? ` · ${resumen[tipo]}` : ''}
          </button>
        ))}
        <button onClick={cargar} style={{ ...styles.btnSecondary, fontSize: 12, padding: '5px 12px', marginLeft: 'auto' }}>{cargando ? 'Cargando...' : 'Actualizar'}</button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}
      {vista === 'semana' && <VistaSemana dias={dias} eventos={visibles} hoy={hoy} onAbrir={setAbierto} />}
      {vista === 'mes' && <VistaMes dias={dias} mes={mesDe(cursor)} eventos={visibles} hoy={hoy} onAbrir={setAbierto} onDia={d => { setCursor(d); setVista(movil ? 'agenda' : 'semana') }} />}
      {vista === 'agenda' && <VistaAgenda dias={dias} eventos={visibles} hoy={hoy} onAbrir={setAbierto} />}
      {abierto && <Detalle evento={abierto} onCerrar={() => setAbierto(null)} onVerCotizacion={n => { setAbierto(null); onVerCotizacion?.(n) }} />}
    </div>
  )
}
