import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MARCA, WHATSAPP } from '../../netlify/functions/lib/marca.mjs'
import { CATEGORIAS_GALERIA } from '../../netlify/functions/lib/sitio.mjs'
import { CIFRAS, PASOS, PREGUNTAS, RESENAS, SERVICIOS_SITIO, VENTAJAS } from './contenido.js'
import { FOTOS_EJEMPLO } from './fotos-ejemplo.js'
import EnviarFotos from './EnviarFotos.jsx'
import './sitio.css'

// El sitio publico (repisasdonmaxi.cl): Inicio, Cotizar, Fotos, Preguntas y Contacto. Navega sin
// recargar entre estas paginas; /cotiza (cotizacion automatica) y /visita son apps aparte.
const API = '/.netlify/functions/sitio'
const soloDigitos = s => String(s || '').replace(/\D/g, '')
const linkWhatsApp = (texto = 'Hola, quiero cotizar repisas para mi bodega') => `https://wa.me/${soloDigitos(WHATSAPP)}?text=${encodeURIComponent(texto)}`

export const RUTAS_SITIO = {
  '/': { titulo: 'Repisas Don Maxi · Repisas de madera a medida para tu bodega', descripcion: 'Diseñamos, fabricamos e instalamos repisas de madera a medida para bodegas, closets y empresas. Cotiza en línea en minutos y agenda tu instalación.' },
  '/cotizar': { titulo: 'Cotizar · Repisas Don Maxi', descripcion: 'Cotiza tus repisas a medida: cotización automática en línea, enviándonos fotos o con una visita.' },
  '/cotizar/fotos': { titulo: 'Cotiza con fotos · Repisas Don Maxi', descripcion: 'Envíanos fotos o un video de tu bodega y te enviamos la cotización por correo.' },
  '/fotos': { titulo: 'Fotos de nuestros trabajos · Repisas Don Maxi', descripcion: 'Bodegas, closets, empresas y contenedores con repisas Don Maxi.' },
  '/preguntas': { titulo: 'Preguntas frecuentes · Repisas Don Maxi', descripcion: 'Cómo cotizar, cuánto demora la instalación, formas de pago, materiales y garantía.' },
  '/contacto': { titulo: 'Contacto · Repisas Don Maxi', descripcion: 'Escríbenos por WhatsApp o déjanos un mensaje.' },
}
const normalizar = p => (p.length > 1 ? p.replace(/\/+$/, '') : p)

function useRuta() {
  const [ruta, setRuta] = useState(() => normalizar(window.location.pathname))
  useEffect(() => {
    const alVolver = () => setRuta(normalizar(window.location.pathname))
    window.addEventListener('popstate', alVolver)
    return () => window.removeEventListener('popstate', alVolver)
  }, [])
  const ir = useCallback(destino => {
    const [camino, ancla] = destino.split('#')
    if (normalizar(camino) !== normalizar(window.location.pathname)) window.history.pushState({}, '', destino)
    setRuta(normalizar(camino))
    requestAnimationFrame(() => {
      const el = ancla && document.getElementById(ancla)
      el ? el.scrollIntoView({ behavior: 'smooth' }) : window.scrollTo({ top: 0 })
    })
  }, [])
  return [ruta, ir]
}

// Titulo y descripcion de cada pagina (para Google y al compartir el link).
function useMeta(ruta) {
  useEffect(() => {
    const meta = RUTAS_SITIO[ruta] || RUTAS_SITIO['/']
    document.title = meta.titulo
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.descripcion)
  }, [ruta])
}

