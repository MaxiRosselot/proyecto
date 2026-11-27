import React, { useState } from 'react'
import { C } from './utils.js'
import { dejarEnSuChat, extensionInstalada } from './whatsappPanel.js'

// Copia un mensaje para pegarlo en WhatsApp. Al copiar muestra el texto (por si el
// portapapeles falla, se puede seleccionar a mano). compacto: solo el boton, para tablas.
// Con telefono y la extension de WhatsApp (PC), al lado sale "En su chat": lo deja escrito en el
// chat del cliente en el WhatsApp del panel (y copiado por si acaso). No se envia: das Enter tu.
export default function CopiarMensaje({ texto, etiqueta, compacto = false, estilo = {}, telefono = '' }) {
  const [estado, setEstado] = useState('')
  const [enChat, setEnChat] = useState('')
  const [ver, setVer] = useState(false)

  async function copiar(e) {
    e.stopPropagation()
    try { await navigator.clipboard.writeText(texto); setEstado('ok') }
    catch { setEstado('error') }
    if (!compacto) setVer(true)
    setTimeout(() => setEstado(''), 2500)
  }

  async function dejarEnChat(e) {
    e.stopPropagation()
    navigator.clipboard?.writeText(texto).catch(() => {})
    setEnChat(await dejarEnSuChat(telefono, texto) ? 'ok' : 'error')
    setTimeout(() => setEnChat(''), 3000)
  }

  const base = {
    padding: compacto ? '2px 6px' : '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    border: '1.5px solid #25D366', ...estilo,
  }
  const boton = (
    <button type="button" onClick={copiar} title={'Copia el mensaje para pegarlo en WhatsApp'}
      style={{ ...base, background: estado === 'ok' ? '#25D366' : 'white', color: estado === 'ok' ? 'white' : '#128C7E' }}>
      {estado === 'ok' ? '✓ Copiado' : estado === 'error' ? 'Cópialo abajo' : etiqueta}
    </button>
  )
  const chat = telefono && extensionInstalada() && (
    <button type="button" onClick={dejarEnChat} data-testid="en-su-chat" title="Lo deja escrito en su chat (WhatsApp del panel). No se envía: das Enter tú."
      style={{ ...base, background: enChat === 'ok' ? 'white' : '#25D366', color: enChat === 'ok' ? '#128C7E' : 'white' }}>
      {enChat === 'ok' ? '✓ En su chat: da Enter' : enChat === 'error' ? 'Abre WhatsApp y repite' : '💬 En su chat'}
    </button>
  )
  if (compacto) return chat ? <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{boton}{chat}</span> : boton
  return (
    <span style={{ display: 'contents' }}>
      {boton}
      {chat}
      {ver && (
        <div style={{ flexBasis: '100%', position: 'relative' }}>
          <textarea readOnly value={texto} onFocus={e => e.target.select()} rows={Math.min(14, texto.split('\n').length + 1)} data-testid="mensaje-copiado"
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, lineHeight: 1.45, padding: '8px 10px', borderRadius: 8, border: '1px solid ' + C.border, background: '#F7FBF8', color: C.text, fontFamily: 'inherit', resize: 'vertical' }} />
          <button type="button" onClick={() => setVer(false)} style={{ position: 'absolute', top: 4, right: 6, background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 12 }}>Ocultar</button>
        </div>
      )}
    </span>
  )
}
