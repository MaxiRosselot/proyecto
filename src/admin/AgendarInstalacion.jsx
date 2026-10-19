import React, { useEffect, useMemo, useState } from 'react'
import { C, apiFetch, fmt, styles } from './utils.js'
import { OFERTA, SERVICIOS } from '../../netlify/functions/lib/marca.mjs'
import { DESCUENTO_MAX, nombreServicio, totalesCotizacion } from '../../netlify/functions/lib/totales.mjs'
import { duracion, fechaLarga, mensajeInstalacionDe } from './whatsappInstalacion.js'
import CopiarMensaje from './CopiarMensaje.jsx'

const ENDPOINT = '/.netlify/functions/instalacion'
const correoValido = email => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/.test(String(email || '').trim())
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())

const campo = { ...styles.input, padding: '8px 10px', fontSize: 13 }
const etiqueta = { ...styles.detailLabel, display: 'block', marginBottom: 4 }
const titulo = { fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .8, marginBottom: 6 }
const encabezado = h => <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', textAlign: ['Servicio', 'Repisa'].includes(h) ? 'left' : 'center' }}>{h}</span>
const metros = n => (Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(2))

// Numero entero sin ceros adelante ("020" se leia como 20). Al tocarlo se selecciona todo,
// asi lo que se escribe reemplaza el valor en vez de sumarse a el.
function Numero({ valor, onCambio, etiqueta: aria, ancho }) {
  return (
    <input type="text" inputMode="numeric" aria-label={aria} value={String(valor ?? 0)}
      onFocus={e => e.target.select()}
      onChange={e => onCambio(Math.min(1e8, Number(e.target.value.replace(/\D/g, '')) || 0))}
      style={{ ...campo, textAlign: 'center', padding: '6px', ...(ancho ? { width: ancho } : {}) }} />
  )
}

const nombreRepisa = r => `${r.kind === 'rack' ? r.label || 'Rack' : r.colgador ? 'Repisa con colgador' : 'Repisa'} · ${metros(r.largo)} × ${metros(r.prof)} × ${metros(r.alto)} m${r.niveles ? ` · ${r.niveles} niveles` : ''}`

