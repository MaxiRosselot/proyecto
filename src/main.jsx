import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AdminApp from './AdminApp.jsx'

const container = document.getElementById('root')
const root = createRoot(container)

const isAdmin = window.location.pathname.startsWith('/admin')
root.render(isAdmin ? <AdminApp /> : <App />)
