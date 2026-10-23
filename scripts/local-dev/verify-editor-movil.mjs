// Prueba E2E del editor 3D de Cotizar en el iPhone: pantalla completa con el 3D fijo arriba y
// pestañas Bodega / Agregar / Editar / Más; repisas agregadas con un toque por muro y editadas
// desde la lista. En el computador el editor sigue igual (sin pestañas).
// Contra el entorno local (start-native.mjs, con el configurador 3D compilado), con datos limpios.
//   node scripts/local-dev/verify-editor-movil.mjs
import { chromium, devices, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-22-editor-movil')
mkdirSync(evidence, { recursive: true })

async function entrar(page) {
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  // ── iPhone 15 Pro ──
  const cel = await browser.newPage({ ...devices['iPhone 15 Pro'] })
  const errors = []; cel.on('pageerror', e => errors.push(e.stack || e.message))
  await entrar(cel)
  await cel.locator('nav button', { hasText: /^Cotizar$/ }).click({ force: true })
  await cel.getByRole('button', { name: 'Pantalla completa' }).click()
  const frame = cel.locator('iframe[title="Configurador Repisas 3D"]')
  await expect(frame).toHaveAttribute('src', /movil=1/)
  const f = cel.frameLocator('iframe[title="Configurador Repisas 3D"]')
  const pestanas = f.getByRole('navigation', { name: 'Secciones del editor' })
  await expect(pestanas.getByRole('button', { name: 'Bodega' })).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 })

  // El visor cabe en la pantalla (antes la fila de vistas lo ensanchaba y la bodega quedaba corrida).
  const visor = await f.locator('.viewer-frame').boundingBox()
  expect(visor.x).toBeGreaterThanOrEqual(0)
  expect(visor.x + visor.width).toBeLessThanOrEqual(393 + 1)
  // Parte seleccionando: un toque para girar la vista no agrega repisas.
  await expect(f.locator('.build-toolbar button.active').first()).toHaveAttribute('aria-label', /Seleccionar/)

  // Bodega: muro A de 300 cm.
  const muroA = f.locator('.room-dimensions-section').getByLabel('Muro A', { exact: true })
  await muroA.fill('300')
  await muroA.press('Enter')
  await cel.screenshot({ path: path.join(evidence, '01-bodega.png') })

  // Agregar: un toque por muro; el A (300) se llena con dos modulos.
  await pestanas.getByRole('button', { name: 'Agregar' }).click()
  const colocar = f.locator('.movil-colocar')
  await colocar.getByRole('button', { name: /A · fondo/ }).click()
  await colocar.getByRole('button', { name: /A · fondo/ }).click()
  await colocar.getByRole('button', { name: /B · derecho/ }).click()
  await colocar.getByRole('button', { name: /E · izquierdo/ }).click()
  await expect(pestanas.getByRole('button', { name: 'Agregar' })).toHaveAttribute('aria-pressed', 'true')
  await expect(pestanas.getByRole('button', { name: /Editar/ })).toContainText('4')
  await colocar.getByRole('button', { name: /A · fondo/ }).click()

  await expect(colocar.getByRole('status')).toContainText('ya está lleno')
  await cel.screenshot({ path: path.join(evidence, '02-agregar.png') })

  // Editar: la lista, y al elegir una repisa su editor queda arriba.
  await pestanas.getByRole('button', { name: /Editar/ }).click()
  const lista = f.locator('.movil-lista')
  await expect(lista.getByRole('button', { name: /Repisa/ })).toHaveCount(4)
  await expect(lista).toContainText('A · fondo · 243 × 48 × 200 cm')
  await expect(lista).toContainText('A · fondo · 57 × 48 × 200 cm')
  await lista.getByRole('button', { name: /Repisa 3/ }).click()
  const inspector = f.locator('.inspector-section')
  await expect(inspector).toBeVisible()
  const yInspector = (await inspector.boundingBox()).y, yLista = (await lista.boundingBox()).y
  expect(yInspector).toBeLessThan(yLista)
  await inspector.locator('label', { has: f.locator('span', { hasText: /^Profundidad$/ }) }).locator('select').selectOption('38')
  await expect(lista).toContainText('B · derecho · 152 × 38 × 200 cm')
  await cel.screenshot({ path: path.join(evidence, '03-editar.png') })

  await pestanas.getByRole('button', { name: 'Más' }).click()
  await expect(f.locator('.exportar-section')).toBeVisible()
  await expect(f.locator('.room-dimensions-section')).toBeHidden()

  // Al cerrar, la cotizacion queda con la bodega dibujada.
  await cel.getByRole('button', { name: 'Cerrar' }).click()
  await expect(cel.getByText('Todavia no hay bodega dibujada')).toHaveCount(0)
  await cel.screenshot({ path: path.join(evidence, '04-cotizar.png'), fullPage: true })
  expect(errors).toEqual([])

  // ── Computador: el editor de siempre ──
  const pc = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await entrar(pc)
  await pc.getByRole('navigation').getByRole('button', { name: 'Cotizar', exact: true }).click()
  await pc.getByRole('button', { name: 'Pantalla completa' }).click()
  await expect(pc.locator('iframe[title="Configurador Repisas 3D"]')).not.toHaveAttribute('src', /movil=1/)
  const fpc = pc.frameLocator('iframe[title="Configurador Repisas 3D"]')
  await expect(fpc.locator('.room-dimensions-section')).toBeVisible({ timeout: 30000 })
  await expect(fpc.getByRole('navigation', { name: 'Secciones del editor' })).toHaveCount(0)

  console.log(JSON.stringify({ ok: true }))
} finally { await browser.close() }