// Formulario para agendar (o reagendar) la instalacion de una cotizacion.
export function AgendarInstalacion({ quote, onListo, onCancelar }) {
  const previa = quote.instalacion
  // Parte de lo que ya tiene la cotizacion: cantidades, precios, nombres editados y descuento.
  const [adicionales, setAdicionales] = useState(() => ({
    ...quote.adicionales,
    ...Object.fromEntries(SERVICIOS.flatMap(([clave, , lista]) => [
      [`qty_${clave}`, Number(quote.adicionales?.[`qty_${clave}`]) || 0],
      [`precio_${clave}`, Number(quote.adicionales?.[`precio_${clave}`] ?? lista) || 0],
    ])),
  }))
  // Cada repisa de la cotizacion, con su cantidad y precio editables (0 = no va).
  const [repisas, setRepisas] = useState(() => (quote.repisas || []).map(r => ({ ...r, unidades: Number(r.unidades ?? 1) || 0, valor: Number(r.valor) || 0 })))
  const [fecha, setFecha] = useState(previa?.fecha || '')
  const [inicio, setInicio] = useState(previa?.inicio || '09:00')
  const [fin, setFin] = useState(previa?.fin || '13:00')
  const [email, setEmail] = useState(quote.email || '')
  const [invitar, setInvitar] = useState(true)
  const [notas, setNotas] = useState(previa?.notas || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const totales = useMemo(() => totalesCotizacion(repisas, adicionales), [repisas, adicionales])
  const repisasCambiadas = repisas.some((r, i) => r.unidades !== (Number(quote.repisas[i].unidades ?? 1) || 0) || r.valor !== (Number(quote.repisas[i].valor) || 0))
  const cambiarRepisa = (i, campo, valor) => setRepisas(prev => prev.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)))

  // Lo que ya hay ese dia en el calendario, para no topar horarios.
  const [delDia, setDelDia] = useState([])
  useEffect(() => {
    if (!fecha) { setDelDia([]); return }
    let vigente = true
    apiFetch(`/.netlify/functions/calendario?desde=${fecha}&hasta=${fecha}`)
      .then(r => vigente && setDelDia(r.ok ? r.eventos.filter(e => e.id !== previa?.eventId) : []))
      .catch(() => {})
    return () => { vigente = false }
  }, [fecha])
  const aMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b }
  const horarioOk = fecha && inicio && fin && fin > inicio
  const choques = horarioOk ? delDia.filter(e => e.todoElDia || (e.minutoInicio < aMin(fin) && e.minutoFin > aMin(inicio))) : []
  const emailOk = !email.trim() || correoValido(email)
  const numero = (clave, valor) => setAdicionales(a => ({ ...a, [clave]: Math.max(0, Math.round(Number(valor) || 0)) }))
  const montoOk = totales.bruto > 0
  const descuento = valor => setAdicionales(({ descuento_pct: _, ...resto }) => {
    const n = Math.min(DESCUENTO_MAX, Math.max(0, Math.round(Number(valor) || 0)))
    return n ? { ...resto, descuento_pct: n } : resto
  })

  async function agendar() {
    if (!horarioOk || !emailOk || !montoOk || guardando) return
    setGuardando(true); setError('')
    try {
      const r = await apiFetch(ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ accion: 'agendar', cotNum: quote.cotNum, fecha, inicio, fin, adicionales, email: email.trim(), invitar, notas,
          ...(repisasCambiadas ? { repisas: repisas.map(r => ({ unidades: r.unidades, valor: r.valor })) } : {}) }),
      })
      if (!r.ok) throw new Error(r.error || 'No se pudo agendar')
      onListo({ status: 'confirmada', motivoRechazo: '', adicionales, ...(repisasCambiadas ? { repisas: r.repisas } : {}), subtotal: r.totales.subtotal, iva: r.totales.iva, total: r.totales.total, instalacion: r.instalacion, email: r.email || quote.email })
    } catch (e) { setError(e.message) }
    finally { setGuardando(false) }
  }

  return (
    <div style={{ marginTop: 14, padding: 16, borderRadius: 12, border: '1.5px solid ' + C.green + '55', background: C.green + '08' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>{previa ? 'Reagendar instalación' : 'Agendar instalación'}</div>

      <div style={titulo}>Repisas</div>
      <div data-testid="repisas-agendar" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 100px 84px', gap: '6px 8px', alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
        {['Repisa', 'Cant.', 'Precio c/u', 'Total'].map(encabezado)}
        {repisas.map((r, i) => (
          <React.Fragment key={i}>
            <span style={{ color: r.unidades ? C.textSub : C.textMuted, textDecoration: r.unidades ? 'none' : 'line-through' }}>{nombreRepisa(r)}</span>
            <Numero etiqueta={`Cantidad de la repisa ${i + 1}`} valor={r.unidades} onCambio={v => cambiarRepisa(i, 'unidades', Math.min(999, v))} />
            <Numero etiqueta={`Precio de la repisa ${i + 1}`} valor={r.valor} onCambio={v => cambiarRepisa(i, 'valor', v)} />
            <span style={{ textAlign: 'center', fontWeight: 700, color: r.unidades ? C.orangeDark : C.textMuted }}>{r.unidades ? fmt(r.unidades * r.valor) : 'no va'}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>Pon 0 en las repisas que el cliente no va a llevar.{repisasCambiadas ? ' Al agendar se guardan estos valores en la cotización.' : ''}</div>

      <div style={titulo}>Servicios adicionales</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 100px 84px', gap: '6px 8px', alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
        {['Servicio', 'Cant.', 'Precio c/u', 'Total'].map(encabezado)}
        {SERVICIOS.map(([clave]) => [clave, nombreServicio(adicionales, clave)]).map(([clave, nombre]) => (
          <React.Fragment key={clave}>
            <span style={{ color: C.textSub }}>{nombre}</span>
            <Numero etiqueta={`Cantidad de ${nombre}`} valor={adicionales[`qty_${clave}`]} onCambio={v => numero(`qty_${clave}`, Math.min(999, v))} />
            <Numero etiqueta={`Precio de ${nombre}`} valor={adicionales[`precio_${clave}`]} onCambio={v => numero(`precio_${clave}`, v)} />
            <span style={{ textAlign: 'center', fontWeight: adicionales[`qty_${clave}`] ? 700 : 400, color: adicionales[`qty_${clave}`] ? C.orangeDark : C.textMuted }}>{fmt(adicionales[`qty_${clave}`] * adicionales[`precio_${clave}`])}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ ...etiqueta, marginBottom: 0 }}>Descuento</span>
        <Numero etiqueta="Descuento en porcentaje" valor={totales.descuentoPct} onCambio={descuento} ancho={70} />
        <span style={{ fontSize: 13, color: C.textSub }}>%</span>
        <button type="button" onClick={() => descuento(totales.descuentoPct === OFERTA.descuento ? 0 : OFERTA.descuento)} aria-pressed={totales.descuentoPct === OFERTA.descuento}
          style={{ ...styles.btnSecondary, fontSize: 12, padding: '5px 10px', ...(totales.descuentoPct === OFERTA.descuento ? { borderColor: C.green, color: C.green, background: C.green + '12' } : {}) }}>
          Transferencia · {OFERTA.descuento}%
        </button>
      </div>
      {/* La cuenta completa, en columna: de las repisas al total con IVA. */}
      <div data-testid="resumen-montos" style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 24px', width: 'fit-content', minWidth: 260, marginLeft: 'auto', fontSize: 13, color: C.textSub, padding: '10px 14px', borderRadius: 10, background: 'white', border: '1px solid ' + C.border, marginBottom: 14 }}>
        <span>Repisas</span><span style={{ textAlign: 'right' }}>{fmt(totales.repisas)}</span>
        <span>Servicios adicionales</span><span style={{ textAlign: 'right' }}>{fmt(totales.adicionales)}</span>
        {totales.descuento > 0 && <><span style={{ color: C.green }}>Descuento {totales.descuentoPct}%</span><span style={{ textAlign: 'right', color: C.green, fontWeight: 700 }}>-{fmt(totales.descuento)}</span></>}
        <span>Neto</span><span style={{ textAlign: 'right' }}>{fmt(totales.subtotal)}</span>
        <span>IVA (19%)</span><span style={{ textAlign: 'right' }}>{fmt(totales.iva)}</span>
        <strong style={{ color: C.text, borderTop: '1px solid ' + C.border, paddingTop: 4 }}>Total</strong>
        <strong style={{ color: C.orangeDark, textAlign: 'right', borderTop: '1px solid ' + C.border, paddingTop: 4 }} data-testid="total-instalacion">{fmt(totales.total)}</strong>
        {totales.total !== Number(quote.total) && <span style={{ gridColumn: '1 / -1', textAlign: 'right', color: C.textMuted, fontSize: 12 }}>Antes: {fmt(quote.total)}</span>}
        {!montoOk && <span style={{ gridColumn: '1 / -1', textAlign: 'right', color: C.red, fontSize: 12 }}>Deja al menos una repisa o un servicio.</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 6 }}>
        <label><span style={etiqueta}>Día</span><input type="date" aria-label="Día de la instalación" min={hoy()} value={fecha} onChange={e => setFecha(e.target.value)} style={campo} /></label>
        <label><span style={etiqueta}>Inicio</span><input type="time" aria-label="Hora de inicio" step="900" value={inicio} onChange={e => setInicio(e.target.value)} style={campo} /></label>
        <label><span style={etiqueta}>Término</span><input type="time" aria-label="Hora de término" step="900" value={fin} onChange={e => setFin(e.target.value)} style={campo} /></label>
      </div>
      <div style={{ fontSize: 12, color: horarioOk || !fecha ? C.textMuted : C.red, marginBottom: 12 }}>
        {!fecha ? 'Elige el día.' : fin > inicio ? `${fechaLarga(fecha)} · ${inicio} a ${fin} · ${duracion(inicio, fin)}` : 'La hora de término debe ser después de la de inicio.'}
      </div>
      {fecha && delDia.length > 0 && (
        <div data-testid="agenda-del-dia" style={{ fontSize: 12, marginTop: -6, marginBottom: 12, padding: '8px 10px', borderRadius: 8,
          background: choques.length ? '#FEF2F2' : C.bg, color: choques.length ? '#B91C1C' : C.textSub }}>
          <strong>{choques.length ? '⚠ Se cruza con: ' : 'Ese día ya tienes: '}</strong>
          {(choques.length ? choques : delDia).map(e => `${e.todoElDia ? 'todo el día' : e.inicio + '–' + e.fin} ${e.cliente || e.titulo}`).join(' · ')}
        </div>
      )}

      <label style={{ display: 'block', marginBottom: 6 }}>
        <span style={etiqueta}>Correo del cliente</span>
        <input type="email" aria-label="Correo del cliente" placeholder="Si lo tienes, para enviarle la invitación" value={email} onChange={e => setEmail(e.target.value)} style={{ ...campo, borderColor: emailOk ? C.border : C.red }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSub, marginBottom: 12 }}>
        <input type="checkbox" checked={invitar && correoValido(email)} disabled={!correoValido(email)} onChange={e => setInvitar(e.target.checked)} style={{ width: 16, height: 16, margin: 0, flex: "none" }} />
        <span>{correoValido(email) ? 'Enviarle la invitación de Calendar' : 'Sin correo: puedes invitarlo después de agendar'}</span>
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={etiqueta}>Notas (opcional)</span>
        <textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: estacionamiento por calle lateral" style={{ ...campo, resize: 'vertical' }} />
      </label>

      {error && <div style={{ ...styles.errorBox, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={agendar} disabled={!horarioOk || !emailOk || !montoOk || guardando}
          style={{ ...styles.btnPrimary, background: C.green, boxShadow: 'none', opacity: !horarioOk || !emailOk || !montoOk || guardando ? .55 : 1 }}>
          {guardando ? 'Agendando...' : previa ? 'Guardar nuevo horario' : 'Agendar instalación'}
        </button>
        <button onClick={onCancelar} style={styles.btnSecondary}>Cancelar</button>
      </div>
    </div>
  )
}

// Resumen de la instalacion agendada, con los atajos para avisarle al cliente.
export function ResumenInstalacion({ quote, onReagendar, onInvitado }) {
  const inst = quote.instalacion
  const [correo, setCorreo] = useState(quote.email || '')
  const [invitando, setInvitando] = useState(false)
  const [error, setError] = useState('')

  async function invitar() {
    if (!correoValido(correo) || invitando) return
    setInvitando(true); setError('')
    try {
      const r = await apiFetch(ENDPOINT, { method: 'POST', body: JSON.stringify({ accion: 'invitar', cotNum: quote.cotNum, email: correo.trim() }) })
      if (!r.ok) throw new Error(r.error || 'No se pudo invitar')
      onInvitado({ instalacion: r.instalacion, email: r.email })
    } catch (e) { setError(e.message) }
    finally { setInvitando(false) }
  }

  const boton = { ...styles.btnSecondary, fontSize: 12, padding: '7px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }
  return (
    <div data-testid="instalacion-agendada" style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: C.green + '0F', border: '1px solid ' + C.green + '40' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.green, textTransform: 'uppercase', letterSpacing: .8 }}>Instalación agendada</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '4px 0 2px' }}>{fechaLarga(inst.fecha)} · {inst.inicio} a {inst.fin}</div>
      <div style={{ fontSize: 12.5, color: C.textSub, marginBottom: 10 }}>
        Duración {duracion(inst.inicio, inst.fin)} · {inst.invitado ? `Invitación enviada a ${inst.invitado}` : 'Sin invitación por correo'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <CopiarMensaje texto={mensajeInstalacionDe(quote, inst)} etiqueta="📋 Copiar mensaje de agendamiento" />
        {inst.link && <a href={inst.link} target="_blank" rel="noreferrer" style={boton}>Ver en Calendar</a>}
        <button onClick={onReagendar} style={boton}>Reagendar</button>
      </div>
      {!inst.invitado && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <input type="email" aria-label="Correo para invitar" placeholder="Correo del cliente" value={correo} onChange={e => setCorreo(e.target.value)}
            style={{ ...campo, width: 240, borderColor: !correo || correoValido(correo) ? C.border : C.red }} />
          <button onClick={invitar} disabled={!correoValido(correo) || invitando} style={{ ...boton, opacity: !correoValido(correo) || invitando ? .55 : 1 }}>
            {invitando ? 'Invitando...' : 'Invitar por correo'}
          </button>
        </div>
      )}
      {error && <div style={{ ...styles.errorBox, marginTop: 10, marginBottom: 0 }}>{error}</div>}
    </div>
  )
}
