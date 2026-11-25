import React, { useEffect, useRef, useState } from 'react'
import { C, QUOTE_STATUS_LABELS, apiFetch, styles } from './utils.js'
import { LugarWhatsapp } from './MarcoWhatsapp.jsx'
import { mensajePregunta } from '../../netlify/functions/lib/seguimiento-whatsapp.mjs'
import {
  ANCHO_MAX, ANCHO_MIN, EVENTO_PARA_ENVIAR, ZOOMS, abrirChatEnMarco, buscarClientes, extensionInstalada,
  guardarAncho, guardarZoom, inicioMarco, leerZoom, suscribir, telefonoLegible,
} from './whatsappPanel.js'

const VERDE = '#15803d'
export const boton = { border: '1px solid ' + C.border, background: 'white', borderRadius: 8, padding: '4px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: C.textSub, whiteSpace: 'nowrap' }
export const botonVerde = { ...boton, color: VERDE, borderColor: '#86efac' }

// Boton que copia un texto y avisa "✓ Copiado" un momento.
export function Copiar({ texto, children, estilo = boton, titulo }) {
  const [listo, setListo] = useState(false)
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setListo(true); setTimeout(() => setListo(false), 1500) } catch { /* sin permiso de portapapeles */ }
  }
  return <button type="button" onClick={copiar} title={titulo} style={estilo}>{listo ? '✓ Copiado' : children}</button>
}

// Lo que mando un boton de WhatsApp del panel (Preguntar, WhatsApp al cliente, recordatorios...):
// el mensaje queda copiado para pegarlo en el chat, o se abre su chat con el mensaje escrito.
export function ParaEnviar({ envio, onAbrirChat, onCerrar }) {
  return (
    <div data-testid="whatsapp-para-enviar" style={{ border: '1px solid #86efac', background: '#F0FDF4', borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
        <strong style={{ color: C.text }}>{envio.cliente || 'Mensaje listo'}</strong>
        {envio.telefono && <span style={{ color: C.textSub }}>{telefonoLegible(envio.telefono)}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: VERDE, fontWeight: 700 }}>{envio.copiado ? '✓ Mensaje copiado' : ''}</span>
        <button type="button" aria-label="Quitar" onClick={onCerrar} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 14, padding: 0 }}>✕</button>
      </div>
      {envio.texto && <div style={{ fontSize: 12, color: C.textSub, whiteSpace: 'pre-wrap', maxHeight: 72, overflowY: 'auto', background: 'white', borderRadius: 6, padding: '5px 7px', border: '1px solid ' + C.border }}>{envio.texto}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {envio.texto && <Copiar texto={envio.texto}>Copiar mensaje</Copiar>}
        {envio.telefono && <Copiar texto={telefonoLegible(envio.telefono)}>Copiar número</Copiar>}
        {envio.telefono && <button type="button" style={botonVerde} title="Abre su chat aquí con el mensaje escrito. No se envía: tú lo revisas y das Enter." onClick={() => onAbrirChat(envio.telefono, envio.texto)}>Abrir su chat</button>}
      </div>
    </div>
  )
}