const IrContexto = React.createContext(() => {})
// Link interno: navega sin recargar. Los demas (/cotiza, /visita, WhatsApp) son links normales.
function Enlace({ a, children, className, onClick, ...resto }) {
  const ir = React.useContext(IrContexto)
  const interno = a.split('#')[0] in RUTAS_SITIO
  return (
    <a href={a} className={className} {...resto} onClick={e => {
      onClick?.(e)
      if (!interno || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault(); ir(a)
    }}>{children}</a>
  )
}

// Fotos subidas desde Admin → Web; mientras una seccion no tenga, van las de ejemplo.
function useFotos() {
  const [subidas, setSubidas] = useState(null)
  useEffect(() => {
    fetch(API).then(r => r.json()).then(r => setSubidas(r.ok ? r.fotos : {})).catch(() => setSubidas({}))
  }, [])
  return useMemo(() => {
    const fotos = {}
    for (const [seccion, ejemplo] of Object.entries(FOTOS_EJEMPLO)) {
      const propias = subidas?.[seccion] || []
      fotos[seccion] = propias.length ? propias.map(f => ({ ...f, mini: f.url })) : ejemplo
    }
    return fotos
  }, [subidas])
}

const NAV = [['/', 'Inicio'], ['/cotizar', 'Cotizar'], ['/fotos', 'Fotos'], ['/preguntas', 'Preguntas'], ['/contacto', 'Contacto']]

function Encabezado({ ruta }) {
  const [abierto, setAbierto] = useState(false)
  useEffect(() => { setAbierto(false) }, [ruta])
  const activo = to => (to === '/' ? ruta === '/' : ruta.startsWith(to))
  return (
    <header className="st-header">
      <div className="st-contenedor st-header-fila">
        <Enlace a="/" className="st-marca" aria-label="Repisas Don Maxi, inicio">
          <img src="/web/logo-icono.png" alt="" width="30" height="43" />
          <span><strong>DON MAXI</strong><small>Optimiza tu espacio</small></span>
        </Enlace>
        <nav className={`st-nav ${abierto ? 'abierto' : ''}`} aria-label="Principal">
          {NAV.map(([to, nombre]) => <Enlace key={to} a={to} aria-current={activo(to) ? 'page' : undefined}>{nombre}</Enlace>)}
          <Enlace a="/cotizar" className="st-boton st-nav-cta">Cotiza ahora</Enlace>
        </nav>
        <button type="button" className="st-menu" aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={abierto} onClick={() => setAbierto(a => !a)}>
          <span /><span /><span />
        </button>
      </div>
    </header>
  )
}

function Pie() {
  return (
    <footer className="st-pie">
      <div className="st-contenedor st-pie-grid">
        <div>
          <img src="/web/logo-blanco.png" alt="Repisas Don Maxi" className="st-pie-logo" width="120" height="129" loading="lazy" />
          <p>Repisas de madera a medida para bodegas, closets y empresas. Diseño, fabricación e instalación.</p>
        </div>
        <div>
          <h3>Páginas</h3>
          {NAV.map(([to, nombre]) => <Enlace key={to} a={to}>{nombre}</Enlace>)}
        </div>
        <div>
          <h3>Cotiza</h3>
          <a href="/visita">Visita sin costo</a>
          <a href="/cotiza">Cotización automática</a>
          <Enlace a="/cotizar/fotos">Enviar fotos o video</Enlace>
        </div>
        <div>
          <h3>Contacto</h3>
          <a href={linkWhatsApp()} target="_blank" rel="noreferrer">WhatsApp {WHATSAPP.replace(/^\+56(\d)(\d{4})(\d{4})$/, '+56 $1 $2 $3')}</a>
          <a href={`mailto:${MARCA.correo}`}>{MARCA.correo}</a>
          <a href={MARCA.googleResenas} target="_blank" rel="noreferrer">★ {MARCA.rating} en Google</a>
        </div>
      </div>
      <div className="st-contenedor st-pie-legal">© {new Date().getFullYear()} {MARCA.razonSocial} · RUT {MARCA.rut}</div>
    </footer>
  )
}

function Llamado({ titulo = '¿Listo para ordenar tu bodega?', texto = 'Cotiza en minutos, sin compromiso.' }) {
  return (
    <section className="st-llamado">
      <div className="st-contenedor st-llamado-fila">
        <div><h2>{titulo}</h2><p>{texto}</p></div>
        <div className="st-llamado-botones">
          <Enlace a="/cotizar" className="st-boton grande">Cotiza ahora</Enlace>
          <a href={linkWhatsApp()} className="st-boton claro grande" target="_blank" rel="noreferrer">Escríbenos por WhatsApp</a>
        </div>
      </div>
    </section>
  )
}

function Estrellas() { return <span className="st-estrellas" aria-hidden="true">★★★★★</span> }

// ---------- Inicio ----------
function Inicio({ fotos }) {
  const [principal, ...destacadas] = fotos.portada
  return (
    <>
      <section className="st-hero">
        <img className="st-hero-foto" src={principal?.url} alt="Bodega con repisas de madera Don Maxi" fetchpriority="high" />
        <div className="st-contenedor st-hero-texto">
          <a className="st-pildora" href={MARCA.googleResenas} target="_blank" rel="noreferrer"><Estrellas /> {MARCA.rating} en Google · {MARCA.resenas} reseñas</a>
          <h1>Repisas de madera <span>a medida</span> para tu bodega</h1>
          <p>Diseñamos, fabricamos e instalamos repisas que aprovechan cada centímetro. Cotiza en línea en minutos y agenda tu instalación cuando te acomode.</p>
          <div className="st-hero-botones">
            <Enlace a="/cotizar" className="st-boton grande">Cotiza ahora</Enlace>
            <Enlace a="/fotos" className="st-boton claro grande">Ver trabajos</Enlace>
          </div>
          <ul className="st-hero-sellos">
            <li>✓ Garantía 5 años</li><li>✓ Pagas al terminar</li><li>✓ Agenda en línea</li>
          </ul>
        </div>
      </section>

      <section className="st-cifras" aria-label="Don Maxi en cifras">
        <div className="st-contenedor st-cifras-grid">
          {CIFRAS.map(c => <div key={c.texto}><strong>{c.valor}</strong><span>{c.texto}</span></div>)}
        </div>
      </section>

      <section className="st-seccion">
        <div className="st-contenedor">
          <p className="st-antetitulo">Así de simple</p>
          <h2 className="st-titulo">De la cotización a tu bodega ordenada</h2>
          <ol className="st-pasos">
            {PASOS.map((p, i) => <li key={p.titulo}><span className="st-paso-num">{i + 1}</span><h3>{p.titulo}</h3><p>{p.texto}</p></li>)}
          </ol>
          <div className="st-centro"><Enlace a="/cotizar" className="st-boton">Empezar a cotizar</Enlace></div>
        </div>
      </section>

      <section className="st-seccion st-fondo-suave">
        <div className="st-contenedor">
          <p className="st-antetitulo">Trabajos recientes</p>
          <h2 className="st-titulo">Bodegas que ya ordenamos</h2>
          <div className="st-destacadas">
            {[principal, ...destacadas].slice(0, 5).map((f, i) => (
              <Enlace key={f.id} a="/fotos" className={`st-destacada ${i === 0 ? 'grande' : ''}`}>
                <img src={i === 0 ? f.url : f.mini} alt={f.titulo || 'Repisas Don Maxi instaladas'} loading="lazy" />
              </Enlace>
            ))}
          </div>
          <div className="st-centro"><Enlace a="/fotos" className="st-boton claro">Ver todas las fotos →</Enlace></div>
        </div>
      </section>

      <section className="st-seccion">
        <div className="st-contenedor">
          <p className="st-antetitulo">Por qué Don Maxi</p>
          <h2 className="st-titulo">Hechas para tu espacio, sin complicarte</h2>
          <div className="st-ventajas">
            {VENTAJAS.map(v => <article key={v.titulo}><span className="st-ventaja-icono" aria-hidden="true">{v.icono}</span><h3>{v.titulo}</h3><p>{v.texto}</p></article>)}
          </div>
        </div>
      </section>

      <section className="st-seccion st-fondo-suave">
        <div className="st-contenedor">
          <p className="st-antetitulo">Servicios adicionales</p>
          <h2 className="st-titulo">Nosotros nos encargamos del resto</h2>
          <div className="st-servicios">
            {SERVICIOS_SITIO.map(s => (
              <article key={s.clave}><img src={s.foto} alt="" loading="lazy" /><div><h3>{s.nombre}</h3><p>{s.descripcion}</p></div></article>
            ))}
          </div>
        </div>
      </section>

      <section className="st-seccion">
        <div className="st-contenedor">
          <p className="st-antetitulo">Lo que dicen nuestros clientes</p>
          <h2 className="st-titulo">{MARCA.rating} estrellas en Google</h2>
          {RESENAS.length > 0 && (
            <div className="st-resenas">
              {RESENAS.map(r => (
                <figure key={r.nombre + r.texto.slice(0, 20)}><Estrellas /><blockquote>{r.texto}</blockquote><figcaption>{r.nombre}{r.fecha ? ` · ${r.fecha}` : ''}</figcaption></figure>
              ))}
            </div>
          )}
          <a className="st-google" href={MARCA.googleResenas} target="_blank" rel="noreferrer">
            <span className="st-google-g" aria-hidden="true">G</span>
            <span><strong>{MARCA.rating}</strong> <Estrellas /><small>{MARCA.resenas} reseñas en Google</small></span>
            <span className="st-google-ver">Leer reseñas →</span>
          </a>
        </div>
      </section>

      <Llamado />
    </>
  )
}

// ---------- Cotizar ----------
const OPCIONES = [
  { clave: 'cotizar-visita', titulo: 'Agenda una visita', sello: 'Sin costo · domingos', a: '/visita', boton: 'Agendar visita',
    puntos: ['Visita sin costo, los domingos', 'Un especialista toma las medidas (15 min)', 'Te asesora con el diseño', 'Te enviamos la cotización después'] },
  { clave: 'cotizar-auto', titulo: 'Cotización automática', sello: 'Precio al instante', destacada: true, a: '/cotiza', boton: 'Cotizar ahora',
    puntos: ['Dibuja tu bodega con sus medidas', 'Elige tus repisas y míralas en 3D', 'Ves el precio al instante y te llega el PDF'] },
  { clave: 'cotizar-foto', titulo: 'Envíanos fotos o un video', sello: 'Te cotizamos por correo', a: '/cotizar/fotos', boton: 'Enviar fotos',
    puntos: ['Graba tu bodega desde la puerta', 'Suma las medidas si las tienes', 'Te enviamos la cotización a tu correo'] },
]

function Cotizar({ fotos }) {
  return (
    <>
      <section className="st-cabecera">
        <div className="st-contenedor">
          <p className="st-antetitulo">Cotizar</p>
          <h1 className="st-titulo">¿Cómo prefieres cotizar?</h1>
          <p className="st-bajada">Elige la forma que más te acomode. En todas recibes una cotización detallada, sin compromiso.</p>
        </div>
      </section>
      <section className="st-seccion st-sin-arriba">
        <div className="st-contenedor st-opciones">
          {OPCIONES.map(o => {
            const foto = fotos[o.clave]?.[0]
            const Tag = o.a in RUTAS_SITIO ? Enlace : 'a'
            return (
              <article key={o.clave} className={`st-opcion ${o.destacada ? 'destacada' : ''}`} data-testid={`opcion-${o.clave}`}>
                {o.destacada && <span className="st-opcion-cinta">⚡ La más rápida</span>}
                <div className="st-opcion-foto">{foto && <img src={foto.url} alt="" loading="lazy" />}<span className="st-opcion-sello">{o.sello}</span></div>
                <div className="st-opcion-cuerpo">
                  <h2>{o.titulo}</h2>
                  <ul>{o.puntos.map(p => <li key={p}>{p}</li>)}</ul>
                  <Tag {...(Tag === 'a' ? { href: o.a } : { a: o.a })} className={`st-boton ${o.destacada ? '' : 'claro'} ancho`}>{o.boton} →</Tag>
                </div>
              </article>
            )
          })}
        </div>
        <div className="st-contenedor st-cotizar-notas">
          <div><strong>⏱ Instalación</strong><span>Una bodega típica queda lista en unas 2 horas.</span></div>
          <div><strong>📅 Agenda</strong><span>Con la cotización te llega el link para elegir día y hora.</span></div>
          <div><strong>💳 Pago</strong><span>Al terminar, o 50% antes. Transferencia con descuento.</span></div>
        </div>
        <p className="st-centro st-nota">¿Dudas? Revisa las <Enlace a="/preguntas">preguntas frecuentes</Enlace> o <a href={linkWhatsApp()} target="_blank" rel="noreferrer">escríbenos por WhatsApp</a>.</p>
      </section>
    </>
  )
}

// ---------- Fotos ----------
function Visor({ fotos, indice, onCerrar, onMover }) {
  const toque = useRef(null)
  useEffect(() => {
    const tecla = e => { if (e.key === 'Escape') onCerrar(); if (e.key === 'ArrowRight') onMover(1); if (e.key === 'ArrowLeft') onMover(-1) }
    window.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = '' }
  }, [onCerrar, onMover])
  const f = fotos[indice]
  return (
    <div className="st-visor" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}
      onTouchStart={e => { toque.current = e.touches[0].clientX }}
      onTouchEnd={e => { const dx = e.changedTouches[0].clientX - (toque.current ?? 0); if (Math.abs(dx) > 50) onMover(dx < 0 ? 1 : -1) }}>
      <img src={f.url} alt={f.titulo || 'Repisas Don Maxi'} />
      <button type="button" className="st-visor-cerrar" aria-label="Cerrar" onClick={onCerrar}>×</button>
      <button type="button" className="st-visor-flecha izq" aria-label="Foto anterior" onClick={() => onMover(-1)}>‹</button>
      <button type="button" className="st-visor-flecha der" aria-label="Foto siguiente" onClick={() => onMover(1)}>›</button>
      <p className="st-visor-pie">{f.titulo ? `${f.titulo} · ` : ''}{indice + 1} / {fotos.length}</p>
    </div>
  )
}

