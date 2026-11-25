import React, { useEffect, useRef, useState } from 'react'
import { URL_WHATSAPP_WEB, leerZoom, lugarVisible, pedirLugar, registrarMarco, suscribir } from './whatsappPanel.js'

// El unico WhatsApp Web del panel. Flota (position fixed) sobre el lugar visible que lo pidio y se
// esconde si no hay ninguno, sin descargarse. Achicado con transform: WhatsApp cree tener mas ancho.
export default function MarcoWhatsapp() {
  const ref = useRef(null)
  const [zoom, setZoom] = useState(leerZoom)
  useEffect(() => suscribir(() => setZoom(leerZoom())), [])
  useEffect(() => {
    registrarMarco(ref.current)
    let previo = '', cuadro
    const seguir = () => {
      const r = lugarVisible()
      const el = ref.current
      const clave = r ? [r.top, r.left, r.width, r.height].map(Math.round).join() : 'oculto'
      if (el && clave !== previo) {
        previo = clave
        if (r) Object.assign(el.style, { visibility: 'visible', pointerEvents: 'auto', top: r.top + 'px', left: r.left + 'px', width: r.width / zoom + 'px', height: r.height / zoom + 'px', transform: `scale(${zoom})` })
        else Object.assign(el.style, { visibility: 'hidden', pointerEvents: 'none' })
      }
      cuadro = requestAnimationFrame(seguir)
    }
    seguir()
    return () => { cancelAnimationFrame(cuadro); registrarMarco(null) }
  }, [zoom])
  return <iframe ref={ref} src={URL_WHATSAPP_WEB} title="WhatsApp Web" data-testid="marco-whatsapp"
    allow="clipboard-read; clipboard-write; microphone; camera; autoplay; fullscreen"
    style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, border: 0, transformOrigin: '0 0', zIndex: 46, visibility: 'hidden', background: 'white' }} />
}

// El hueco donde se ve WhatsApp: un div que pide el marco mientras esta montado.
export function LugarWhatsapp({ style }) {
  const ref = useRef(null)
  useEffect(() => pedirLugar(ref.current), [])
  return <div ref={ref} data-testid="lugar-whatsapp" style={{ flex: 1, minHeight: 0, minWidth: 0, background: '#F0F2F5', ...style }} />
}
