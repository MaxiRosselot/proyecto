// Prueba E2E del dibujo de /agendar: con modelo 3D se ve la isometrica de su bodega, y cada
// servicio sumado agrega su emoji. Mientras se dibuja, "Cargando"; sin modelo no hay dibujo.
// Contra el entorno local (start-native.mjs, con el configurador 3D), con datos limpios.
//   node scripts/local-dev/verify-agendar-dibujo.mjs
import { chromium, devices, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-20-agendar')
mkdirSync(evidence, { recursive: true })

const bodega = {
  projectName: 'Bodega Dibujo', units: 'cm',
  room: { backWallCm: 300, leftWallCm: 220, rightWallCm: 220, heightCm: 250, door: { wall: 'front', fromLeftCornerCm: 110, toRightCornerCm: 110, widthCm: 80 } },
  shelving: { layout: 'manual', heightCm: 200, depthCm: 48, runs: [{ id: 'A1', wall: 'back', startCm: 0, lengthCm: 243, heightCm: 200, depthCm: 48 }] },
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const admin = await browser.newPage()
  await admin.goto(base + '/admin')
  await admin.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await admin.getByRole('button', { name: 'Ingresar' }).click()
  await expect(admin.getByRole('navigation')).toBeVisible()
  const token = await admin.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, body) => (await admin.request[body ? 'post' : 'get'](base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token }, ...(body ? { data: body } : {}) })).json()
  async function crear(nombre, proyecto3d) {
    const { siguiente } = await api('get-quotes')
    const r = await api('save-quote', { crear: true, cotNum: siguiente, nombre, email: 'dibujo@example.cl', telefono: '9 5555 4444', direccion: 'Los Leones 123', status: 'por confirmar', repisas: [{ largo: 2.43, prof: 0.48, alto: 2, niveles: 4, unidades: 1, valor: 200000 }], adicionales: {}, subtotal: 200000, iva: 38000, total: 238000, ...(proyecto3d ? { proyecto3d } : {}) })
    expect(r.ok).toBe(true)
    return r.linkAgenda
  }

  const cliente = await browser.newPage({ ...devices['iPhone 13'] })
  const errors = []; cliente.on('pageerror', e => errors.push(e.stack || e.message))

  // Con modelo: la isometrica real.
  await cliente.goto(await crear('Dibujo Con', bodega))
  const dibujo = cliente.getByTestId('agenda-dibujo')
  await expect(dibujo).toContainText('Cargando tu bodega en 3D')
  await expect(dibujo.getByRole('img', { name: /vista isométrica/ })).toBeVisible({ timeout: 45000 })
  await expect(dibujo).toContainText('Así quedará tu bodega')
  await cliente.getByRole('checkbox', { name: /Retiro y orden/i }).check({ force: true })
  await expect(dibujo.getByRole('img', { name: /Retiro y orden/i })).toBeVisible()
  await cliente.getByRole('button', { name: /Agregar .*caja/i }).click()
  await cliente.getByRole('button', { name: /Agregar .*caja/i }).click()
  await expect(dibujo).toContainText('×2')
  await dibujo.scrollIntoViewIfNeeded()
  await dibujo.screenshot({ path: path.join(evidence, 'dibujo-isometrica.png') })
  await cliente.getByRole('checkbox', { name: /Retiro y orden/i }).uncheck({ force: true })
  await expect(dibujo.getByRole('img', { name: /Retiro y orden/i })).toHaveCount(0)

  // Sin modelo (cotizaciones antiguas): no se muestra dibujo.
  await cliente.goto(await crear('Dibujo Sin'))
  await expect(cliente.getByRole('heading', { name: /agenda tu instalación/ })).toBeVisible()
  await expect(cliente.getByTestId('agenda-dibujo')).toHaveCount(0)

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true }))
} finally { await browser.close() }
