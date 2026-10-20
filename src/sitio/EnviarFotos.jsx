import React, { useEffect, useMemo, useRef, useState } from 'react'

// "Envíanos fotos o un video": el cliente deja sus datos y sus archivos, que quedan en una carpeta
// del Drive del negocio, y a Don Maxi le llega un correo para cotizar a mano. Los archivos viajan en
// trozos a sitio.mjs (reglas y limites en netlify/functions/lib/sitio.mjs).
const API = '/.netlify/functions/sitio'
const MAX_ARCHIVOS = 10
const MAX_MB = 500
const mb = n => (n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: n < 1e7 ? 1 : 0 }) + ' MB'

const leerBase64 = blob => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] || '')
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

async function post(body) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const datos = await r.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor' }))
  if (!datos.ok) throw new Error(datos.error || 'No pudimos enviar tus archivos')
  return datos
}

function Miniatura({ archivo, onQuitar }) {
  const url = useMemo(() => (archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : ''), [archivo])
  useEffect(() => () => url && URL.revokeObjectURL(url), [url])
  return (
    <li className="st-archivo">
      {url ? <img src={url} alt="" /> : <span className="st-archivo-video" aria-hidden="true">🎬</span>}
      <span className="st-archivo-nombre">{archivo.name}<small>{mb(archivo.size)}</small></span>
      {onQuitar && <button type="button" onClick={onQuitar} aria-label={`Quitar ${archivo.name}`}>×</button>}
    </li>
  )
}

