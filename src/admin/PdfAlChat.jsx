import React, { useEffect, useState } from 'react'
import { C, styles } from './utils.js'
import { EVENTO_ABRIR_VENTANA, abrirChatEnMarco, adjuntarEnChat, chatAbiertoAhora, enfocarMarco, extensionInstalada, hayMarco, telefonoLegible, ventanaWhatsappAbierta } from './whatsappPanel.js'

// Desde el cotizador, recien hecha la cotizacion, dos botones para el chat del cliente (WhatsApp de la
// derecha): uno deja el PDF y el otro deja escrito el mensaje para agendar. Nada se envia solo: en
// cada uno das Enter en WhatsApp.
const VERDE = '#25D366'
const TONOS = { verde: '#15803D', ambar: '#B45309', rojo: '#B91C1C' }

function descargar(blob, nombre) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}

export default function PdfAlChat({ blob, telefono: delCliente, nombre, mensaje, tamano = 13 }) {
  const [estado, setEstado] = useState({ texto: '', tono: '' })
  const [ocupado, setOcupado] = useState(false)
  // Sin celular (p. ej. una visita que no lo tiene): se escribe aqui, y parte con el del chat abierto.
  const [escrito, setEscrito] = useState(() => telefonoLegible(chatAbiertoAhora()?.telefono || ''))
  useEffect(() => { setEstado({ texto: '', tono: '' }) }, [blob])
  if (!extensionInstalada() || !blob) return null
  const telefono = delCliente || escrito
  const archivo = `Cotizacion ${(nombre || 'cliente').trim()} - Repisas Don Maxi.pdf`
  const estilo = { ...styles.btnSecondary, fontSize: tamano, padding: tamano < 13 ? '6px 14px' : '8px 16px', fontWeight: 700 }

  // WhatsApp de la derecha listo: si estaba cerrada se abre; si nunca cargo, hay que esperar que cargue.
  function whatsappListo() {
    if (!ventanaWhatsappAbierta()) window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_VENTANA))
    if (hayMarco()) return true
    setEstado({ texto: 'Abrí WhatsApp: cuando cargue, vuelve a tocar el botón.', tono: 'ambar' })
    return false
  }

  function conNumero() {
    if (String(telefono).replace(/\D/g, '').length >= 8) return true
    setEstado({ texto: 'Escribe el celular del cliente.', tono: 'rojo' })
    return false
  }

  async function dejarPdf() {
    if (!conNumero() || !whatsappListo()) return
    setOcupado(true); setEstado({ texto: 'Dejándolo en su chat… (un PDF grande tarda unos segundos)', tono: '' })
    try {
      const res = await adjuntarEnChat(telefono, { archivo: blob, nombre: archivo })
      if (res.ok) {
        setEstado({ texto: '✓ PDF en su chat: da Enter en WhatsApp.' + (mensaje ? ' Después, el botón del mensaje.' : ''), tono: 'verde' })
        enfocarMarco()
      } else if (res.motivo === 'sin-whatsapp') setEstado({ texto: 'WhatsApp dice que este número no existe.', tono: 'rojo' })
      else {
        descargar(blob, archivo)
        setEstado({ texto: 'No pude dejarlo en el chat (¿WhatsApp abierto y la extensión al día?). Lo descargué: arrástralo al chat.', tono: 'ambar' })
      }
    } finally { setOcupado(false) }
  }

  function dejarMensaje() {
    navigator.clipboard?.writeText(mensaje).catch(() => {}) // por si WhatsApp no lo toma
    if (!conNumero() || !whatsappListo()) return
    abrirChatEnMarco(telefono, mensaje)
    setEstado({ texto: '✓ Mensaje escrito en su chat: revísalo y da Enter en WhatsApp.', tono: 'verde' })
    setTimeout(enfocarMarco, 400)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!delCliente && <input value={escrito} onChange={e => setEscrito(e.target.value)} placeholder="Celular del cliente" aria-label="Celular para WhatsApp"
          title="Esta cotización no tiene celular: escríbelo (parte con el del chat abierto en WhatsApp)"
          style={{ width: 150, padding: '6px 10px', borderRadius: 8, border: '1.5px solid ' + VERDE, fontSize: tamano }} />}
        <button type="button" onClick={dejarPdf} disabled={ocupado} data-testid="pdf-al-chat"
          title="Deja el PDF en el chat del cliente (WhatsApp de la derecha). No se envía: das Enter tú."
          style={{ ...estilo, background: VERDE, borderColor: VERDE, color: 'white' }}>
          📄 {ocupado ? 'Preparando…' : 'PDF a su WhatsApp'}
        </button>
        {mensaje && <button type="button" onClick={dejarMensaje} data-testid="mensaje-al-chat"
          title="Deja escrito en su chat el mensaje con el link para agendar. No se envía: das Enter tú."
          style={{ ...estilo, borderColor: VERDE, color: '#128C7E' }}>
          💬 Mensaje para agendar a su WhatsApp
        </button>}
      </div>
      {estado.texto && <span data-testid="estado-pdf-al-chat" style={{ fontSize: 12, maxWidth: 420, color: TONOS[estado.tono] || C.textSub }}>{estado.texto}</span>}
    </div>
  )
}
