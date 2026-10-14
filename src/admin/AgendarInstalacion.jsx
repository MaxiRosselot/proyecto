import React, { useMemo, useState } from 'react'
import { C, apiFetch, fmt, styles } from './utils.js'
import { SERVICIOS } from '../../netlify/functions/lib/marca.mjs'
import { totalesCotizacion } from '../../netlify/functions/lib/totales.mjs'
import { duracion, fechaLarga, linkWhatsappInstalacion } from './whatsappInstalacion.js'

const ENDPOINT = '/.netlify/functions/instalacion'
const correoValido = email => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/.test(String(email || '').trim())
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())

const campo = { ...styles.input, padding: '8px 10px', fontSize: 13 }
const etiqueta = { ...styles.detailLabel, display: 'block', marginBottom: 4 }

// Formulario para agendar (o reagendar) la instalacion de una cotizacion.
export function AgendarInstalacion({ quote, onListo, onCancelar }) {
  const previa = quote.instalacion
  const [adicionales, setAdicionales] = useState(() => Object.fromEntries(SERVICIOS.flatMap(([clave, , lista]) => [
    [`qty_${clave}`, Number(quote.adicionales?.[`qty_${clave}`]) || 0],
    [`precio_${clave}`, Number(quote.adicionales?.[`precio_${clave}`] ?? lista) || 0],
  ])))
  const [fecha, setFecha] = useState(previa?.fecha || '')
  const [inicio, setInicio] = useState(previa?.inicio || '09:00')
  const [fin, setFin] = useState(previa?.fin || '13:00')
  const [email, setEmail] = useState(quote.email || '')
  const [invitar, setInvitar] = useState(true)
  const [notas, setNotas] = useState(previa?.notas || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const totales = useMemo(() => totalesCotizacion(quote.repisas || [], adicionales), [quote.repisas, adicionales])
  const horarioOk = fecha && inicio && fin && fin > inicio
  const emailOk = !email.trim() || correoValido(email)
  const numero = (clave, valor) => setAdicionales(a => ({ ...a, [clave]: Math.max(0, Math.round(Number(valor) || 0)) }))

  async function agendar() {
    if (!horarioOk || !emailOk || guardando) return
    setGuardando(true); setError('')
    try {
      const r = await apiFetch(ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ accion: 'agendar', cotNum: quote.cotNum, fecha, inicio, fin, adicionales, email: email.trim(), invitar, notas }),
      })
      if (!r.ok) throw new Error(r.error || 'No se pudo agendar')
      onListo({ status: 'confirmada', motivoRechazo: '', adicionales, subtotal: r.totales.subtotal, iva: r.totales.iva, total: r.totales.total, instalacion: r.instalacion, email: r.email || quote.email })
    } catch (e) { setError(e.message) }
    finally { setGuardando(false) }
  }

  return (
    <div style={{ marginTop: 14, padding: 16, borderRadius: 12, border: '1.5px solid ' + C.green + '55', background: C.green + '08' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>{previa ? 'Reagendar instalación' : 'Agendar instalación'}</div>

      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .8, marginBottom: 6 }}>Servicios adicionales</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 100px 84px', gap: '6px 8px', alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
        {['Servicio', 'Cant.', 'Precio c/u', 'Total'].map(h => <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', textAlign: h === 'Servicio' ? 'left' : 'center' }}>{h}</span>)}
        {SERVICIOS.map(([clave, nombre]) => (
          <React.Fragment key={clave}>
            <span style={{ color: C.textSub }}>{nombre}</span>
            <input type="number" min="0" aria-label={`Cantidad de ${nombre}`} value={adicionales[`qty_${clave}`]} onChange={e => numero(`qty_${clave}`, e.target.value)} style={{ ...campo, textAlign: 'center', padding: '6px' }} />
            <input type="number" min="0" step="1000" aria-label={`Precio de ${nombre}`} value={adicionales[`precio_${clave}`]} onChange={e => numero(`precio_${clave}`, e.target.value)} style={{ ...campo, textAlign: 'center', padding: '6px' }} />
            <span style={{ textAlign: 'center', fontWeight: adicionales[`qty_${clave}`] ? 700 : 400, color: adicionales[`qty_${clave}`] ? C.orangeDark : C.textMuted }}>{fmt(adicionales[`qty_${clave}`] * adicionales[`precio_${clave}`])}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 13, color: C.textSub, marginBottom: 14 }}>
        <span>Repisas {fmt(totales.repisas)}</span>
        <span>Adicionales {fmt(totales.adicionales)}</span>
        <span>IVA {fmt(totales.iva)}</span>
        <strong style={{ color: C.orangeDark }} data-testid="total-instalacion">Total {fmt(totales.total)}</strong>
        {totales.total !== Number(quote.total) && <span style={{ color: C.textMuted }}>(antes {fmt(quote.total)})</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 6 }}>
        <label><span style={etiqueta}>Día</span><input type="date" aria-label="Día de la instalación" min={hoy()} value={fecha} onChange={e => setFecha(e.target.value)} style={campo} /></label>
        <label><span style={etiqueta}>Inicio</span><input type="time" aria-label="Hora de inicio" step="900" value={inicio} onChange={e => setInicio(e.target.value)} style={campo} /></label>
        <label><span style={etiqueta}>Término</span><input type="time" aria-label="Hora de término" step="900" value={fin} onChange={e => setFin(e.target.value)} style={campo} /></label>
      </div>
      <div style={{ fontSize: 12, color: horarioOk || !fecha ? C.textMuted : C.red, marginBottom: 12 }}>
        {!fecha ? 'Elige el día.' : fin > inicio ? `${fechaLarga(fecha)} · ${inicio} a ${fin} · ${duracion(inicio, fin)}` : 'La hora de término debe ser después de la de inicio.'}
      </div>

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
        <button onClick={agendar} disabled={!horarioOk || !emailOk || guardando}
          style={{ ...styles.btnPrimary, background: C.green, boxShadow: 'none', opacity: !horarioOk || !emailOk || guardando ? .55 : 1 }}>
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
        <a href={linkWhatsappInstalacion(quote, inst)} target="_blank" rel="noreferrer" style={{ ...boton, background: '#25D366', borderColor: '#25D366', color: 'white' }}>Avisar por WhatsApp</a>
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
