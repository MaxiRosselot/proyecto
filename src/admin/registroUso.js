// Registro de uso del panel (ver netlify/functions/lib/uso.mjs): anota sin pedir nada que botones
// se tocan, en que seccion, en celular o PC y cuanto hubo que bajar para llegar a ellos. Junta los
// conteos en el navegador y los manda de a poco; si no hay red, quedan para la proxima.
import { authHeaders, leerSesion } from './utils.js'

const PENDIENTE = 'dm_uso_pendiente'
const VISTOS = 'dm_uso_vistos'
const URL_USO = '/.netlify/functions/uso'
const CONTROLES = 'button, a[href], [role="button"], [role="tab"], [role="switch"], input[type="checkbox"], input[type="radio"], select, summary, [data-uso]'

let seccionActual = 'inicio'
let iniciado = false
let temporizadorVistos = null

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dispositivo = () => (window.innerWidth < 768 ? 'cel' : 'pc')
const leer = (clave) => { try { return JSON.parse(localStorage.getItem(clave) || '{}') || {} } catch { return {} } }
const guardar = (clave, valor) => { try { localStorage.setItem(clave, JSON.stringify(valor)) } catch { /* sin espacio o privado */ } }

// Un nombre estable para el boton: sin montos, numeros ni el nombre del cliente que va despues de ":".
export function etiquetaDe(el) {
  const crudo = el.getAttribute('data-uso') || el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') ||
    el.getAttribute('placeholder') || el.getAttribute('data-testid') || el.getAttribute('name') || ''
  return String(crudo)
    .split('\n')[0]
    .replace(/:.*$/, ':')
    .replace(/\$\s?[\d.,]+/g, '$#')
    .replace(/\d+([.,]\d+)*/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

function sumar(tipo, etiqueta, bajada = 0, seccion = seccionActual) {
  if (!etiqueta || !/\p{L}/u.test(etiqueta)) return
  const pendiente = leer(PENDIENTE)
  const clave = [hoy(), dispositivo(), tipo, seccion, etiqueta].join('|')
  const e = pendiente[clave] || { veces: 0, bajada: 0 }
  e.veces += 1; e.bajada += Math.round(bajada)
  pendiente[clave] = e
  guardar(PENDIENTE, pendiente)
}

// Cuanto esta bajada la pantalla (la pagina o el contenido con su propia barra).
function bajadaActual(el) {
  let y = window.scrollY || 0
  for (let p = el?.parentElement; p; p = p.parentElement) if (p.scrollTop > 0) y += p.scrollTop
  return y
}

function alClic(ev) {
  const el = ev.target?.closest?.(CONTROLES)
  if (!el || el.closest('[data-uso-ignorar]')) return
  // El menu de secciones (barra de abajo en el celular, columna en el PC) se cuenta aparte.
  sumar('click', etiquetaDe(el), bajadaActual(el), el.closest('nav') ? 'menu' : seccionActual)
}

// Los botones que hay en la seccion, una vez al dia por seccion y dispositivo: asi se ve lo que
// esta pero nunca se toca.
function anotarVistos() {
  const vistos = leer(VISTOS)
  const clave = [hoy(), dispositivo(), seccionActual].join('|')
  if (vistos[clave]) return
  const main = document.querySelector('main')
  if (!main) return
  const etiquetas = new Set([...main.querySelectorAll(CONTROLES)].filter(el => !el.closest('[data-uso-ignorar]')).map(etiquetaDe).filter(Boolean))
  if (!etiquetas.size) return
  for (const etiqueta of etiquetas) sumar('visto', etiqueta)
  vistos[clave] = 1
  guardar(VISTOS, Object.fromEntries(Object.entries(vistos).filter(([k]) => k.startsWith(hoy()))))
}

export async function enviarUso({ alSalir = false } = {}) {
  if (!leerSesion()) return
  const pendiente = leer(PENDIENTE)
  const claves = Object.keys(pendiente).slice(0, 400)
  if (!claves.length) return
  const eventos = claves.map((k) => {
    const [dia, disp, tipo, seccion, ...resto] = k.split('|')
    return { dia, disp, tipo, seccion, etiqueta: resto.join('|'), ...pendiente[k] }
  })
  try {
    const res = await fetch(URL_USO, {
      method: 'POST', keepalive: alSalir,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ eventos }),
    })
    if (!res.ok) return
    // Lo que se sumo mientras se enviaba se conserva: se descuenta solo lo enviado.
    const ahora = leer(PENDIENTE)
    for (const k of claves) {
      const e = ahora[k]; if (!e) continue
      e.veces -= pendiente[k].veces; e.bajada -= pendiente[k].bajada
      if (e.veces <= 0) delete ahora[k]
    }
    guardar(PENDIENTE, ahora)
  } catch { /* sin red: queda para la proxima */ }
}

export function fijarSeccionUso(seccion) {
  iniciarUso()
  if (seccion === seccionActual && temporizadorVistos) return
  seccionActual = seccion
  sumar('seccion', '(abrir)')
  clearTimeout(temporizadorVistos)
  temporizadorVistos = setTimeout(anotarVistos, 4000)
}

export function iniciarUso() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  document.addEventListener('click', alClic, true)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviarUso({ alSalir: true }) })
  setInterval(() => enviarUso(), 3 * 60 * 1000)
  setTimeout(() => enviarUso(), 20 * 1000)
}
