import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { disponibilidadAgenda, duracionInstalacionMin, duracionTexto } from '../netlify/functions/lib/agenda-horas.mjs'
import { totalesCotizacion } from '../netlify/functions/lib/totales.mjs'
import './reserva.css'

// /agendar?c=<N°>&t=<firma>: el cliente agenda su instalacion (sin pagar: el pago es al terminar y
// se coordina por WhatsApp). Puede sumar servicios adicionales, y si vuelve a entrar ve su hora y
// puede reagendar hasta 48 h antes. Reglas: netlify/functions/lib/agenda-horas.mjs y agenda-cliente.mjs.
const API = '/.netlify/functions/agendar'
const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const soloDigitos = s => String(s || '').replace(/\D/g, '')
const fechaUTC = iso => new Date(iso + 'T12:00:00Z')
const fmt = (iso, opciones) => new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', ...opciones }).format(fechaUTC(iso))
const fechaLarga = iso => { const t = fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1) }
const diaCorto = iso => fmt(iso, { weekday: 'short' }).replace('.', '')
const numeroMes = iso => fmt(iso, { day: 'numeric', month: 'short' }).replace('.', '')

function Encabezado({ titulo, sub }) {
  return (
    <header className="rsv-hero">
      <img src="/logo.png" alt="Repisas Don Maxi" className="rsv-logo" />
      <h1>{titulo}</h1>
      {sub && <p>{sub}</p>}
    </header>
  )
}

function WhatsApp({ whatsapp, cotNum, texto = 'Escríbenos por WhatsApp', mensaje }) {
  if (!whatsapp) return null
  const m = mensaje || `Hola, tengo una consulta sobre la instalación de la cotización N° ${cotNum}`
  return <a className="rsv-boton whatsapp" href={`https://wa.me/${soloDigitos(whatsapp)}?text=${encodeURIComponent(m)}`} target="_blank" rel="noreferrer">{texto}</a>
}

// Los servicios con lo que eligio el cliente, igual que el servidor (agenda-cliente.mjs).
function conElegidos(adicionales, servicios, elegidos) {
  const siguiente = { ...adicionales }
  for (const s of servicios) {
    const n = elegidos[s.clave] ?? s.cantidad
    siguiente[`qty_${s.clave}`] = n
    if (n > 0) siguiente[`precio_${s.clave}`] = s.precio
  }
  return siguiente
}

