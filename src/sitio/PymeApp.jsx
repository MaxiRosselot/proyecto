// /pyme: la marca para empresas (ver pyme-contenido.js). Una sola pagina: propuesta, para quien,
// por que, proceso, proyectos, formulario de cotizacion y preguntas. El formulario llega por
// correo y Telegram como solicitud de empresa (tipo 'pyme' en sitio.mjs).
import React, { useEffect, useMemo, useState } from 'react'
import { FOTOS_EJEMPLO } from './fotos-ejemplo.js'
import { CIFRAS_PYME, PASOS_PYME, PLAZOS, PREGUNTAS_PYME, PYME, SEGMENTOS, TAMANOS, TIPOS_ESPACIO, VENTAJAS_PYME } from './pyme-contenido.js'
import './pyme.css'

const API = '/.netlify/functions/sitio'
const soloDigitos = s => String(s || '').replace(/\D/g, '')
const linkWhatsApp = (texto = '') => `https://wa.me/${soloDigitos(PYME.whatsapp)}?text=${encodeURIComponent(`${PYME.saludo} ${texto}`.trim())}`

// Proyectos de empresa: los subidos desde Admin → Web con categoria "Empresas"; si no hay, los de ejemplo.
function useProyectos() {
  const [subidas, setSubidas] = useState(null)
  useEffect(() => {
    fetch(API).then(r => r.json()).then(r => setSubidas(r.ok ? r.fotos?.galeria || [] : [])).catch(() => setSubidas([]))
  }, [])
  return useMemo(() => {
    const propias = (subidas || []).filter(f => f.categoria === 'empresas').map(f => ({ ...f, mini: f.url }))
    return propias.length ? propias : FOTOS_EJEMPLO.galeria.filter(f => f.categoria === 'empresas')
  }, [subidas])
}

function useMetaPyme() {
  useEffect(() => {
    // La marca usa su propia tipografia (Manrope), distinta a la del sitio para personas.
    if (!document.getElementById('fuente-repisaspro')) {
      const link = Object.assign(document.createElement('link'), { id: 'fuente-repisaspro', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap' })
      document.head.appendChild(link)
    }
    document.title = `${PYME.nombre} · ${PYME.bajada} en Santiago`
    const meta = document.querySelector('meta[name="description"]')
    meta?.setAttribute('content', 'Estanterías de madera a medida para bodegas, centros de distribución, retail, edificios y contenedores. Fabricación propia, visita técnica sin costo, propuesta formal con 3D y factura.')
  }, [])
}

const irA = id => e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

function Logo() {
  return (
    <a className="py-logo" href="/pyme" aria-label={`${PYME.nombre}, inicio`}>
      {/* El simbolo de repisa, en los colores de la marca (public/pyme). */}
      <img src="/pyme/icono-celeste.png" alt="" width="26" height="38" />
      <span className="py-marca">REPISAS<b>PRO</b></span>
    </a>
  )
}

function Formulario() {
  const [form, setForm] = useState({ empresa: '', rut: '', nombre: '', cargo: '', email: '', telefono: '', comuna: '', espacio: TIPOS_ESPACIO[0], tamano: TAMANOS[0], plazo: PLAZOS[0], mensaje: '', website: '' })
  const [estado, setEstado] = useState({ enviando: false, error: '', listo: false })
  const cambiar = campo => e => setForm(f => ({ ...f, [campo]: e.target.value }))
  async function enviar(e) {
    e.preventDefault()
    setEstado({ enviando: true, error: '', listo: false })
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'pyme', ...form }) }).then(x => x.json())
      setEstado(r.ok ? { enviando: false, error: '', listo: true } : { enviando: false, error: r.error || 'No pudimos enviar tu solicitud', listo: false })
    } catch { setEstado({ enviando: false, error: 'No pudimos conectarnos. Revisa tu internet e intenta de nuevo.', listo: false }) }
  }
  if (estado.listo) return (
    <div className="py-tarjeta py-exito" role="status" data-testid="pyme-listo">
      <span aria-hidden="true">✅</span>
      <h3>¡Recibimos tu solicitud!</h3>
      <p>Gracias, {form.nombre.split(' ')[0]}. Te contactamos dentro de 24 horas hábiles para coordinar la visita técnica.</p>
      <a className="py-boton" href={linkWhatsApp(`Soy ${form.nombre} de ${form.empresa}, acabo de enviar el formulario.`)} target="_blank" rel="noreferrer">Adelantar por WhatsApp</a>
    </div>
  )
  return (
    <form className="py-tarjeta py-form" onSubmit={enviar} noValidate data-testid="pyme-form">
      <div className="py-fila">
        <label>Empresa<input value={form.empresa} onChange={cambiar('empresa')} autoComplete="organization" required /></label>
        <label><span>RUT <small>(opcional)</small></span><input value={form.rut} onChange={cambiar('rut')} placeholder="76.123.456-7" /></label>
      </div>
      <div className="py-fila">
        <label>Tu nombre<input value={form.nombre} onChange={cambiar('nombre')} autoComplete="name" required /></label>
        <label><span>Cargo <small>(opcional)</small></span><input value={form.cargo} onChange={cambiar('cargo')} autoComplete="organization-title" /></label>
      </div>
      <div className="py-fila">
        <label>Correo<input type="email" value={form.email} onChange={cambiar('email')} autoComplete="email" inputMode="email" /></label>
        <label>Teléfono<input type="tel" value={form.telefono} onChange={cambiar('telefono')} autoComplete="tel" inputMode="tel" placeholder="9 1234 5678" /></label>
      </div>
      <div className="py-fila">
        <label>Comuna<input value={form.comuna} onChange={cambiar('comuna')} placeholder="Quilicura" /></label>
        <label>Tipo de espacio<select value={form.espacio} onChange={cambiar('espacio')}>{TIPOS_ESPACIO.map(t => <option key={t}>{t}</option>)}</select></label>
      </div>
      <div className="py-fila">
        <label>Tamaño aproximado<select value={form.tamano} onChange={cambiar('tamano')}>{TAMANOS.map(t => <option key={t}>{t}</option>)}</select></label>
        <label>¿Para cuándo?<select value={form.plazo} onChange={cambiar('plazo')}>{PLAZOS.map(t => <option key={t}>{t}</option>)}</select></label>
      </div>
      <label><span>Cuéntanos del proyecto <small>(opcional)</small></span><textarea rows={4} value={form.mensaje} onChange={cambiar('mensaje')} placeholder="Qué guardan, cuántos locales o bodegas, alto del espacio…" /></label>
      <label className="py-oculto" aria-hidden="true">Sitio web<input tabIndex={-1} autoComplete="off" value={form.website} onChange={cambiar('website')} /></label>
      {estado.error && <p className="py-error" role="alert">{estado.error}</p>}
      <button type="submit" className="py-boton ancho" disabled={estado.enviando}>{estado.enviando ? 'Enviando…' : 'Solicitar visita y cotización'}</button>
      <p className="py-nota">Respondemos en 24 horas hábiles. Sin costo ni compromiso.</p>
    </form>
  )
}

