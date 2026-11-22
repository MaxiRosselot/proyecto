// Prueba E2E: en Estadisticas, "Emitida" pasa un documento de B* a B, y "Deshacer" lo devuelve.
// Contra el entorno local (start-native.mjs).   node scripts/local-dev/verify-emitir-documento.mjs
import { chromium, expect } from '@playwright/test'
import { ahoraEnZona } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => (await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const hoy = ahoraEnZona().fecha
  const nombre = 'Elena Prueba ' + Date.now().toString(36)
  const creada = await api('planilla', { accion: 'crear', nombre, fecha: hoy, inicio: '10:00', fin: '12:00' })
  if (!creada.ok) throw new Error('crear: ' + JSON.stringify(creada))
  const q = creada.cotizacion
  const up = await api('planilla', { accion: 'actualizar', cotNum: q.cotNum, cambios: { documento: 'B*' } })
  if (!up.ok) throw new Error('actualizar: ' + JSON.stringify(up))

  await page.getByRole('navigation').getByRole('button', { name: 'Estadísticas' }).click()
  const caja = page.getByTestId('documentos-por-emitir')
  await caja.getByRole('button', { name: 'Ver' }).click()
  await caja.getByRole('button', { name: `Marcar B* de ${nombre} como emitida` }).click()
  await expect(caja.getByText('quedó como B')).toBeVisible()
  await expect(caja.getByRole('button', { name: new RegExp(nombre) })).toHaveCount(0)
  await page.screenshot({ path: process.env.SHOT || 'emitir.png', clip: { x: 0, y: 0, width: 1100, height: 450 } })
  const guardada = (await api('get-quotes')).quotes.find(x => x.cotNum === q.cotNum)
  if (guardada.instalacion.documento !== 'B') throw new Error('quedó ' + guardada.instalacion.documento)
  await caja.getByRole('button', { name: 'Deshacer' }).click()
  await expect(caja.getByRole('button', { name: `Marcar B* de ${nombre} como emitida` })).toBeVisible()
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('ok: emitida y deshecha')
} finally { await browser.close() }
