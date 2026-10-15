import React, { useState } from 'react'
import { styles } from './utils.js'
import { linkWhatsapp, mensajeCotizacion } from '../../netlify/functions/lib/mensajes.mjs'

const VERDE = '#25D366'
const nombreArchivo = nombre => `Cotizacion ${(nombre || 'cliente').trim()} - Repisas Don Maxi.pdf`

// En el celular (y en Windows con WhatsApp instalado) el menu de compartir manda el PDF adjunto.
function archivoCompartible(blob, nombre) {
  if (!blob || typeof File === 'undefined' || !navigator.canShare) return null
  const archivo = new File([blob], nombreArchivo(nombre), { type: 'application/pdf' })
  try { return navigator.canShare({ files: [archivo] }) ? archivo : null } catch { return null }
}

// Copia el link de la cotizacion: ahi el cliente elige su dia y paga.
export function CopiarLink({ link, texto = 'Copiar link para agendar y pagar', tamano = 12 }) {
  const [copiado, setCopiado] = useState(false)
  if (!link) return null
  async function copiar() {
    try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }
    catch { window.prompt('Copia el link:', link) }
  }
  return (
    <button type="button" onClick={copiar} title={link}
      style={{ ...styles.btnSecondary, fontSize: tamano, padding: tamano < 13 ? '6px 14px' : '8px 16px' }}>
      {copiado ? '✓ Link copiado' : texto}
    </button>
  )
}

// Botones para mandar la cotizacion por WhatsApp sin descargarla:
// - "WhatsApp al cliente" abre el chat con su numero y el mensaje con el link al PDF.
// - "Compartir PDF" adjunta el archivo mismo, cuando el dispositivo lo permite.
// soloWhatsapp: solo el boton de WhatsApp, para el aviso de "Siguiente paso".
export default function EnviarCotizacion({ cotizacion, pdfBlob, tamano = 13, soloWhatsapp = false }) {
  const [aviso, setAviso] = useState('')
  const archivo = archivoCompartible(pdfBlob, cotizacion.nombre)
  const boton = { ...styles.btnSecondary, fontSize: tamano, padding: tamano < 13 ? '6px 14px' : '8px 16px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }

  async function compartir() {
    setAviso('')
    try { await navigator.share({ files: [archivo], text: mensajeCotizacion({ ...cotizacion, pdfUrl: '' }) }) }
    catch (e) { if (e.name !== 'AbortError') setAviso('No se pudo abrir el menú de compartir. Usa "WhatsApp al cliente".') }
  }

  return (
    <>
      <a href={linkWhatsapp(cotizacion.telefono, mensajeCotizacion(cotizacion))} target="_blank" rel="noreferrer"
        title={cotizacion.telefono ? 'Abre el chat con ' + cotizacion.telefono : 'Sin teléfono: WhatsApp te pedirá elegir el contacto'}
        style={{ ...boton, background: VERDE, borderColor: VERDE, color: 'white' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>
        {soloWhatsapp ? 'Enviar por WhatsApp' : 'WhatsApp al cliente'}
      </a>
      {soloWhatsapp ? null : <>
      {archivo && <button type="button" onClick={compartir} style={boton}>Compartir PDF</button>}
      {!cotizacion.pdfUrl && <span style={{ fontSize: 12, color: '#B45309', alignSelf: 'center' }}>Sin link de Drive: el mensaje va sin el PDF.</span>}
      {aviso && <span style={{ fontSize: 12, color: '#B91C1C', alignSelf: 'center' }}>{aviso}</span>}
      </>}
    </>
  )
}