export default function PymeApp() {
  useMetaPyme()
  const proyectos = useProyectos()
  const [abierta, setAbierta] = useState(0)
  return (
    <div className="pyme">
      <header className="py-encabezado">
        <div className="py-contenedor py-encabezado-fila">
          <Logo />
          <nav aria-label="Secciones">
            <a href="#segmentos" onClick={irA('segmentos')}>Para quién</a>
            <a href="#proceso" onClick={irA('proceso')}>Cómo trabajamos</a>
            <a href="#proyectos" onClick={irA('proyectos')}>Proyectos</a>
            <a className="py-boton chico" href="#cotizar" onClick={irA('cotizar')}>Cotizar proyecto</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="py-hero">
          <div className="py-contenedor py-hero-grilla">
            <div>
              <p className="py-antetitulo">Para empresas y pymes · Santiago</p>
              <h1>Estanterías de madera a medida para tu bodega, local o centro de distribución</h1>
              <p className="py-bajada">Diseñamos, fabricamos en nuestro taller e instalamos con equipo propio. Visita técnica sin costo, propuesta formal con modelo 3D y factura.</p>
              <div className="py-acciones">
                <a className="py-boton" href="#cotizar" onClick={irA('cotizar')}>Solicitar visita técnica</a>
                <a className="py-boton claro" href={linkWhatsApp()} target="_blank" rel="noreferrer">Hablar por WhatsApp</a>
              </div>
            </div>
          </div>
          <div className="py-contenedor">
            <ul className="py-cifras">
              {CIFRAS_PYME.map(c => <li key={c.texto}><strong>{c.valor}</strong><span>{c.texto}</span></li>)}
            </ul>
          </div>
        </section>

        <section className="py-seccion" id="segmentos">
          <div className="py-contenedor">
            <p className="py-antetitulo">Para quién</p>
            <h2>Un proyecto a la medida de cada operación</h2>
            <div className="py-segmentos">
              {SEGMENTOS.map(s => (
                <article key={s.titulo} className="py-segmento">
                  <img src={s.foto} alt="" loading="lazy" />
                  <div><h3><span aria-hidden="true">{s.icono}</span> {s.titulo}</h3><p>{s.texto}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-seccion py-oscura">
          <div className="py-contenedor">
            <p className="py-antetitulo">Por qué {PYME.nombre}</p>
            <h2>Capacidad de fábrica, trato directo</h2>
            <div className="py-ventajas">
              {VENTAJAS_PYME.map((v, i) => <div key={v.titulo} className="py-ventaja"><span className="py-numero">{String(i + 1).padStart(2, '0')}</span><h3>{v.titulo}</h3><p>{v.texto}</p></div>)}
            </div>
          </div>
        </section>

        <section className="py-seccion py-destacado">
          <div className="py-contenedor py-destacado-grilla">
            <img src="/web/fotos/dm-094.jpg" alt="Bodega equipada con estanterías de madera de piso a techo" loading="lazy" />
            <div>
              <p className="py-antetitulo">Inmobiliarias y edificios</p>
              <h2>Todas las bodegas de un edificio, con un solo proyecto</h2>
              <p>Ofrece a tus compradores o arrendatarios la bodega lista para usar. Diseñamos un modelo por tipo de bodega, fabricamos en serie e instalamos por etapas, coordinados con la administración o la obra.</p>
              <ul className="py-lista">
                <li>Precio por volumen para el edificio completo</li>
                <li>Instalación coordinada por piso o por etapa</li>
                <li>Opción de ofrecerlo como venta directa a cada propietario</li>
              </ul>
              <a className="py-boton" href="#cotizar" onClick={irA('cotizar')}>Cotizar un edificio</a>
            </div>
          </div>
        </section>

        <section className="py-seccion" id="proceso">
          <div className="py-contenedor">
            <p className="py-antetitulo">Cómo trabajamos</p>
            <h2>De la visita a la instalación, sin sorpresas</h2>
            <ol className="py-pasos">
              {PASOS_PYME.map((p, i) => <li key={p.titulo}><span>{i + 1}</span><h3>{p.titulo}</h3><p>{p.texto}</p></li>)}
            </ol>
          </div>
        </section>

        <section className="py-seccion py-suave" id="proyectos">
          <div className="py-contenedor">
            <p className="py-antetitulo">Proyectos</p>
            <h2>Algunos trabajos para empresas</h2>
            <div className="py-galeria">
              {proyectos.slice(0, 12).map(f => <img key={f.id} src={f.mini || f.url} alt={f.titulo || 'Proyecto de estanterías para empresa'} loading="lazy" />)}
            </div>
          </div>
        </section>

        <section className="py-seccion" id="cotizar">
          <div className="py-contenedor py-cotizar-grilla">
            <div>
              <p className="py-antetitulo">Cotiza tu proyecto</p>
              <h2>Agenda una visita técnica sin costo</h2>
              <p>Cuéntanos lo básico y te contactamos para medir el espacio. Con la visita te enviamos la propuesta formal: precio, plazo y el modelo 3D.</p>
              <ul className="py-lista">
                <li>Respuesta en 24 horas hábiles</li>
                <li>Factura electrónica y orden de compra</li>
                <li>Garantía de 5 años</li>
              </ul>
              <a className="py-canal" href={linkWhatsApp('Quiero cotizar un proyecto.')} target="_blank" rel="noreferrer">💬 ¿Prefieres WhatsApp? Escríbenos</a>
            </div>
            <Formulario />
          </div>
        </section>

        <section className="py-seccion py-suave">
          <div className="py-contenedor py-angosto">
            <p className="py-antetitulo">Preguntas frecuentes</p>
            <h2>Lo que nos preguntan las empresas</h2>
            <div className="py-preguntas">
              {PREGUNTAS_PYME.map(([p, r], i) => (
                <div key={p} className="py-pregunta">
                  <button type="button" aria-expanded={abierta === i} onClick={() => setAbierta(abierta === i ? -1 : i)}>{p}<span aria-hidden="true">{abierta === i ? '−' : '+'}</span></button>
                  {abierta === i && <p>{r}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="py-pie">
        <div className="py-contenedor py-pie-fila">
          <img className="py-pie-logo" src="/pyme/logo-repisaspro-oscuro.png" alt={PYME.nombre} width="150" />
          <p>{PYME.bajada} · Santiago, Chile<br />{[PYME.correo, PYME.whatsapp.replace(/^\+56(\d)(\d{4})(\d{4})$/, '+56 $1 $2 $3'), PYME.instagram && `@${PYME.instagram}`].filter(Boolean).join(' · ')}</p>
        </div>
      </footer>
      <a className="py-flotante" href={linkWhatsApp()} target="_blank" rel="noreferrer" aria-label="Escríbenos por WhatsApp">💬</a>
    </div>
  )
}
