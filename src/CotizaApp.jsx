import React, { useEffect, useRef, useState } from 'react'
import './cotiza.css'

// /cotiza — el cliente arma sus repisas y se lleva la cotizacion por correo.
// El configurador va en un iframe (/embed?mode=cliente del sitio Repisas 3D). Esta pagina le pasa
// la tabla de precios, muestra el total, pide los datos de contacto y envia todo a cotizacion-web,
// que recalcula los precios en el servidor.
const URL_3D = (import.meta.env.VITE_REPISAS_3D_URL || window.location.origin).replace(/\/$/, '')
const ORIGEN_3D = new URL(URL_3D).origin
const PROTOCOLO = '1'
const ENDPOINT = '/.netlify/functions/cotizacion-web'
const WHATSAPP = '+56951020367'

const pesos = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const soloDigitos = s => String(s).replace(/[^0-9]/g, '')
const fechaHora = iso => new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }).format(new Date(iso))

function urlConfigurador() {
  const url = new URL('/embed', URL_3D)
  url.searchParams.set('mode', 'cliente')
  url.searchParams.set('parentOrigin', window.location.origin)
  url.searchParams.set('protocolVersion', PROTOCOLO)
  return url.toString()
}

function bytesADataUrl(buffer) {
  const bytes = new Uint8Array(buffer)
  let binario = ''
  for (let i = 0; i < bytes.length; i += 8192) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192))
  return 'data:image/png;base64,' + btoa(binario)
}