function Fotos({ fotos }) {
  const [filtro, setFiltro] = useState('')
  const [abierta, setAbierta] = useState(null)
  const lista = fotos.galeria.filter(f => !filtro || f.categoria === filtro)
  const presentes = Object.entries(CATEGORIAS_GALERIA).filter(([c]) => fotos.galeria.some(f => f.categoria === c))
  const mover = useCallback(d => setAbierta(i => (i + d + lista.length) % lista.length), [lista.length])
  const cerrar = useCallback(() => setAbierta(null), [])
  return (
    <>
      <section className="st-cabecera">
        <div className="st-contenedor">
          <p className="st-antetitulo">Portafolio</p>
          <h1 className="st-titulo">Nuestros trabajos</h1>
          <p className="st-bajada">Bodegas de departamentos y casas, closets, empresas y contenedores. Todas a medida.</p>
        </div>
      </section>
      <section className="st-seccion st-sin-arriba">
        <div className="st-contenedor">
          {presentes.length > 1 && (
            <div className="st-filtros" role="group" aria-label="Filtrar fotos">
              <button type="button" aria-pressed={!filtro} onClick={() => setFiltro('')}>Todas</button>
              {presentes.map(([c, nombre]) => <button key={c} type="button" aria-pressed={filtro === c} onClick={() => setFiltro(c)}>{nombre}</button>)}
            </div>
          )}
          <div className="st-galeria" data-testid="galeria">
            {lista.map((f, i) => (
              <button key={f.id} type="button" className="st-galeria-foto" onClick={() => setAbierta(i)} aria-label={`Ampliar foto ${i + 1}${f.titulo ? ': ' + f.titulo : ''}`}>
                <img src={f.mini} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      </section>
      {abierta !== null && lista[abierta] && <Visor fotos={lista} indice={abierta} onCerrar={cerrar} onMover={mover} />}
      <Llamado titulo="¿Te gustaría algo así?" texto="Cuéntanos de tu espacio y te cotizamos." />
    </>
  )
}

// ---------- Preguntas ----------
function Preguntas() {
  return (
    <>
      <section className="st-cabecera">
        <div className="st-contenedor">
          <p className="st-antetitulo">Preguntas frecuentes</p>
          <h1 className="st-titulo">Todo lo que necesitas saber</h1>
          <p className="st-bajada">¿No encuentras tu respuesta? <a href={linkWhatsApp('Hola, tengo una consulta')} target="_blank" rel="noreferrer">Escríbenos por WhatsApp</a>.</p>
        </div>
      </section>
      <section className="st-seccion st-sin-arriba">
        <div className="st-contenedor st-angosto">
          {PREGUNTAS.map(g => (
            <div key={g.grupo} className="st-faq-grupo">
              <h2>{g.grupo}</h2>
              {g.preguntas.map(([p, r]) => (
                <details key={p} className="st-faq">
                  <summary>{p}</summary>
                  <p>{r}</p>
                </details>
              ))}
            </div>
          ))}
        </div>
      </section>
      <Llamado />
    </>
  )
}

// ---------- Contacto ----------
function Contacto() {
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', mensaje: '', website: '' })
  const [estado, setEstado] = useState({ enviando: false, error: '', listo: false })
  const cambiar = campo => e => setForm(f => ({ ...f, [campo]: e.target.value }))
  async function enviar(e) {
    e.preventDefault()
    setEstado({ enviando: true, error: '', listo: false })
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'contacto', ...form }) }).then(x => x.json())
      setEstado(r.ok ? { enviando: false, error: '', listo: true } : { enviando: false, error: r.error || 'No pudimos enviar tu mensaje', listo: false })
    } catch { setEstado({ enviando: false, error: 'No pudimos conectarnos. Revisa tu internet e intenta de nuevo.', listo: false }) }
  }
  return (
    <>
      <section className="st-cabecera">
        <div className="st-contenedor">
          <p className="st-antetitulo">Contacto</p>
          <h1 className="st-titulo">Conversemos</h1>
          <p className="st-bajada">Lo más rápido es WhatsApp. También puedes dejarnos un mensaje y te respondemos.</p>
        </div>
      </section>
      <section className="st-seccion st-sin-arriba">
        <div className="st-contenedor st-contacto">
          <div className="st-contacto-canales">
            <a className="st-canal whatsapp" href={linkWhatsApp('Hola, tengo una consulta')} target="_blank" rel="noreferrer"><span aria-hidden="true">💬</span><div><strong>WhatsApp</strong><small>{WHATSAPP.replace(/^\+56(\d)(\d{4})(\d{4})$/, '+56 $1 $2 $3')}</small></div></a>
            <a className="st-canal" href={`mailto:${MARCA.correo}`}><span aria-hidden="true">✉️</span><div><strong>Correo</strong><small>{MARCA.correo}</small></div></a>
            <Enlace className="st-canal" a="/cotizar"><span aria-hidden="true">📐</span><div><strong>¿Quieres cotizar?</strong><small>Elige cómo: en línea, con fotos o con visita</small></div></Enlace>
          </div>
          {estado.listo ? (
            <div className="st-tarjeta st-exito" role="status" data-testid="contacto-listo"><span aria-hidden="true">✅</span><h2>¡Mensaje enviado!</h2><p>Gracias, {form.nombre.split(' ')[0]}. Te responderemos pronto.</p></div>
          ) : (
            <form className="st-tarjeta st-form" onSubmit={enviar} noValidate>
              <h2>Déjanos un mensaje</h2>
              <label>Nombre<input value={form.nombre} onChange={cambiar('nombre')} autoComplete="name" required /></label>
              <div className="st-form-fila">
                <label>Correo<input type="email" value={form.email} onChange={cambiar('email')} autoComplete="email" inputMode="email" /></label>
                <label>Teléfono<input type="tel" value={form.telefono} onChange={cambiar('telefono')} autoComplete="tel" inputMode="tel" placeholder="9 1234 5678" /></label>
              </div>
              <label>Mensaje<textarea rows={5} value={form.mensaje} onChange={cambiar('mensaje')} required /></label>
              <label className="st-oculto" aria-hidden="true">Sitio web<input tabIndex={-1} autoComplete="off" value={form.website} onChange={cambiar('website')} /></label>
              {estado.error && <p className="st-error" role="alert">{estado.error}</p>}
              <button type="submit" className="st-boton ancho" disabled={estado.enviando}>{estado.enviando ? 'Enviando…' : 'Enviar mensaje'}</button>
            </form>
          )}
        </div>
      </section>
    </>
  )
}

