import React, { useState } from 'react'
import { C, apiFetch, styles } from './utils.js'
import { dibujarVistas } from './regenerarPdf.js'
import { textoFichaMaestro } from './fichaMaestro.js'

// "Ficha para el maestro": la isometrica del trabajo y el texto (hora, cliente, terciados, laterales,
// colgador y servicios). En el celular, "Compartir" manda la imagen con el texto a WhatsApp; en el
// computador se copian por separado.
const VERDE = '#25D366'

async function aBlob(dataUrl) { return (await fetch(dataUrl)).blob() }

export default function FichaMaestro({ q, tamano = 12 }) {
  const [abierta, setAbierta] = useState(false)
  const [estado, setEstado] = useState({ cargando: false, imagen: '', texto: '', error: '' })
  const [aviso, setAviso] = useState('')

  async function abrir() {
    setAbierta(true); setAviso('')
    setEstado({ cargando: true, imagen: '', texto: textoFichaMaestro(q), error: '' })
    try {
      // La lista de cotizaciones viene sin el modelo 3D: se pide la cotizacion completa.
      const r = await apiFetch('/.netlify/functions/get-quotes?cotNum=' + encodeURIComponent(q.cotNum))
      const completa = r.ok && r.quote ? { ...q, ...r.quote, instalacion: q.instalacion || r.quote.instalacion } : q
      const texto = textoFichaMaestro(completa)
      if (!completa.proyecto3d) { setEstado({ cargando: false, imagen: '', texto, error: 'Esta cotización no tiene modelo 3D.' }); return }
      const vistas = await dibujarVistas(completa.proyecto3d, [{ view: 'isometric', width: 900, height: 900 }])
      setEstado({ cargando: false, imagen: vistas.isometric, texto, error: '' })
    } catch (e) { setEstado(s => ({ ...s, cargando: false, error: 'No se pudo dibujar el 3D: ' + e.message })) }
  }

  const avisar = t => { setAviso(t); setTimeout(() => setAviso(''), 2500) }
  async function copiarTexto() {
    try { await navigator.clipboard.writeText(estado.texto); avisar('✓ Texto copiado') } catch { window.prompt('Copia el texto:', estado.texto) }
  }
  async function copiarImagen() {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await aBlob(estado.imagen) })]); avisar('✓ Imagen copiada: pégala en WhatsApp') }
    catch { avisar('Tu navegador no deja copiar imágenes: usa Descargar') }
  }
  async function compartir() {
    const archivo = new File([await aBlob(estado.imagen)], `Instalacion ${q.cotNum}.png`, { type: 'image/png' })
    try { await navigator.share({ files: [archivo], text: estado.texto }) } catch (e) { if (e.name !== 'AbortError') avisar('No se pudo compartir: copia el texto y la imagen') }
  }
  const puedeCompartir = (() => {
    try { return Boolean(estado.imagen && navigator.canShare?.({ files: [new File([''], 'x.png', { type: 'image/png' })] })) } catch { return false }
  })()

  const boton = { ...styles.btnSecondary, fontSize: tamano, padding: tamano < 13 ? '6px 14px' : '8px 16px' }
  return (
    <>
      <button type="button" onClick={abrir} style={boton}>👷 Ficha para el maestro</button>
      {abierta && (
        <div role="dialog" aria-modal="true" aria-label="Ficha para el maestro" data-testid="ficha-maestro"
          onClick={e => { if (e.target === e.currentTarget) setAbierta(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', padding: 12 }}>
          <div style={{ ...styles.card, width: 'min(520px, 100%)', maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ ...styles.sectionTitle, fontSize: 17 }}>Ficha para el maestro · N° {q.cotNum}</h3>
              <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar" style={{ ...styles.btnSecondary, padding: '4px 10px' }}>×</button>
            </div>
            {estado.cargando && <div style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', background: C.bg, borderRadius: 10, color: C.textSub, fontSize: 13 }}>Dibujando el 3D…</div>}
            {estado.imagen && <img src={estado.imagen} alt="Vista isométrica del trabajo" style={{ width: '100%', borderRadius: 10, border: `1px solid ${C.border}` }} />}
            {estado.error && <div style={styles.errorBox}>{estado.error}</div>}
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, background: C.bg, padding: 12, borderRadius: 10 }} data-testid="ficha-texto">{estado.texto}</pre>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {puedeCompartir && <button type="button" onClick={compartir} style={{ ...boton, background: VERDE, borderColor: VERDE, color: 'white', fontWeight: 700 }}>Compartir por WhatsApp</button>}
              <button type="button" onClick={copiarTexto} style={boton}>📋 Copiar texto</button>
              {estado.imagen && <button type="button" onClick={copiarImagen} style={boton}>🖼️ Copiar imagen</button>}
              {estado.imagen && <a href={estado.imagen} download={`Instalacion ${q.cotNum}.png`} style={{ ...boton, textDecoration: 'none' }}>⬇️ Descargar imagen</a>}
            </div>
            {aviso && <div role="status" style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>{aviso}</div>}
          </div>
        </div>
      )}
    </>
  )
}
