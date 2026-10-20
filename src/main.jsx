import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AdminApp from './AdminApp.jsx'
import CotizaApp from './CotizaApp.jsx'
import ReservaApp from './ReservaApp.jsx'
import AgendarApp from './AgendarApp.jsx'
import SitioApp from './sitio/SitioApp.jsx'

const container = document.getElementById('root')
const root = createRoot(container)

// El sitio (Inicio, Cotizar, Fotos, Preguntas, Contacto) es la portada; /visita es el agendador de
// visitas y /cotiza la cotizacion automatica (ojo: /cotizar es la pagina del sitio con las 3 opciones).
const ruta = window.location.pathname
if (ruta.startsWith('/visita')) document.title = 'Agenda tu visita · Repisas Don Maxi'
root.render(ruta.startsWith('/admin') ? <AdminApp />
  : /^\/cotiza\/?$/.test(ruta) ? <CotizaApp />
  : ruta.startsWith('/reserva') ? <ReservaApp />
  : ruta.startsWith('/agendar') ? <AgendarApp />
  : ruta.startsWith('/visita') ? <App />
  : <SitioApp />)