export default function EnviarFotos({ Enlace, linkWhatsApp }) {
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', comuna: '', medidas: '', comentarios: '', website: '' })
  const [archivos, setArchivos] = useState([])
  const [arrastrando, setArrastrando] = useState(false)
  const [error, setError] = useState('')
  const [avance, setAvance] = useState(null) // { enviados, total, archivo }
  const [listo, setListo] = useState(false)
  const input = useRef(null)
  const cambiar = campo => e => setForm(f => ({ ...f, [campo]: e.target.value }))

  function agregar(lista) {
    setError('')
    const nuevos = [...lista].filter(f => /^(image|video)\//.test(f.type) || /\.(heic|heif|mov|mp4)$/i.test(f.name))
    if (nuevos.length < lista.length) setError('Solo puedes enviar fotos o videos.')
    const grandes = nuevos.filter(f => f.size > MAX_MB * 1e6)
    if (grandes.length) setError(`"${grandes[0].name}" pesa más de ${MAX_MB} MB. Prueba con un video más corto.`)
    setArchivos(a => [...a, ...nuevos.filter(f => f.size <= MAX_MB * 1e6)].slice(0, MAX_ARCHIVOS))
  }

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (!archivos.length) { setError('Agrega al menos una foto o video de tu espacio.'); return }
    const total = archivos.reduce((t, f) => t + f.size, 0)
    setAvance({ enviados: 0, total, archivo: '' })
    try {
      const meta = archivos.map(f => ({ nombre: f.name, tamano: f.size, tipo: f.type || (/\.(mov|mp4)$/i.test(f.name) ? 'video/quicktime' : 'image/heic') }))
      const inicio = await post({ tipo: 'fotos-iniciar', ...form, archivos: meta })
      let enviados = 0
      for (const [i, sub] of inicio.subidas.entries()) {
        const f = archivos[i]
        for (let desde = 0; desde < f.size; desde += inicio.trozo) {
          const trozo = f.slice(desde, Math.min(f.size, desde + inicio.trozo))
          const datos = await leerBase64(trozo)
          // Reintenta cada trozo: en el celular la conexion se corta seguido.
          for (let intento = 1; ; intento++) {
            try { await post({ tipo: 'fotos-trozo', sesion: sub.sesion, inicio: desde, total: f.size, datos }); break }
            catch (err) { if (intento >= 3) throw err; await new Promise(r => setTimeout(r, 1500 * intento)) }
          }
          enviados += trozo.size
          setAvance({ enviados, total, archivo: f.name })
        }
      }
      await post({ tipo: 'fotos-terminar', carpeta: inicio.carpeta })
      setListo(true); window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message || 'No pudimos enviar tus archivos. Intenta de nuevo.')
    } finally { setAvance(null) }
  }

  if (listo) return (
    <section className="st-cabecera">
      <div className="st-contenedor st-angosto">
        <div className="st-tarjeta st-exito" role="status" data-testid="fotos-listo">
          <span aria-hidden="true">📸</span>
          <h1>¡Recibimos tus fotos!</h1>
          <p>Gracias, {form.nombre.split(' ')[0]}. Las revisamos y te enviamos la cotización a <strong>{form.email}</strong>. Si nos falta alguna medida, te escribimos por WhatsApp.</p>
          <div className="st-hero-botones st-centrado">
            <Enlace a="/fotos" className="st-boton claro">Ver trabajos mientras tanto</Enlace>
            <a href="/cotiza" className="st-boton">Probar la cotización automática</a>
          </div>
        </div>
      </div>
    </section>
  )

  const pct = avance ? Math.round((avance.enviados / Math.max(1, avance.total)) * 100) : 0
  return (
    <>
      <section className="st-cabecera">
        <div className="st-contenedor">
          <p className="st-antetitulo"><Enlace a="/cotizar">Cotizar</Enlace> · Con fotos</p>
          <h1 className="st-titulo">Envíanos fotos o un video de tu espacio</h1>
          <p className="st-bajada">Nosotros vemos las medidas y el diseño, y te enviamos la cotización a tu correo.</p>
        </div>
      </section>
      <section className="st-seccion st-sin-arriba">
        <div className="st-contenedor st-fotos-grid">
          <form className="st-tarjeta st-form" onSubmit={enviar} noValidate>
            <h2>1. Tus fotos o videos</h2>
            <div className={`st-zona ${arrastrando ? 'activa' : ''}`}
              onDragOver={e => { e.preventDefault(); setArrastrando(true) }} onDragLeave={() => setArrastrando(false)}
              onDrop={e => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files) }}>
              <span aria-hidden="true">📷</span>
              <p><strong>Toca para elegir</strong> o arrastra aquí tus archivos</p>
              <small>Hasta {MAX_ARCHIVOS} fotos o videos, de hasta {MAX_MB} MB cada uno</small>
              <button type="button" className="st-boton claro" onClick={() => input.current?.click()} disabled={Boolean(avance)}>Elegir fotos o videos</button>
              <input ref={input} type="file" accept="image/*,video/*" multiple hidden data-testid="fotos-input"
                onChange={e => { agregar(e.target.files); e.target.value = '' }} />
            </div>
            {archivos.length > 0 && (
              <ul className="st-archivos">
                {archivos.map((f, i) => <Miniatura key={f.name + f.size + i} archivo={f} onQuitar={avance ? null : () => setArchivos(a => a.filter((_, j) => j !== i))} />)}
              </ul>
            )}

            <h2>2. Tus datos</h2>
            <label>Nombre y apellido<input value={form.nombre} onChange={cambiar('nombre')} autoComplete="name" required /></label>
            <div className="st-form-fila">
              <label>Correo<input type="email" value={form.email} onChange={cambiar('email')} autoComplete="email" inputMode="email" required /></label>
              <label>Celular<input type="tel" value={form.telefono} onChange={cambiar('telefono')} autoComplete="tel" inputMode="tel" placeholder="9 1234 5678" required /></label>
            </div>
            <label>Comuna o dirección<input value={form.comuna} onChange={cambiar('comuna')} autoComplete="address-level2" placeholder="Ej: Ñuñoa" /></label>
            <label>Medidas aproximadas <span className="st-opcional">(opcional)</span><input value={form.medidas} onChange={cambiar('medidas')} placeholder="Ej: 2,4 m de largo × 1,5 m de fondo × 2,3 m de alto" /></label>
            <label>Comentarios <span className="st-opcional">(opcional)</span><textarea rows={4} value={form.comentarios} onChange={cambiar('comentarios')} placeholder="¿Qué quieres guardar? ¿Necesitas barra para colgar o soporte de bicicleta?" /></label>
            <label className="st-oculto" aria-hidden="true">Sitio web<input tabIndex={-1} autoComplete="off" value={form.website} onChange={cambiar('website')} /></label>

            {error && <p className="st-error" role="alert">{error}</p>}
            {avance && (
              <div className="st-subiendo" role="status" aria-live="polite">
                <div className="st-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: pct + '%' }} /></div>
                <small>Enviando {avance.archivo ? `“${avance.archivo}”` : 'tus archivos'}… {pct}% · {mb(avance.enviados)} de {mb(avance.total)}. No cierres esta página.</small>
              </div>
            )}
            <button type="submit" className="st-boton ancho grande" disabled={Boolean(avance)}>{avance ? 'Enviando…' : 'Enviar para cotizar'}</button>
            <p className="st-nota">Usamos tus datos solo para enviarte la cotización.</p>
          </form>

          <aside className="st-consejos">
            <h2>Para cotizarte bien</h2>
            <ol>
              <li><strong>Desde la puerta</strong>, una foto o video que muestre todo el espacio.</li>
              <li><strong>Cada muro</strong> por separado, de piso a techo.</li>
              <li>Si puedes, <strong>una huincha</strong> extendida en la foto: nos ayuda con las medidas.</li>
              <li>Muéstranos <strong>enchufes, cañerías o ventanas</strong> que haya que esquivar.</li>
            </ol>
            <p>¿Prefieres hacerlo tú? Con la <a href="/cotiza">cotización automática</a> ves el precio al instante.</p>
            <p>¿Dudas? <a href={linkWhatsApp('Hola, quiero cotizar con fotos')} target="_blank" rel="noreferrer">Escríbenos por WhatsApp</a>.</p>
          </aside>
        </div>
      </section>
    </>
  )
}
