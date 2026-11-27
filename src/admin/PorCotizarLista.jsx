import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { C, apiFetch, styles } from './utils.js'
import { ahoraEnZona } from '../../netlify/functions/lib/horarios.mjs'
import { hayBorradorSinGuardar } from './PorCotizar.jsx'
import CopiarMensaje from './CopiarMensaje.jsx'
import { telefonoLegible } from './whatsappPanel.js'
import { ORIGEN, armarPorCotizar, linkInstagram, mensajePasarAWhatsapp, mensajePedirDatosInstagram, mensajeRecibido } from './porCotizar.js'

// Admin → Por cotizar: todo lo que falta cotizar en una lista, lo mas antiguo arriba.
// Las de WhatsApp, Instagram u otro lado se anotan aca (o desde la seccion WhatsApp); las fotos de
// la web, las visitas realizadas y las cotizaciones automaticas aparecen solas.

const API = '/.netlify/functions/por-cotizar'
const VACIO = { origen: 'whatsapp', nombre: '', telefono: '', instagram: '', email: '', direccion: '', detalle: '' }
const FILTROS = ['todas', 'whatsapp', 'instagram', 'correo', 'visita', 'web', 'otro']

export async function anotarPorCotizar(item) {
  const r = await apiFetch(API, { method: 'POST', body: JSON.stringify({ accion: 'anotar', item }) })
  if (!r.ok) throw new Error(r.error || 'No se pudo anotar')
  return r
}