function Servicios({ servicios, elegidos, onCambio }) {
  return (
    <div className="agd-servicios">
      {servicios.map(s => {
        const n = elegidos[s.clave] ?? s.cantidad
        return (
          <div key={s.clave} className={`agd-servicio ${n > 0 ? 'activo' : ''}`} data-testid="servicio">
            <div className="agd-servicio-texto">
              <strong>{s.nombre}</strong>
              <span>{pesos(s.precio)}{s.porCantidad ? ' c/u' : ''} + IVA</span>
              <small>{s.descripcion}</small>
            </div>
            {s.porCantidad ? (
              <div className="agd-cantidad" role="group" aria-label={`Cantidad de ${s.nombre}`}>
                <button type="button" aria-label={`Quitar ${s.nombre}`} disabled={n <= 0} onClick={() => onCambio(s.clave, n - 1)}>−</button>
                <output>{n}</output>
                <button type="button" aria-label={`Agregar ${s.nombre}`} onClick={() => onCambio(s.clave, Math.min(20, n + 1))}>+</button>
              </div>
            ) : (
              <label className="agd-switch">
                <input type="checkbox" aria-label={s.nombre} checked={n > 0} onChange={e => onCambio(s.clave, e.target.checked ? 1 : 0)} />
                <span aria-hidden="true" />
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Semanas de lunes a viernes; cada dia con sus horas posibles.
function ElegirHora({ dias, elegida, onElegir }) {
  const semanas = useMemo(() => {
    const grupos = []
    for (const d of dias) {
      const lunes = new Date(fechaUTC(d.fecha)); lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7))
      const clave = lunes.toISOString().slice(0, 10)
      if (grupos.at(-1)?.clave !== clave) grupos.push({ clave, dias: [] })
      grupos.at(-1).dias.push(d)
    }
    return grupos
  }, [dias])
  const [i, setI] = useState(0)
  useEffect(() => { if (i >= semanas.length) setI(0) }, [semanas.length, i])
  const semana = semanas[i]
  if (!semana) return <p className="rsv-sub">No quedan horarios disponibles en las próximas semanas. Escríbenos y lo coordinamos.</p>
  return (
    <div>
      <div className="rsv-semana">
        <button type="button" className="rsv-flecha" aria-label="Semana anterior" disabled={i === 0} onClick={() => setI(i - 1)}>‹</button>
        <span>Semana del {numeroMes(semana.clave)}</span>
        <button type="button" className="rsv-flecha" aria-label="Semana siguiente" disabled={i >= semanas.length - 1} onClick={() => setI(i + 1)}>›</button>
      </div>
      {semana.dias.map(d => (
        <div key={d.fecha} className="agd-dia" data-testid="dia-agenda">
          <div className="rsv-dia-nombre">{diaCorto(d.fecha)}<small>{numeroMes(d.fecha)}</small></div>
          <div className="agd-horas">
            {d.horas.map(h => (
              <button key={h.inicio} type="button" className="agd-hora" aria-pressed={elegida?.fecha === d.fecha && elegida?.inicio === h.inicio}
                aria-label={`${fechaLarga(d.fecha)} de ${h.inicio} a ${h.fin}`} onClick={() => onElegir({ fecha: d.fecha, ...h })}>
                {h.inicio}<small>a {h.fin}</small>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AgendarApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const c = params.get('c') || '', t = params.get('t') || ''
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [elegidos, setElegidos] = useState({})
  const [hora, setHora] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(null)
  const [reagendando, setReagendando] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const r = await fetch(`${API}?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}`).then(x => x.json())
      if (!r.ok) { setError(r.error || 'No pudimos abrir tu link'); setDatos({ whatsapp: r.whatsapp }); return }
      setDatos(r)
    } catch { setError('No pudimos conectarnos. Revisa tu internet e intenta de nuevo.') }
  }, [c, t])
  useEffect(() => { cargar() }, [cargar])

  const cot = datos?.cotizacion
  const adicionales = useMemo(() => (cot ? conElegidos(cot.adicionales, cot.servicios, elegidos) : {}), [cot, elegidos])
  const duracion = cot ? duracionInstalacionMin(cot.repisas, adicionales) : 0
  const total = cot ? totalesCotizacion(cot.repisas, adicionales).total : 0
  const dias = useMemo(() => (datos?.ocupados ? disponibilidadAgenda(datos.ocupados, duracion, new Date(), datos.horario || undefined) : []), [datos, duracion])
  // Si cambia la duracion (otro servicio), la hora elegida puede dejar de calzar.
  useEffect(() => {
    if (hora && !dias.some(d => d.fecha === hora.fecha && d.horas.some(h => h.inicio === hora.inicio && h.fin === hora.fin))) setHora(null)
  }, [dias, hora])

  async function agendar() {
    setEnviando(true); setError('')
    try {
      const servicios = Object.fromEntries(cot.servicios.map(s => [s.clave, elegidos[s.clave] ?? s.cantidad]))
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c, t, fecha: hora.fecha, inicio: hora.inicio, servicios }) }).then(x => x.json())
      if (!r.ok) { setError(r.error || 'No pudimos agendar'); if (/ya no está disponible/.test(r.error || '')) { setHora(null); cargar() } return }
      setListo(r); window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { setError('No pudimos conectarnos. Intenta de nuevo.') }
    finally { setEnviando(false) }
  }

  if (!datos) return <div className="rsv"><Encabezado titulo="Agenda tu instalación" sub="Cargando…" /></div>
  if (error && !cot) return (
    <div className="rsv"><Encabezado titulo="Agenda tu instalación" />
      <section className="rsv-tarjeta rsv-estado" role="alert"><p>{error}</p><WhatsApp whatsapp={datos.whatsapp} cotNum={c} /></section>
    </div>
  )

  // Pantalla de cierre.
  if (listo) {
    const i = listo.cotizacion.instalacion
    return (
      <div className="rsv">
        <Encabezado titulo={listo.reagendada ? '¡Listo, la cambiamos!' : '¡Tu instalación quedó agendada!'} />
        <section className="rsv-tarjeta rsv-estado agd-listo" role="status" data-testid="agenda-lista">
          <div className="icono" aria-hidden="true">📅</div>
          <h2>{fechaLarga(i.fecha)}</h2>
          <p className="agd-hora-grande">De {i.inicio} a {i.fin} hrs</p>
          {listo.cotizacion.direccion && <p className="rsv-sub">📍 {listo.cotizacion.direccion}</p>}
          <ul className="agd-pasos">
            {listo.correoEnviado && <li>✉️ Te enviamos un correo con el detalle.</li>}
            <li>💬 Te escribiremos por WhatsApp para confirmar.</li>
            <li>💳 El pago es una vez terminada la instalación.</li>
          </ul>
          <button type="button" className="rsv-enlace" onClick={() => { setListo(null); setReagendando(false); setHora(null); cargar() }}>Ver mi agendamiento</button>
        </section>
      </div>
    )
  }

  if (datos.estado === 'instalada') return (
    <div className="rsv"><Encabezado titulo="Instalación realizada" />
      <section className="rsv-tarjeta rsv-estado"><div className="icono" aria-hidden="true">✅</div><p>Tu instalación de la cotización N° {cot.cotNum} ya se realizó. ¡Gracias por confiar en nosotros!</p><WhatsApp whatsapp={datos.whatsapp} cotNum={cot.cotNum} /></section>
    </div>
  )

  // Ya agendada: su hora, y reagendar si faltan 48 h o mas.
  if (datos.estado === 'agendada' && !reagendando) {
    const i = cot.instalacion
    return (
      <div className="rsv">
        <Encabezado titulo={`Hola${cot.nombre ? ' ' + cot.nombre : ''}, tu instalación está agendada`} />
        <section className="rsv-tarjeta rsv-estado" data-testid="agenda-actual">
          <div className="icono" aria-hidden="true">📅</div>
          <h2>{fechaLarga(i.fecha)}</h2>
          <p className="agd-hora-grande">De {i.inicio} a {i.fin} hrs</p>
          {cot.direccion && <p className="rsv-sub">📍 {cot.direccion}</p>}
          <p className="rsv-sub">Te escribiremos por WhatsApp para confirmar. El pago es una vez terminada la instalación.</p>
          {cot.puedeReagendar
            ? <button type="button" className="rsv-boton" onClick={() => setReagendando(true)}>Cambiar día u hora</button>
            : <><p className="agd-aviso">Faltan menos de 48 horas: para cambiarla escríbenos directamente.</p>
                <WhatsApp whatsapp={datos.whatsapp} cotNum={cot.cotNum} mensaje={`Hola, necesito cambiar la instalación de la cotización N° ${cot.cotNum}`} /></>}
        </section>
      </div>
    )
  }

  // Agendar (o reagendar).
  return (
    <div className="rsv">
      <Encabezado titulo={reagendando ? 'Cambia tu día u hora' : `Hola${cot.nombre ? ' ' + cot.nombre : ''}, agenda tu instalación`} sub={`Cotización N° ${cot.cotNum}`} />

      <section className="rsv-tarjeta">
        <h2><span className="rsv-paso">1</span> ¿Agregamos algo?</h2>
        <p className="rsv-sub">Servicios opcionales para el día de la instalación.</p>
        <Servicios servicios={cot.servicios} elegidos={elegidos} onCambio={(clave, n) => setElegidos(e => ({ ...e, [clave]: n }))} />
        <div className="rsv-resumen" data-testid="agenda-total"><span>Total con IVA</span><strong>{pesos(total)}</strong></div>
        <p className="rsv-sub" style={{ margin: '8px 0 0' }}>Se paga una vez terminada la instalación.</p>
      </section>

      <section className="rsv-tarjeta">
        <h2><span className="rsv-paso">2</span> Elige día y hora</h2>
        <p className="rsv-sub" data-testid="agenda-duracion">Tu instalación dura aprox. <strong>{duracionTexto(duracion)}</strong>. Te mostramos solo las horas que calzan con nuestra agenda.</p>
        <ElegirHora dias={dias} elegida={hora} onElegir={setHora} />
      </section>

      {hora && (
        <section className="rsv-tarjeta">
          <div className="rsv-elegido"><div><span>Tu instalación</span><strong>{fechaLarga(hora.fecha)} · {hora.inicio} a {hora.fin}</strong></div></div>
          {error && <p className="agd-aviso" role="alert">{error}</p>}
          <button type="button" className="rsv-boton" disabled={enviando} onClick={agendar}>{enviando ? 'Agendando…' : reagendando ? 'Cambiar a esta hora' : 'Agendar instalación'}</button>
        </section>
      )}
      {!hora && error && <p className="agd-aviso" role="alert">{error}</p>}
      {reagendando && <button type="button" className="rsv-enlace" onClick={() => setReagendando(false)}>Mantener mi hora actual</button>}
      {datos.whatsapp && <p className="rsv-pie">¿Dudas? Escríbenos por <a href={`https://wa.me/${soloDigitos(datos.whatsapp)}?text=${encodeURIComponent(`Hola, tengo una consulta sobre la instalación de la cotización N° ${cot.cotNum}`)}`} target="_blank" rel="noreferrer">WhatsApp</a></p>}
    </div>
  )
}
