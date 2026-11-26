import React, { useEffect, useState } from 'react'
import { C, styles } from './utils.js'
import { EVENTO_ABRIR_VENTANA, adjuntarEnChat, enfocarMarco, extensionInstalada, hayMarco, ventanaWhatsappAbierta } from './whatsappPanel.js'

// Desde el cotizador, recien hecha la cotizacion: deja el PDF en el chat del cliente (WhatsApp de la
// derecha) y, cuando lo envias, el mensaje de agendamiento queda escrito para el siguiente Enter.
// Nada se envia solo. El mensaje tambien queda copiado, por si WhatsApp no lo toma.
const VERDE = '#25D366'
const TONOS = { verde: '#15803D', ambar: '#B45309', rojo: '#B91C1C' }

function descargar(blob, nombre) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}

export default function PdfAlChat({ blob, telefono, nombre, mensaje, tamano = 13 }) {
  const [estado, setEstado] = useState({ texto: '', tono: '' })
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { setEstado({ texto: '', tono: '' }) }, [blob])
  if (!extensionInstalada() || !blob || !telefono) return null
  const archivo = `Cotizacion ${(nombre || 'cliente').trim()} - Repisas Don Maxi.pdf`

  async function dejar() {
    if (mensaje) navigator.clipboard?.writeText(mensaje).catch(() => {})
    if (!ventanaWhatsappAbierta()) window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_VENTANA))
    if (!hayMarco()) { setEstado({ texto: 'Abrí WhatsApp: cuando cargue, vuelve a tocar el botón.', tono: 'ambar' }); return }
    setOcupado(true); setEstado({ texto: 'Dejándolo en su chat… (un PDF grande tarda unos segundos)', tono: '' })
    try {
      const res = await adjuntarEnChat(telefono, { archivo: blob, nombre: archivo, despues: mensaje })
      if (res.ok) {
        setEstado({ texto: '✓ PDF en su chat: da Enter en WhatsApp y después queda escrito el mensaje para agendar (otro Enter).', tono: 'verde' })
        enfocarMarco()
      } else if (res.motivo === 'sin-whatsapp') setEstado({ texto: 'WhatsApp dice que este número no existe.', tono: 'rojo' })
      else {
        descargar(blob, archivo)
        setEstado({ texto: 'No pude dejarlo en el chat (¿WhatsApp abierto y la extensión al día?). Lo descargué y el mensaje quedó copiado.', tono: 'ambar' })
      }
    } finally { setOcupado(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button type="button" onClick={dejar} disabled={ocupado} data-testid="pdf-al-chat"
        title="Deja el PDF en el chat del cliente (WhatsApp de la derecha) y, al enviarlo, el mensaje para agendar escrito. Nada se envía solo."
        style={{ ...styles.btnSecondary, fontSize: tamano, padding: tamano < 13 ? '6px 14px' : '8px 16px', background: VERDE, borderColor: VERDE, color: 'white', fontWeight: 700 }}>
        📄 {ocupado ? 'Preparando…' : 'PDF + mensaje a su WhatsApp'}
      </button>
      {estado.texto && <span data-testid="estado-pdf-al-chat" style={{ fontSize: 12, maxWidth: 360, color: TONOS[estado.tono] || C.textSub }}>{estado.texto}</span>}
    </div>
  )
}