function NoEncontrada() {
  return (
    <section className="st-cabecera st-centro">
      <div className="st-contenedor">
        <h1 className="st-titulo">No encontramos esta página</h1>
        <p className="st-bajada">Puede que el link esté incompleto.</p>
        <Enlace a="/" className="st-boton">Ir al inicio</Enlace>
      </div>
    </section>
  )
}

export default function SitioApp() {
  const [ruta, ir] = useRuta()
  useMeta(ruta)
  const fotos = useFotos()
  const pagina = ruta === '/' ? <Inicio fotos={fotos} />
    : ruta === '/cotizar' ? <Cotizar fotos={fotos} />
    : ruta === '/cotizar/fotos' ? <EnviarFotos Enlace={Enlace} linkWhatsApp={linkWhatsApp} />
    : ruta === '/fotos' ? <Fotos fotos={fotos} />
    : ruta === '/preguntas' ? <Preguntas />
    : ruta === '/contacto' ? <Contacto />
    : <NoEncontrada />
  return (
    <IrContexto.Provider value={ir}>
      <div className="sitio">
        <a className="st-saltar" href="#contenido">Saltar al contenido</a>
        <Encabezado ruta={ruta} />
        <main id="contenido">{pagina}</main>
        <Pie />
        <a className="st-flotante" href={linkWhatsApp()} target="_blank" rel="noreferrer" aria-label="Escríbenos por WhatsApp">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>
        </a>
      </div>
    </IrContexto.Provider>
  )
}
