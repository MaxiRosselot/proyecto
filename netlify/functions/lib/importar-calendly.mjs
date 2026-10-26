// Visitas antiguas de Calendly (Calendly → Events → Export → CSV) a la hoja "Visitas" de la planilla
// principal, para verlas en el panel, en el mapa de concentracion y hacerles seguimiento.
//   · ID: "calendly-<Invitee UUID>"; si ya esta en la hoja no se vuelve a agregar.
//   · Estado: las pasadas quedan "realizada" (o "realizada_cotizada" si el cliente tiene una
//     cotizacion: mismo correo, telefono o nombre), las marcadas como no-show y las canceladas,
//     "cancelada"; las futuras, "agendada".
//   · Fecha y hora en formato AAAA-MM-DD y HH:MM (asi get-visits las puede leer).
// Sin imports de Node.
import { comunaAproximada, comunaDe } from './zonas.mjs'

// Columnas de la hoja Visitas: las de siempre (A–J) y las de las visitas que viven solo en la hoja.
export const ENCABEZADOS_VISITAS = ['ID', 'Nombre', 'Fecha', 'Hora', 'Email', 'Celular', 'Dirección', 'Estado', 'Notas', 'Actualizado', 'Origen', 'Comuna', 'Lat', 'Lng']

// CSV con comillas (los campos pueden traer comas y saltos de linea).
export function leerCSV(texto) {
  const filas = []
  let fila = [], campo = '', comillas = false
  const t = String(texto || '').replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  const [encabezado = [], ...datos] = filas.filter(f => f.some(x => x.trim()))
  return datos.map(f => Object.fromEntries(encabezado.map((h, i) => [h.trim(), (f[i] ?? '').trim()])))
}

const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const digitos = s => String(s || '').replace(/\D/g, '')
const ultimos8 = s => digitos(s).slice(-8)
const pareceTelefono = s => digitos(s).length >= 8 && digitos(s).length <= 12

function telefonoDe(r) {
  const candidatos = [r['Location'], r['Text Reminder Number'], ...Object.keys(r).filter(k => /^Question \d+$/.test(k) && /tel[eé]fono|celular|whatsapp/i.test(r[k])).map(k => r[k.replace('Question', 'Response')])]
  const t = candidatos.map(x => String(x || '').replace(/^'/, '').trim()).find(pareceTelefono)
  return t || ''
}
function direccionDe(r) {
  const k = Object.keys(r).find(k => /^Question \d+$/.test(k) && /direcci[oó]n/i.test(r[k]))
  return (k ? r[k.replace('Question', 'Response')] : '').replace(/\s+/g, ' ').trim()
}

// filas: lo que devuelve leerCSV. cotizaciones: las de la planilla (para saber si ya se cotizo).
// existentes: los ID que ya estan en la hoja. ahora: para separar pasadas de futuras.
export function visitasDesdeCalendly(filas, { cotizaciones = [], existentes = new Set(), ahora = new Date() } = {}) {
  const porCorreo = new Set(cotizaciones.map(q => normalizar(q.email)).filter(Boolean))
  const porTelefono = new Set(cotizaciones.map(q => ultimos8(q.telefono)).filter(t => t.length === 8))
  const porNombre = new Set(cotizaciones.map(q => normalizar(q.nombre)).filter(n => n.split(' ').length >= 2))
  const hoy = ahora.toISOString().slice(0, 10)
  const resumen = { leidas: filas.length, nuevas: 0, repetidas: 0, sinFecha: 0, porEstado: {}, sinComuna: 0 }
  const nuevas = []
  for (const r of filas) {
    const uuid = r['Invitee UUID'] || r['Event UUID']
    const [fecha, hora] = String(r['Start Date & Time'] || '').split(' ')
    if (!uuid || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) { resumen.sinFecha++; continue }
    const id = `calendly-${uuid}`
    if (existentes.has(id) || nuevas.some(v => v[0] === id)) { resumen.repetidas++; continue }
    const nombre = r['Invitee Name'] || [r['Invitee First Name'], r['Invitee Last Name']].filter(Boolean).join(' ')
    const email = r['Invitee Email'] || '', telefono = telefonoDe(r), direccion = direccionDe(r)
    const cotizada = porCorreo.has(normalizar(email)) || (ultimos8(telefono).length === 8 && porTelefono.has(ultimos8(telefono))) || porNombre.has(normalizar(nombre))
    const cancelada = r['Canceled'] === 'true' || r['Marked as No-Show'] === 'Yes'
    const estado = cancelada ? 'cancelada' : fecha >= hoy ? 'agendada' : cotizada ? 'realizada_cotizada' : 'realizada'
    const notas = [
      'Importada de Calendly',
      r['Marked as No-Show'] === 'Yes' ? 'No se presentó' : '',
      r['Cancellation reason'] ? `Canceló: ${r['Cancellation reason']}` : '',
      r['Meeting Notes'] || '',
    ].filter(Boolean).join(' · ')
    const comuna = comunaAproximada(direccion) || ''
    if (!comuna) resumen.sinComuna++
    resumen.porEstado[estado] = (resumen.porEstado[estado] || 0) + 1
    nuevas.push([id, nombre, fecha, (hora || '').slice(0, 5), email, telefono, direccion, estado, notas, '', 'Calendly', comuna, '', ''])
  }
  resumen.nuevas = nuevas.length
  return { nuevas, resumen }
}

// Una fila de la hoja que no es un evento del calendario (Calendly, o cargada a mano) como visita
// del panel. Las del calendario solo usan la hoja para su estado. horaLocalAUTC: de lib/horarios.mjs.
export function visitaDesdeFila(f, horaLocalAUTC) {
  const [id, nombre, fecha, hora, email, celular, direccion, estado, notas, , origen, comuna, lat, lng] = f.map(x => String(x ?? '').trim())
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const inicio = horaLocalAUTC(fecha, /^\d{1,2}:\d{2}$/.test(hora) ? hora.padStart(5, '0') : '10:00')
  return {
    id, nombre, summary: `Visita — ${nombre}`, start: inicio.toISOString(), end: new Date(inicio.getTime() + 15 * 60000).toISOString(),
    email, celular, direccion, notas, status: estado || 'realizada', origen: origen || 'Planilla', comuna: comuna || comunaDe(direccion) || '',
    ...(lat && lng && Number.isFinite(Number(lat)) ? { lat: Number(lat), lng: Number(lng) } : {}),
  }
}
