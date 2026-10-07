import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AdminApp from './AdminApp.jsx'
import CotizaApp from './CotizaApp.jsx'

const container = document.getElementById('root')
const root = createRoot(container)

const ruta = window.location.pathname
root.render(ruta.startsWith('/admin') ? <AdminApp /> : ruta.startsWith('/cotiza') ? <CotizaApp /> : <App />)