// Buscar un cliente entre las cotizaciones para copiar su numero o el mensaje de seguimiento.
function BuscarCliente({ onAbrirChat }) {
  const [texto, setTexto] = useState('')
  const [cotizaciones, setCotizaciones] = useState(null)
  const [error, setError] = useState('')
  const cargar = async () => {
    if (cotizaciones) return
    try {
      const data = await apiFetch('/.netlify/functions/get-quotes')
      if (data.ok) setCotizaciones(data.quotes || []); else setError(data.error || 'No se pudieron cargar los clientes')
    } catch { setError('No se pudieron cargar los clientes') }
  }
  const resultados = cotizaciones ? buscarClientes(cotizaciones, texto) : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input type="search" value={texto} onFocus={cargar} onChange={e => { setTexto(e.target.value); cargar() }}
        placeholder="Buscar cliente: nombre, N°, teléfono o dirección" aria-label="Buscar cliente"
        style={{ ...styles.input, padding: '7px 10px', fontSize: 13 }} />
      {error && <div style={{ fontSize: 12, color: C.red }}>{error}</div>}
      {texto && cotizaciones && !resultados.length && <div style={{ fontSize: 12, color: C.textMuted }}>Nadie con “{texto}”.</div>}
      {resultados.length > 0 && (
        <div data-testid="whatsapp-resultados" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
          {resultados.map(q => {
            const estado = QUOTE_STATUS_LABELS[q.status] || QUOTE_STATUS_LABELS['por confirmar']
            return (
              <div key={q.cotNum} style={{ border: '1px solid ' + C.border, borderRadius: 8, padding: '6px 8px', background: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <strong style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre || 'Sin nombre'}</strong>
                  <span style={{ color: C.textMuted }}>N° {q.cotNum}</span>
                  <span style={{ ...styles.badge(estado.color), fontSize: 9.5, padding: '1px 7px', marginLeft: 'auto' }}>{estado.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: C.textSub }}>{q.telefono ? telefonoLegible(q.telefono) : 'Sin teléfono'}</span>
                  {q.telefono && <Copiar texto={telefonoLegible(q.telefono)}>Copiar número</Copiar>}
                  {q.status === 'por confirmar' && <Copiar texto={mensajePregunta(q)} titulo={mensajePregunta(q)}>Copiar seguimiento</Copiar>}
                  {q.telefono && <button type="button" style={botonVerde} onClick={() => onAbrirChat(q.telefono, '')}>Abrir su chat</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Tamaño de WhatsApp: achicarlo deja ver la lista y el chat en poco ancho. Vale para todo el panel.
export function ControlZoom() {
  const [zoom, setZoom] = useState(leerZoom)
  useEffect(() => suscribir(() => setZoom(leerZoom())), [])
  const cambiar = paso => guardarZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(zoom) + paso))])
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title="Tamaño de WhatsApp: más chico cabe más">
      <button type="button" onClick={() => cambiar(-1)} disabled={zoom === ZOOMS[0]} aria-label="Achicar WhatsApp" style={{ ...boton, padding: '4px 8px' }}>A−</button>
      <span style={{ fontSize: 11, color: C.textMuted, minWidth: 30, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={() => cambiar(1)} disabled={zoom === ZOOMS.at(-1)} aria-label="Agrandar WhatsApp" style={{ ...boton, padding: '4px 8px' }}>A+</button>
    </span>
  )
}

// Como instalar la extension, cuando falta: sin ella WhatsApp Web no se deja mostrar aqui.
export function SinExtension({ onReintentar }) {
  const paso = { margin: '0 0 8px', fontSize: 13, color: C.textSub, lineHeight: 1.45 }
  return (
    <div data-testid="whatsapp-sin-extension" style={{ padding: 18, overflowY: 'auto' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 6 }}>Falta instalar la extensión</div>
      <p style={paso}>WhatsApp Web no se deja abrir dentro de otra página. Esta extensión de Chrome lo permite solo para este panel. No lee ni envía mensajes: tú usas WhatsApp como siempre.</p>
      <ol style={{ ...paso, paddingLeft: 18 }}>
        <li style={{ marginBottom: 6 }}><a href="/whatsapp-en-el-panel.zip" download style={{ color: C.orangeDark, fontWeight: 700 }}>Descarga la extensión</a> y descomprímela (clic derecho → Extraer todo).</li>
        <li style={{ marginBottom: 6 }}>En Chrome abre <code>chrome://extensions</code> y activa <b>Modo de desarrollador</b> (arriba a la derecha).</li>
        <li style={{ marginBottom: 6 }}>Toca <b>Cargar descomprimida</b> y elige la carpeta que extrajiste.</li>
        <li>Recarga el panel y vuelve a abrir WhatsApp. La primera vez escaneas el código QR con tu teléfono.</li>
      </ol>
      <button type="button" onClick={onReintentar} style={{ ...styles.btnSecondary, marginTop: 6 }}>Ya la instalé</button>
    </div>
  )
}

export default function VentanaWhatsapp({ visible, ancho, onAncho, onCerrar }) {
  const [hayExtension, setHayExtension] = useState(extensionInstalada)
  const [envio, setEnvio] = useState(null)
  const [herramientas, setHerramientas] = useState(true)
  const [arrastrando, setArrastrando] = useState(false)

  // Los botones de WhatsApp del panel mandan aca su mensaje: queda a la vista y copiado.
  useEffect(() => {
    if (!visible) return
    const recibir = async ev => {
      const { telefono = '', texto = '', cliente = '' } = ev.detail || {}
      let copiado = false
      if (texto) { try { await navigator.clipboard.writeText(texto); copiado = true } catch { /* sin permiso */ } }
      setEnvio({ telefono, texto, cliente, copiado })
      setHerramientas(true)
    }
    window.addEventListener(EVENTO_PARA_ENVIAR, recibir)
    return () => window.removeEventListener(EVENTO_PARA_ENVIAR, recibir)
  }, [visible])

  const abrirChat = abrirChatEnMarco
  const inicio = inicioMarco

  // Arrastrar el borde izquierdo cambia el ancho (mientras se arrastra, una capa evita que el
  // iframe se quede con el mouse).
  const empezarArrastre = ev => {
    ev.preventDefault()
    setArrastrando(true)
    const mover = e => onAncho(Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, window.innerWidth - e.clientX)))
    const soltar = e => {
      setArrastrando(false)
      guardarAncho(Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, window.innerWidth - e.clientX)))
      window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar)
    }
    window.addEventListener('mousemove', mover); window.addEventListener('mouseup', soltar)
  }

  return (
    <aside data-testid="ventana-whatsapp" aria-label="WhatsApp" style={{ display: visible ? 'flex' : 'none', flexDirection: 'column', position: 'fixed', top: 0, right: 0, bottom: 0, width: ancho, background: C.surface, borderLeft: '1px solid ' + C.border, zIndex: 45, boxShadow: '-4px 0 16px rgba(0,0,0,.05)' }}>
      <div onMouseDown={empezarArrastre} title="Arrastra para cambiar el ancho" style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 2 }} />
      {arrastrando && <div style={{ position: 'fixed', inset: 0, cursor: 'col-resize', zIndex: 60 }} />}
      <div style={{ height: 56, boxSizing: 'border-box', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', flexShrink: 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#25D366' }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>WhatsApp</span>
        <button type="button" onClick={() => setHerramientas(v => !v)} aria-expanded={herramientas} style={{ ...boton, marginLeft: 8 }}>{herramientas ? 'Ocultar herramientas' : 'Herramientas'}</button>
        {hayExtension && <button type="button" onClick={inicio} title="Vuelve a la lista de chats" style={boton}>↻</button>}
        {hayExtension && <ControlZoom />}
        <button type="button" onClick={onCerrar} aria-label="Cerrar WhatsApp" title="Cerrar (sigue cargado: al abrir vuelve donde estabas)" style={{ ...boton, marginLeft: 'auto' }}>✕</button>
      </div>
      {herramientas && (
        <div data-testid="whatsapp-herramientas" style={{ padding: 10, borderBottom: '1px solid ' + C.border, background: '#FAFAFA', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, maxHeight: '45vh', overflowY: 'auto' }}>
          {envio && <ParaEnviar envio={envio} onAbrirChat={abrirChat} onCerrar={() => setEnvio(null)} />}
          <BuscarCliente onAbrirChat={abrirChat} />
        </div>
      )}
      {hayExtension
        ? <LugarWhatsapp />
        : <SinExtension onReintentar={() => setHayExtension(extensionInstalada())} />}
    </aside>
  )
}
