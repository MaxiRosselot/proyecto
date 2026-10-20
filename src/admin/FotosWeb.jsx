import React, { useEffect, useRef, useState } from 'react'
import { C, styles, apiFetch } from './utils.js'
import { CATEGORIAS_GALERIA, SECCIONES_WEB } from '../../netlify/functions/lib/sitio.mjs'
import { FOTOS_EJEMPLO } from '../sitio/fotos-ejemplo.js'

// Admin → Web: las fotos del sitio (portada, galeria y las tarjetas de Cotizar). Se guardan en la
// carpeta "Web Don Maxi" de Drive (web-fotos.mjs). Mientras una seccion no tenga fotos propias, el
// sitio muestra las de ejemplo; "Copiar las de ejemplo" las sube para poder ordenarlas o borrarlas.
const API = '/.netlify/functions/web-fotos'
const DONDE = { portada: '/', galeria: '/fotos', 'cotizar-foto': '/cotizar', 'cotizar-auto': '/cotizar', 'cotizar-visita': '/cotizar' }

// Achica la foto en el navegador (lado mayor 1800 px, JPG) para que suba rapido y pese poco en la web.
async function prepararFoto(blob) {
  const img = await createImageBitmap(blob).catch(() => null)
  if (!img) throw new Error('No se pudo leer la foto. Prueba con un JPG o PNG.')
  const escala = Math.min(1, 1800 / Math.max(img.width, img.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(img.width * escala); lienzo.height = Math.round(img.height * escala)
  lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height)
  const jpg = await new Promise(r => lienzo.toBlob(r, 'image/jpeg', 0.82))
  const datos = await new Promise((resolve, reject) => { const f = new FileReader(); f.onload = () => resolve(String(f.result).split(',')[1]); f.onerror = reject; f.readAsDataURL(jpg) })
  return { datos, tipo: 'image/jpeg' }
}

function Foto({ foto, seccion, primera, ultima, onMover, onBorrar, onEditar }) {
  const [titulo, setTitulo] = useState(foto.titulo)
  useEffect(() => setTitulo(foto.titulo), [foto.titulo])
  const boton = { ...styles.btnSecondary, padding: '5px 9px', fontSize: 13 }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.surface }} data-testid="foto-web">
      <img src={foto.url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block', background: C.bg }} />
      <div style={{ padding: 8, display: 'grid', gap: 6 }}>
        <input aria-label="Título de la foto" placeholder="Título (opcional)" value={titulo} onChange={e => setTitulo(e.target.value)}
          onBlur={() => titulo !== foto.titulo && onEditar({ titulo })} style={{ ...styles.input, padding: '6px 9px', fontSize: 13 }} />
        {seccion === 'galeria' && (
          <select aria-label="Categoría" value={foto.categoria} onChange={e => onEditar({ titulo, categoria: e.target.value })} style={{ ...styles.input, padding: '6px 9px', fontSize: 13 }}>
            <option value="">Sin categoría</option>
            {Object.entries(CATEGORIAS_GALERIA).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          {SECCIONES_WEB[seccion].max > 1 && <>
            <button type="button" style={boton} disabled={primera} onClick={() => onMover(-1)} aria-label="Mover antes">←</button>
            <button type="button" style={boton} disabled={ultima} onClick={() => onMover(1)} aria-label="Mover después">→</button>
          </>}
          <button type="button" style={{ ...boton, marginLeft: 'auto', color: C.red }} onClick={onBorrar}>Borrar</button>
        </div>
      </div>
    </div>
  )
}

export default function FotosWebSection() {
  const [seccion, setSeccion] = useState('portada')
  const [fotos, setFotos] = useState(null)
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState('')
  const [categoria, setCategoria] = useState('bodegas')
  const input = useRef(null)

  async function cargar() {
    try {
      const r = await apiFetch(API)
      if (!r.ok) throw new Error(r.error || 'No se pudieron cargar las fotos')
      setFotos(r.fotos); setError('')
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { cargar() }, [])

  async function enviar(body) {
    const r = await apiFetch(API, { method: 'POST', body: JSON.stringify(body) })
    if (!r.ok) throw new Error(r.error || 'No se pudo guardar')
    return r
  }

  async function subir(blobs, titulos = [], categorias = []) {
    setError('')
    try {
      for (const [i, b] of [...blobs].entries()) {
        setSubiendo(`Subiendo ${i + 1} de ${blobs.length}…`)
        await enviar({ accion: 'subir', seccion, ...(await prepararFoto(b)), titulo: titulos[i] || '', categoria: categorias[i] || categoria })
      }
      await cargar()
    } catch (e) { setError(e.message); await cargar() }
    finally { setSubiendo('') }
  }

  async function copiarEjemplo() {
    setSubiendo('Copiando las fotos de ejemplo…')
    const ejemplo = FOTOS_EJEMPLO[seccion]
    try {
      const blobs = await Promise.all(ejemplo.map(f => fetch(f.url).then(r => r.blob())))
      await subir(blobs, ejemplo.map(f => f.titulo), ejemplo.map(f => f.categoria || ''))
    } catch (e) { setError(e.message); setSubiendo('') }
  }

  async function accion(body) {
    setError('')
    try { await enviar(body); await cargar() } catch (e) { setError(e.message) }
  }

  const propias = fotos?.[seccion] || []
  const ejemplo = FOTOS_EJEMPLO[seccion] || []
  const S = SECCIONES_WEB[seccion]
  function mover(i, d) {
    const ids = propias.map(f => f.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    setFotos(f => ({ ...f, [seccion]: ids.map(id => propias.find(p => p.id === id)) }))
    accion({ accion: 'ordenar', seccion, ids })
  }

  return (
    <div data-testid="fotos-web">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={styles.sectionTitle}>Fotos de la web</h2>
        <a href={DONDE[seccion]} target="_blank" rel="noreferrer" style={{ ...styles.btnSecondary, textDecoration: 'none' }}>Ver en la web ↗</a>
      </div>
      <p style={{ color: C.textSub, fontSize: 13, marginTop: 0, marginBottom: 16 }}>Sube fotos desde el celular o el computador. Se achican solas y aparecen en la web en unos minutos.</p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }} role="tablist" aria-label="Sección">
        {Object.entries(SECCIONES_WEB).map(([k, s]) => (
          <button key={k} type="button" role="tab" aria-selected={seccion === k} onClick={() => setSeccion(k)} style={{ ...styles.tab, ...(seccion === k ? styles.tabActive : {}) }}>
            {s.nombre}{fotos?.[k]?.length ? ` (${fotos[k].length})` : ''}
          </button>
        ))}
      </div>

      {error && <div style={styles.errorBox} role="alert">{error}</div>}

      <div style={{ ...styles.card, marginBottom: 16 }}>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: C.text }}>{S.ayuda}{S.max === 1 ? ' Al subir otra, reemplaza a la actual.' : ''}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {seccion === 'galeria' && (
            <select aria-label="Categoría de las fotos nuevas" value={categoria} onChange={e => setCategoria(e.target.value)} style={{ ...styles.input, width: 'auto' }}>
              {Object.entries(CATEGORIAS_GALERIA).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          )}
          <button type="button" style={styles.btnPrimary} disabled={Boolean(subiendo)} onClick={() => input.current?.click()}>{subiendo || (S.max === 1 ? '📷 Subir foto' : '📷 Subir fotos')}</button>
          <input ref={input} type="file" accept="image/*" multiple={S.max > 1} hidden data-testid="subir-foto-web" onChange={e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) subir(f) }} />
        </div>
      </div>

      {!fotos ? <p style={styles.empty}>Cargando…</p> : propias.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
          {propias.map((f, i) => (
            <Foto key={f.id} foto={f} seccion={seccion} primera={i === 0} ultima={i === propias.length - 1}
              onMover={d => mover(i, d)} onEditar={c => accion({ accion: 'editar', id: f.id, ...c })}
              onBorrar={() => window.confirm('¿Borrar esta foto de la web? (queda en la papelera de Drive)') && accion({ accion: 'borrar', id: f.id })} />
          ))}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.textSub }}>Todavía no subes fotos aquí: la web muestra estas {ejemplo.length} de ejemplo.</p>
            <button type="button" style={styles.btnSecondary} disabled={Boolean(subiendo)} onClick={copiarEjemplo}>Copiar las de ejemplo para editarlas</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, opacity: .75 }}>
            {ejemplo.map(f => <img key={f.id} src={f.mini} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8 }} />)}
          </div>
        </div>
      )}
    </div>
  )
}