export default function CotizaApp() {
  const frameRef = useRef(null)
  const [alto, setAlto] = useState(640)
  const [precios, setPrecios] = useState(null)       // null = cargando
  const [errorPrecios, setErrorPrecios] = useState('')
  const [estado3d, setEstado3d] = useState(null)      // ultimo repisas:cliente-cambio
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', direccion: '', sitio: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)
  const preciosRef = useRef(null)
  preciosRef.current = precios

  useEffect(() => { document.title = 'Cotiza tus repisas — Repisas Don Maxi' }, [])

  useEffect(() => {
    fetch(ENDPOINT)
      .then(r => r.json())
      .then(d => { if (d?.ok && Array.isArray(d.tabla)) setPrecios(d.tabla); else throw new Error() })
      .catch(() => setErrorPrecios('No pudimos cargar los precios. Puedes armar tus repisas igual, o intentar de nuevo en un rato.'))
  }, [])

  const enviarAl3d = (type, payload, requestId = crypto.randomUUID()) =>
    frameRef.current?.contentWindow?.postMessage({ type, version: PROTOCOLO, requestId, payload }, ORIGEN_3D)

  // El configurador avisa cuando esta listo; ahi recien le sirve la tabla.
  useEffect(() => { if (precios) enviarAl3d('repisas:cliente-precios', { tabla: precios }) }, [precios])

  useEffect(() => {
    function recibir(event) {
      if (event.origin !== ORIGEN_3D || event.source !== frameRef.current?.contentWindow) return
      const msg = event.data
      if (msg?.version !== PROTOCOLO) return
      if (msg.type === 'repisas:ready' && preciosRef.current) enviarAl3d('repisas:cliente-precios', { tabla: preciosRef.current })
      if (msg.type === 'repisas:cliente-alto' && msg.payload?.alto > 0) setAlto(Math.ceil(msg.payload.alto) + 8)
      if (msg.type === 'repisas:cliente-cambio') setEstado3d(msg.payload)
      // Al pasar de paso, el contenido cambia de alto: se vuelve al inicio del configurador.
      if (msg.type === 'repisas:cliente-paso') frameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    window.addEventListener('message', recibir)
    return () => window.removeEventListener('message', recibir)
  }, [])

  // Las dos vistas del PDF, con la proporcion de la planta como en el cotizador del admin.
  function pedirVistas() {
    const sala = estado3d?.project?.room
    const proporcion = sala ? Math.min(.88, Math.max(.5, sala.backWallCm / Math.min(sala.leftWallCm, sala.rightWallCm))) : .55
    const views = [{ view: 'isometric', width: 860, height: 1080 }, { view: 'top', width: Math.round(1080 * proporcion), height: 1080 }]
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const reloj = setTimeout(() => terminar(new Error('El dibujo 3D tardó demasiado. Intenta de nuevo.')), 40000)
      function terminar(err, valor) { clearTimeout(reloj); window.removeEventListener('message', escuchar); err ? reject(err) : resolve(valor) }
      function escuchar(event) {
        const msg = event.data
        if (event.origin !== ORIGEN_3D || msg?.requestId !== requestId) return
        if (msg.type === 'repisas:export-complete' && msg.payload?.images) {
          terminar(null, Object.fromEntries(msg.payload.images.map(i => [i.view, bytesADataUrl(i.bytes)])))
        }
        if (msg.type === 'repisas:error') terminar(new Error(msg.payload?.message || 'No se pudo dibujar el modelo'))
      }
      window.addEventListener('message', escuchar)
      enviarAl3d('repisas:export-request', { kind: 'quote-views', views }, requestId)
    })
  }

  const listo = Boolean(estado3d?.listo)
  const datosOk = form.nombre.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(form.email.trim()) && form.telefono.replace(/\D/g, '').length >= 8

  async function enviar(e) {
    e.preventDefault()
    if (!listo || !datosOk || enviando) return
    setEnviando(true); setError('')
    try {
      const vistas = await pedirVistas()
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente: { nombre: form.nombre, email: form.email, telefono: form.telefono, direccion: form.direccion },
          sitio: form.sitio,
          modulos: estado3d.modulos,
          proyecto3d: estado3d.project,
          vistas,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'No pudimos enviar la cotización.')
      setResultado({ ...data, email: form.email.trim() })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) { setError(err.message) }
    finally { setEnviando(false) }
  }

  // El cliente ya tiene sus medidas: la pantalla final empuja a cerrar ahora, con la oferta
  // de 48 horas, el pago en linea, la transferencia o el WhatsApp.
  if (resultado) {
    const { cotNum, total, oferta, pago, whatsapp } = resultado
    const mensaje = `Hola, quiero aceptar la cotización N° ${cotNum} por ${pesos(total)}`
    return (
      <div className="ctz">
        <Encabezado titulo="¡Tu cotización está lista!" />
        <section className="ctz-tarjeta ctz-listo" role="status">
          <p className="ctz-listo-numero">Cotización N° {cotNum}</p>
          <p className="ctz-listo-total">{pesos(total)} <small>con IVA</small></p>
          {resultado.correoEnviado
            ? <p className="ctz-nota">Te enviamos el PDF a <strong>{resultado.email}</strong>.</p>
            : <p className="ctz-nota">No pudimos enviarla a tu correo, pero quedó registrada: te escribimos por WhatsApp.</p>}

          <div className="ctz-oferta">
            <strong>{oferta.descuento}% de descuento adicional</strong>
            <span>si la aceptas antes del {fechaHora(oferta.hasta)}</span>
          </div>

          <div className="ctz-acciones">
            <a className="ctz-boton" href={pago.link} target="_blank" rel="noreferrer">Pagar y reservar instalación</a>
            <a className="ctz-boton whatsapp" href={`https://wa.me/${soloDigitos(whatsapp)}?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noreferrer">Aceptar por WhatsApp</a>
          </div>
          <p className="ctz-nota">Puedes abonar el 50% para reservar y pagar el resto al terminar. Débito, crédito (hasta 3 cuotas sin interés) o transferencia.</p>

          <details className="ctz-transferencia">
            <summary>Pagar por transferencia</summary>
            <dl>
              <dt>Nombre</dt><dd>{pago.razonSocial}</dd>
              <dt>RUT</dt><dd>{pago.rut}</dd>
              <dt>Banco</dt><dd>{pago.banco}</dd>
              <dt>Cuenta {pago.tipoCuenta}</dt><dd>{pago.numeroCuenta}</dd>
              <dt>Asunto</dt><dd>Cotización N° {cotNum}</dd>
            </dl>
          </details>

          <ul className="ctz-confianza">
            <li>Garantía de 5 años en estructura e instalación</li>
            <li>Antes de fabricar revisamos tus medidas por WhatsApp</li>
          </ul>
          <button type="button" className="ctz-enlace" onClick={() => { setResultado(null); setForm(f => ({ ...f, sitio: '' })) }}>Probar otra distribución</button>
        </section>
        <Pie />
      </div>
    )
  }

  return (
    <div className="ctz">
      <Encabezado />

      <section className="ctz-tarjeta ctz-configurador">
        {errorPrecios && <p className="ctz-aviso" role="alert">{errorPrecios}</p>}
        <iframe ref={frameRef} src={urlConfigurador()} title="Arma tus repisas" style={{ height: alto }} />
      </section>

      <section className="ctz-tarjeta" aria-labelledby="ctz-titulo-envio" id="ctz-envio">
        <h2 id="ctz-titulo-envio">Recibe tu cotización por correo</h2>
        {!listo && <p className="ctz-nota">Primero arma tus repisas arriba: ingresa las medidas y pasa a "Tus repisas".</p>}
        <form onSubmit={enviar} noValidate className="ctz-form">
          <label>Nombre<input autoComplete="name" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required /></label>
          <label>Correo<input type="email" autoComplete="email" inputMode="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Teléfono<input type="tel" autoComplete="tel" inputMode="tel" placeholder="+56 9 1234 5678" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} required /></label>
          <label>Dirección o comuna <small>(opcional)</small><input autoComplete="street-address" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} /></label>
          {/* Trampa para robots: las personas no lo ven. */}
          <input className="ctz-trampa" tabIndex={-1} autoComplete="off" aria-hidden="true" name="sitio" value={form.sitio} onChange={e => setForm({ ...form, sitio: e.target.value })} />
          {error && <p className="ctz-error" role="alert">{error}</p>}
          <button className="ctz-boton" type="submit" disabled={!listo || !datosOk || enviando}>
            {enviando ? 'Preparando tu cotización…' : `Enviar cotización${listo ? ' · ' + pesos(estado3d.total) : ''}`}
          </button>
          <p className="ctz-nota">Te llega un PDF con el detalle por módulo y el dibujo de tu bodega, y puedes reservar tu instalación al tiro.</p>
        </form>
      </section>

      {listo && (
        <div className="ctz-barra" aria-hidden="true">
          <div><small>Total estimado</small><strong>{pesos(estado3d.total)}</strong></div>
          <a href="#ctz-envio" className="ctz-boton">Recibir por correo</a>
        </div>
      )}
      <Pie />
    </div>
  )
}

function Encabezado({ titulo = 'Cotiza tus repisas' }) {
  return (
    <header className="ctz-hero">
      <img src="/logo.png" alt="Repisas Don Maxi" className="ctz-logo" />
      <h1>{titulo}</h1>
      {titulo === 'Cotiza tus repisas' && <p>Ingresa las medidas de tu bodega, prueba distribuciones y mira el valor al instante.</p>}
    </header>
  )
}

function Pie() {
  return (
    <footer className="ctz-pie">
      ¿Dudas? Escríbenos por <a href={`https://wa.me/${soloDigitos(WHATSAPP)}`}>WhatsApp</a>
    </footer>
  )
}
