// Prueba E2E del menu ordenado por uso: en el PC las secciones poco usadas van bajo "Más"; en el
// celular la barra tiene 4 secciones + "Más", que abre el resto. En el detalle de una instalacion,
// la ficha del maestro y el cobro van arriba. Contra el entorno local (start-native.mjs).
//   node scripts/local-dev/verify-menu-orden.mjs
import { chromium, expect } from '@playwright/test'
import { ahoraEnZona } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const carpeta = process.env.SHOTS || '.'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const entrar = async page => {
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation').first()).toBeVisible()
}
try {
  const errors = []
  // PC
  const pc = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  pc.on('pageerror', e => errors.push(e.stack || e.message))
  await entrar(pc)
  const nombres = await pc.getByRole('navigation').getByRole('button').allInnerTexts()
  const orden = nombres.map(n => n.trim())
  const esperado = ['Inicio', 'Cotizaciones', 'Instalaciones', 'Cotizar', 'Calendario', 'DTE', 'Visitas', 'Estadísticas', 'Horarios', 'Pendientes', 'Web']
  if (JSON.stringify(orden) !== JSON.stringify(esperado)) throw new Error('orden del menu: ' + orden.join(', '))
  await expect(pc.getByRole('navigation').getByText('Más', { exact: true })).toBeVisible()
  await pc.screenshot({ path: carpeta + '/menu-pc.png', clip: { x: 0, y: 0, width: 240, height: 640 } })

  // Detalle de una instalacion: acciones arriba.
  const token = await pc.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => (await pc.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const nombre = 'Prueba Menu ' + Date.now().toString(36)
  const creada = await api('planilla', { accion: 'crear', nombre, fecha: ahoraEnZona().fecha, inicio: '10:00', fin: '12:00' })
  if (!creada.ok) throw new Error(JSON.stringify(creada))
  await api('planilla', { accion: 'actualizar', cotNum: creada.cotizacion.cotNum, cambios: { repisasTotal: 100000 } })

  // Celular
  const movil = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  movil.on('pageerror', e => errors.push(e.stack || e.message))
  await entrar(movil)
  const barra = movil.getByRole('navigation').first()
  const enBarra = (await barra.getByRole('button').allInnerTexts()).map(n => n.trim())
  if (JSON.stringify(enBarra) !== JSON.stringify(['Inicio', 'Instal.', 'Cotiz.', 'Agenda', 'Más'])) throw new Error('barra: ' + enBarra.join(', '))
  await barra.getByRole('button', { name: 'Más' }).click()
  const hoja = movil.getByRole('navigation', { name: 'Más secciones' })
  await expect(hoja.getByRole('button', { name: 'Cotizar' })).toBeVisible()
  await movil.screenshot({ path: carpeta + '/menu-movil.png' })
  await hoja.getByRole('button', { name: 'Estadísticas' }).click()
  await expect(hoja).toHaveCount(0)
  await expect(movil.getByTestId('kpis')).toBeVisible()

  await barra.getByRole('button', { name: 'Instal.' }).click()
  await movil.getByText(nombre).first().click()
  // Tocar el nombre abre el detalle y no marca la instalacion.
  await expect(movil.getByRole('dialog', { name: nombre })).toBeVisible()
  await expect(movil.getByRole('checkbox', { name: 'Instalada: ' + nombre })).not.toBeChecked()
  const acciones = movil.getByTestId('acciones-venta')
  await expect(acciones.getByRole('button', { name: '👷 Ficha para el maestro' })).toBeVisible()
  await expect(acciones.getByRole('button', { name: '📋 Copiar mensaje de cobro' })).toBeVisible()
  const caja = await acciones.boundingBox()
  if (caja.y > 300) throw new Error('las acciones quedaron abajo: y=' + caja.y)
  await movil.screenshot({ path: carpeta + '/detalle-movil.png' })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('ok: menu PC, barra del celular con Más y acciones arriba en el detalle')
} finally { await browser.close() }
