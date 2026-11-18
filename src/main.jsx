import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AdminApp from './AdminApp.jsx'
import CotizaApp from './CotizaApp.jsx'
import ReservaApp from './ReservaApp.jsx'
import AgendarApp from './AgendarApp.jsx'
import SitioApp from './sitio/SitioApp.jsx'
import PymeApp from './sitio/PymeApp.jsx'

const container = document.getElementById('root')
const root = createRoot(container)

// El sitio (Inicio, Cotizar, Fotos, Preguntas, Contacto) es la portada; /visita es el agendador de
// visitas y /cotiza la cotizacion automatica (ojo: /cotizar es la pagina del sitio con las 3 opciones).
const ruta = window.location.pathname
// calendai.cl es el dominio de siempre del agendador de visitas: ahi la portada es /visita, como
// era antes de que repisasdonmaxi.cl tuviera el sitio (los links viejos de Instagram, anuncios y
// WhatsApp llegan a calendai.cl). Las demas rutas (/admin, /agendar...) funcionan igual.
const esCalendai = /(^|\.)calendai\.cl$/i.test(window.location.hostname)
const agendador = ruta.startsWith('/visita') || (esCalendai && !/^\/(admin|cotiza|reserva|agendar|pyme)/.test(ruta))
if (agendador) document.title = 'Agenda tu visita · Repisas Don Maxi'
root.render(ruta.startsWith('/admin') ? <AdminApp />
  : /^\/cotiza\/?$/.test(ruta) ? <CotizaApp />
  : ruta.startsWith('/reserva') ? <ReservaApp />
  : ruta.startsWith('/agendar') ? <AgendarApp />
  : agendador ? <App />
  // /pyme: la marca para empresas (src/sitio/pyme-contenido.js).
  : /^\/pyme\/?$/.test(ruta) ? <PymeApp />
  : <SitioApp />)