const campo = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1.5px solid ' + C.border, fontSize: 14, fontFamily: 'inherit', background: 'white' }
const etiqueta = { fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .6, display: 'block', marginBottom: 4 }
const boton = { padding: '6px 12px', borderRadius: 8, border: '1.5px solid ' + C.border, background: 'white', color: C.textSub, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
const enlace = { ...boton, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }

function Formulario({ inicial, onGuardar, onCancelar, guardando }) {
  const [f, setF] = useState({ ...VACIO, ...inicial })
  const editar = Boolean(inicial?.id)
  const cambiar = k => e => setF(v => ({ ...v, [k]: e.target.value }))
  return (
    <form data-testid="form-por-cotizar" onSubmit={e => { e.preventDefault(); onGuardar(f) }} style={{ ...styles.card, display: 'grid', gap: 12, marginBottom: 16, border: '1.5px solid ' + C.orange }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text, marginRight: 6 }}>{editar ? 'Editar' : 'Anotar'} cotización por hacer · llegó por</span>
        {['whatsapp', 'instagram', 'otro'].map(o => (
          <button key={o} type="button" onClick={() => setF(v => ({ ...v, origen: o }))} aria-pressed={f.origen === o}
            style={{ ...boton, borderColor: f.origen === o ? ORIGEN[o].color : C.border, background: f.origen === o ? ORIGEN[o].fondo : 'white', color: f.origen === o ? ORIGEN[o].color : C.textSub }}>
            {ORIGEN[o].icono} {ORIGEN[o].etiqueta}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <label><span style={etiqueta}>Nombre</span><input style={campo} value={f.nombre} onChange={cambiar('nombre')} autoFocus /></label>
        {f.origen === 'instagram' && <label><span style={etiqueta}>Usuario de Instagram</span><input style={campo} value={f.instagram} onChange={cambiar('instagram')} placeholder="@usuario" /></label>}
        <label><span style={etiqueta}>Celular{f.origen === 'instagram' ? ' (cuando lo dé)' : ''}</span><input style={campo} value={f.telefono} onChange={cambiar('telefono')} placeholder="+56 9 ..." inputMode="tel" /></label>
        <label><span style={etiqueta}>Comuna o dirección</span><input style={campo} value={f.direccion} onChange={cambiar('direccion')} /></label>
        {f.origen === 'otro' && <label><span style={etiqueta}>Correo</span><input style={campo} value={f.email} onChange={cambiar('email')} type="email" /></label>}
      </div>
      <label><span style={etiqueta}>Qué quiere / medidas</span>
        <textarea style={{ ...campo, minHeight: 64, resize: 'vertical' }} value={f.detalle} onChange={cambiar('detalle')}
          placeholder={f.origen === 'whatsapp' ? 'Ej.: bodega 2,4 x 1,2 x 2,5, mandó 3 fotos por WhatsApp' : 'Ej.: repisas para bodega, falta pedir medidas'} />
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancelar} style={boton}>Cancelar</button>
        <button type="submit" disabled={guardando} style={{ ...styles.btnPrimary, opacity: guardando ? .6 : 1 }}>{guardando ? 'Guardando…' : editar ? 'Guardar' : 'Anotar'}</button>
      </div>
    </form>
  )
}

function Tarjeta({ it, onCotizar, onEstado, onEditar, onBorrar, ocupado }) {
  const o = ORIGEN[it.origen] || ORIGEN.otro
  const hecha = it.estado !== 'pendiente'
  const tarde = !hecha && it.dias >= 3
  const mensajes = []
  if (!hecha) {
    if (it.origen === 'instagram' && !it.telefono) mensajes.push(<CopiarMensaje key="ig" texto={mensajePedirDatosInstagram(it)} etiqueta="Copiar: pedir su WhatsApp" />)
    else if (it.origen === 'instagram') mensajes.push(<CopiarMensaje key="pasar" texto={mensajePasarAWhatsapp(it)} etiqueta="Copiar: seguir por WhatsApp" telefono={it.telefono} />)
    else if (it.telefono && ['whatsapp', 'correo', 'otro'].includes(it.origen)) mensajes.push(<CopiarMensaje key="rec" texto={mensajeRecibido(it)} etiqueta="Copiar: “recibido, te cotizo”" telefono={it.telefono} />)
  }
  return (
    <div data-testid="por-cotizar-item" data-clave={it.clave} style={{ ...styles.card, padding: '14px 16px', display: 'grid', gap: 8, opacity: hecha ? .75 : 1, borderLeft: '4px solid ' + (tarde ? '#EF4444' : o.color) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: o.color, background: o.fondo, padding: '3px 8px', borderRadius: 6 }}>{o.icono} {o.etiqueta}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{it.nombre || (it.instagram ? '@' + it.instagram : 'Sin nombre')}</span>
        {it.telefono && <span style={{ fontSize: 13, color: C.textSub }}>{telefonoLegible(it.telefono) || it.telefono}</span>}
        {it.instagram && it.nombre && <span style={{ fontSize: 13, color: C.textSub }}>@{it.instagram}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: hecha ? C.textMuted : tarde ? '#DC2626' : C.textSub }} title={it.creado}>
          {hecha
            ? (it.estado === 'cotizada' ? `✓ Cotizada${it.cotNum ? ' · N° ' + it.cotNum : ''}${it.sola ? ' (por su celular)' : ''}` : 'No se cotiza')
            : it.dias === 0 ? 'Llegó hoy' : it.dias === 1 ? 'Hace 1 día' : `Hace ${it.dias} días`}
        </span>
      </div>
      {it.direccion && <div style={{ fontSize: 13, color: C.textSub }}>📍 {it.direccion}</div>}
      {it.detalle && <div style={{ fontSize: 13, color: C.text, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{it.detalle}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {!hecha && (
          <button type="button" data-testid="cotizar-pendiente" onClick={() => onCotizar(it)} disabled={ocupado}
            style={{ ...styles.btnPrimary, padding: '6px 14px', fontSize: 12.5 }}>
            {it.origen === 'web' ? 'Revisar en Cotizar' : 'Cotizar'}
          </button>
        )}
        {it.link && <a href={it.link} target="_blank" rel="noreferrer" style={enlace}>📁 Ver fotos y videos</a>}
        {it.origen === 'instagram' && it.instagram && <a href={linkInstagram(it.instagram)} target="_blank" rel="noreferrer" style={enlace}>📸 Abrir su chat de Instagram</a>}
        {mensajes}
        <span style={{ marginLeft: 'auto' }} />
        {!it.ref && it.id && !hecha && <button type="button" onClick={() => onEditar(it)} style={boton}>{it.origen === 'instagram' && !it.telefono ? 'Agregar celular' : 'Editar'}</button>}
        {!hecha && it.origen === 'web' && <button type="button" onClick={() => onEstado(it, 'cotizada')} disabled={ocupado} style={boton} title="La automática está bien: sale de la lista">Está bien así</button>}
        {!hecha && it.origen !== 'web' && <button type="button" onClick={() => onEstado(it, 'cotizada', true)} disabled={ocupado} style={boton}>Ya la cotizé</button>}
        {!hecha && <button type="button" onClick={() => onEstado(it, 'descartada')} disabled={ocupado} style={boton} title="No hay que cotizarla (no respondió, era otra cosa…)">No cotizar</button>}
        {hecha && !it.sola && it.origen !== 'visita' && <button type="button" onClick={() => onEstado(it, 'pendiente')} disabled={ocupado} style={boton}>Volver a pendiente</button>}
        {hecha && !it.ref && it.id && <button type="button" onClick={() => onBorrar(it)} disabled={ocupado} style={{ ...boton, color: '#B91C1C' }}>Borrar</button>}
      </div>
    </div>
  )
}

export default function PorCotizarLista({ navigateTo, onAbrirEnCotizador }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [verHechas, setVerHechas] = useState(false)
  const [form, setForm] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [pc, vis, cot] = await Promise.all([
        apiFetch(API),
        apiFetch('/.netlify/functions/get-visits').catch(() => ({ ok: false })),
        apiFetch('/.netlify/functions/get-quotes').catch(() => ({ ok: false })),
      ])
      if (!pc.ok) throw new Error(pc.error || 'No se pudo cargar')
      setDatos({ anotadas: pc.anotadas || [], carpetas: pc.carpetas || [], visitas: vis.ok ? vis.visits : [], cotizaciones: cot.ok ? cot.quotes : [] })
      const faltan = [!vis.ok && 'las visitas', !cot.ok && 'las cotizaciones', pc.sinCarpetas && 'las fotos de la web (Drive)'].filter(Boolean)
      setAviso(faltan.length ? 'No se pudieron leer ' + faltan.join(', ') + ': la lista puede estar incompleta.' : '')
    } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const hoy = ahoraEnZona().fecha
  const { pendientes, hechas } = useMemo(() => datos ? armarPorCotizar({ ...datos, hoy }) : { pendientes: [], hechas: [] }, [datos, hoy])
  const cuenta = o => pendientes.filter(p => o === 'todas' || p.origen === o).length
  const lista = (verHechas ? hechas.slice(0, 60) : pendientes).filter(p => filtro === 'todas' || p.origen === filtro)

  async function enviar(cuerpo) {
    setOcupado(true)
    try {
      const r = await apiFetch(API, { method: 'POST', body: JSON.stringify(cuerpo) })
      if (!r.ok) throw new Error(r.error || 'No se pudo guardar')
      setDatos(d => ({ ...d, anotadas: r.anotadas }))
      return r
    } catch (e) { alert(e.message); return null }
    finally { setOcupado(false) }
  }

  async function guardarForm(f) {
    const r = await enviar(f.id ? { accion: 'editar', id: f.id, item: f } : { accion: 'anotar', item: f })
    if (!r) return
    setForm(null)
    if (r.item?.yaEstaba) alert('Ese cliente ya estaba en la lista: le sumé lo que escribiste.')
  }

  function onEstado(it, estado, preguntarNumero = false) {
    let cotNum = it.origen === 'web' && estado === 'cotizada' ? it.ref : ''
    if (preguntarNumero) {
      const n = window.prompt('¿Qué N° de cotización le hiciste? (puedes dejarlo vacío)', '')
      if (n === null) return
      cotNum = n.replace(/\D/g, '')
    }
    enviar(it.id ? { accion: 'estado', id: it.id, estado, cotNum }
      : { accion: 'estado', origen: it.origen, ref: it.ref, nombre: it.nombre, telefono: it.telefono, creado: it.creado, estado, cotNum })
  }

  async function onCotizar(it) {
    if (hayBorradorSinGuardar() && !window.confirm('Hay una cotización nueva sin guardar en el cotizador. ¿Reemplazarla por la de ' + (it.nombre || 'este cliente') + '?')) return
    if (it.origen === 'visita') return navigateTo('cotizador', it.visita)
    const porCotizar = { id: it.id, origen: it.origen, ref: it.ref, nombre: it.nombre, telefono: it.telefono, creado: it.creado }
    if (it.origen === 'web') {
      setOcupado(true)
      try {
        const res = await apiFetch('/.netlify/functions/get-quotes?cotNum=' + encodeURIComponent(it.ref))
        if (!res.ok || !res.quote) throw new Error(res.error || 'No se encontró la cotización')
        onAbrirEnCotizador({ ...res.quote, porCotizar })
      } catch (e) { alert('No se pudo abrir: ' + e.message) }
      finally { setOcupado(false) }
      return
    }
    onAbrirEnCotizador({ comoNueva: 'blanco', nombre: it.nombre || (it.instagram ? '@' + it.instagram : ''), email: it.email || '', telefono: it.telefono || '', direccion: it.direccion || '', porCotizar })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={styles.sectionTitle}>Por cotizar</h2>
        <span data-testid="por-cotizar-total" style={{ fontSize: 13, fontWeight: 800, color: 'white', background: pendientes.length ? C.orange : '#9CA3AF', borderRadius: 999, padding: '2px 10px' }}>{datos ? pendientes.length : '…'}</span>
        <span style={{ marginLeft: 'auto' }} />
        <button type="button" onClick={cargar} style={boton}>↻ Actualizar</button>
        {!form && <button type="button" data-testid="anotar-por-cotizar" onClick={() => setForm({ ...VACIO })} style={styles.btnPrimary}>+ Anotar una</button>}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
        Las que llegan por WhatsApp o Instagram, anótalas aquí (o con “Anotar por cotizar” en la sección WhatsApp). Las fotos o videos de la web, las visitas realizadas y las cotizaciones automáticas aparecen solas. Cada una sale de la lista cuando le haces una cotización a ese celular.
      </p>

      {form && <Formulario key={form.id || 'nueva'} inicial={form} guardando={ocupado} onGuardar={guardarForm} onCancelar={() => setForm(null)} />}
      {error && <div style={{ ...styles.card, color: '#B91C1C', marginBottom: 12 }}>No se pudo cargar: {error} <button type="button" onClick={cargar} style={boton}>Reintentar</button></div>}
      {aviso && <div style={{ fontSize: 12.5, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{aviso}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTROS.filter(f => f === 'todas' || f === filtro || cuenta(f) > 0).map(f => (
          <button key={f} type="button" onClick={() => setFiltro(f)} style={{ ...styles.tab, ...(filtro === f ? styles.tabActive : {}), padding: '5px 12px' }}>
            {f === 'todas' ? 'Todas' : ORIGEN[f].icono + ' ' + ORIGEN[f].etiqueta} <span style={{ opacity: .8 }}>({cuenta(f)})</span>
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }} />
        <button type="button" onClick={() => setVerHechas(v => !v)} aria-pressed={verHechas} style={{ ...styles.tab, ...(verHechas ? styles.tabActive : {}), padding: '5px 12px' }}>
          {verHechas ? '← Volver a las pendientes' : `Ya cotizadas (${hechas.length})`}
        </button>
      </div>

      {!datos && !error && <div style={{ fontSize: 13, color: C.textMuted }}>Cargando…</div>}
      {datos && lista.length === 0 && (
        <div style={{ ...styles.card, fontSize: 14, color: C.textSub, textAlign: 'center' }}>
          {verHechas ? 'Todavía no hay cotizadas aquí.' : '🎉 No hay nada por cotizar.'}
        </div>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {lista.map(it => (
          <Tarjeta key={it.clave} it={it} ocupado={ocupado} onCotizar={onCotizar} onEstado={onEstado}
            onEditar={x => setForm({ ...VACIO, ...x })}
            onBorrar={x => window.confirm('¿Borrar a ' + (x.nombre || 'este cliente') + ' de la lista?') && enviar({ accion: 'borrar', id: x.id })} />
        ))}
      </div>
    </div>
  )
}
