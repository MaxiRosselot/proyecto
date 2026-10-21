// Prueba E2E de la "Ficha para el maestro" (Instalaciones y Cotizaciones): la isometrica del trabajo
// y el texto con hora, cliente, terciados, laterales, colgador y servicios, para copiar a WhatsApp.
// Contra el entorno local (start-native.mjs, con el configurador 3D), con datos limpios.
//   node scripts/local-dev/verify-ficha-maestro.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-21-ficha-maestro')
mkdirSync(evidence, { recursive: true })

const bodega = {
  projectName: 'Bodega Ficha', units: 'cm',
  room: { backWallCm: 300, leftWallCm: 220, rightWallCm: 220, heightCm: 250, door: { wall: 'front', fromLeftCornerCm: 110, toRightCornerCm: 110, widthCm: 80 } },
  shelving: { layout: 'manual', heightCm: 200, depthCm: 48, runs: [{ id: 'A1', wall: 'back', startCm: 0, lengthCm: 243, heightCm: 200, depthCm: 48 }] },
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  const page = await context.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, body) => (await page.request[body ? 'post' : 'get'](base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token }, ...(body ? { data: body } : {}) })).json()

  const fecha = sumarDias(ahoraEnZona().fecha, 2)
  const { siguiente } = await api('get-quotes')
  const r = await api('save-quote', {
    crear: true, cotNum: siguiente, nombre: 'Marta Ficha', telefono: '9 7777 8888', direccion: 'Av. Grecia 1500, Ñuñoa', status: 'confirmada',
    repisas: [{ largo: 2.43, prof: 0.48, alto: 2, niveles: 4, unidades: 1, valor: 1 }, { largo: 1.2, prof: 0.48, alto: 2, niveles: 2, unidades: 1, valor: 1, colgador: true }],
    adicionales: { qty_retiro_orden: 1, precio_retiro_orden: 40000, qty_cajas: 3, precio_cajas: 15000 }, subtotal: 1, iva: 0, total: 1, proyecto3d: bodega,
  })
  expect(r.ok).toBe(true)
  expect((await api('save-quote', { cotNum: r.cotNum, instalacion: { fecha, inicio: '10:00', fin: '12:30' } })).ok).toBe(true)

  await page.getByRole('navigation').getByRole('button', { name: 'Instalaciones', exact: true }).click()
  await page.getByText('Marta Ficha').first().click()
  await page.getByRole('button', { name: '👷 Ficha para el maestro' }).click()
  const ficha = page.getByTestId('ficha-maestro')
  const texto = ficha.getByTestId('ficha-texto')
  await expect(texto).toContainText(`👷 *Instalación N° ${r.cotNum}*`)
  await expect(texto).toContainText('10:00 a 12:30 hrs')
  await expect(texto).toContainText('👤 Marta Ficha')
  await expect(texto).toContainText('📞 9 7777 8888')
  await expect(texto).toContainText('📍 Av. Grecia 1500, Ñuñoa')
  await expect(texto).toContainText('• 4 × 243 × 40 cm')
  await expect(texto).toContainText('• 2 × 120 × 40 cm')
  await expect(texto).toContainText('• 6 × 200 × 48 cm')
  await expect(texto).toContainText('🧥 Colgador: Sí')
  await expect(texto).toContainText('Servicios adicionales: Retiro y orden de artículos, Cajas organizadoras × 3')
  await expect(ficha.getByRole('img', { name: 'Vista isométrica del trabajo' })).toBeVisible({ timeout: 45000 })
  await ficha.getByRole('button', { name: '📋 Copiar texto' }).click()
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toMatch(/^👷 \*Instalación N° \d+\*\n🕐 /)
  await ficha.screenshot({ path: path.join(evidence, 'ficha.png') })
  await ficha.getByRole('button', { name: 'Cerrar' }).click()

  // Tambien desde Cotizaciones (se cierra el panel de la venta).
  await page.keyboard.press('Escape')
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByRole('button', { name: /^Confirmadas/ }).click()
  await page.getByText('Marta Ficha').first().click()
  await page.getByRole('button', { name: '👷 Ficha para el maestro' }).first().click()
  await expect(page.getByTestId('ficha-texto')).toContainText('Colgador: Sí')

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true }))
} finally { await browser.close() }
