// Prueba E2E: otras opciones (pagina 5). Desde una cotizacion con modelo 3D en L: calcular las
// alternativas, elegir 2, generar (el PDF lleva pagina 5 y se guardan con su modelo) y cambiar a una
// desde Cotizaciones (pasa a ser la principal y la anterior queda como opcion).
// Contra el entorno local (start-native.mjs).   node scripts/local-dev/verify-alternativas.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-11-04-alternativas')
mkdirSync(evidence, { recursive: true })
const proyecto3d = { units: 'cm', room: { backWallCm: 225, leftWallCm: 200, rightWallCm: 200, heightCm: 240, door: { wall: 'front', fromLeftCornerCm: 60, toRightCornerCm: 85 } },
  shelving: { layout: 'manual', heightCm: 200, depthCm: 48, runs: [{ id: 'fondo', wall: 'back', startCm: 0, lengthCm: 225, depthCm: 48 }, { id: 'izq', wall: 'left', startCm: 48, lengthCm: 146, depthCm: 48 }] } }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  page.on('dialog', d => d.accept())
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => (await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const q = await api('save-quote', { crear: true, nombre: 'Carmen Opciones', email: 'carmen@example.cl', telefono: '9 5555 6666', direccion: 'Macul', subtotal: 270000, iva: 51300, total: 321300,
    repisas: [{ largo: 2.25, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 150000 }, { largo: 1.46, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 120000 }], adicionales: {}, proyecto3d })

  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByText('Carmen Opciones').first().click()
  await page.locator('#cot-' + q.cotNum).getByRole('button', { name: 'Abrir en cotizador' }).click()
  const panel = page.getByTestId('alternativas')
  await panel.getByRole('button', { name: /Ver alternativas/ }).click()
  await expect(panel.getByTestId('alternativa-un-muro')).toBeVisible({ timeout: 120000 })
  await expect(panel.getByRole('button', { name: 'Volver a calcular' })).toBeVisible({ timeout: 60000 })
  await panel.getByTestId('alternativa-mas-completa').getByRole('checkbox').check()
  await panel.getByTestId('alternativa-un-muro').getByRole('checkbox').check()
  await panel.screenshot({ path: path.join(evidence, '01-panel.png') })
  await page.getByRole('button', { name: 'Generar Cotizacion PDF' }).click()
  await expect(page.getByText(`Cotización N° ${q.cotNum} guardada`)).toBeVisible({ timeout: 120000 })

  const guardada = (await api('get-quotes?cotNum=' + q.cotNum)).quote
  expect(guardada.alternativas.map(a => a.tipo)).toEqual(['mas-completa', 'un-muro'])
  expect(guardada.alternativas.every(a => a.proyecto?.shelving && a.total > 0 && a.comparacion)).toBe(true)
  // Un solo muro: la repisa sube 20% (225 cm en 48 al precio de la tabla x 1,2).
  expect(guardada.alternativas[1].repisas.length).toBe(1)

  // Cambiar a "Solo un muro" desde Cotizaciones.
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  const tarjeta = page.locator('#cot-' + q.cotNum)
  if (!(await tarjeta.getByTestId('otras-opciones').isVisible())) await tarjeta.getByText('Carmen Opciones').first().click()
  await expect(tarjeta.getByTestId('otras-opciones')).toContainText('Solo un muro')
  await tarjeta.getByTestId('otras-opciones').getByRole('button', { name: 'Cambiar a esta opción' }).last().click()
  await expect(tarjeta.getByText('✓ PDF actualizado · ver')).toBeVisible({ timeout: 120000 })
  const cambiada = (await api('get-quotes?cotNum=' + q.cotNum)).quote
  expect(cambiada.repisas.length).toBe(1)
  expect(cambiada.proyecto3d.shelving.runs.length).toBe(1)
  expect(cambiada.alternativas.map(a => a.tipo)).toEqual(['anterior', 'mas-completa'])
  expect(Number(cambiada.total)).toBe(guardada.alternativas[1].total)
  await tarjeta.screenshot({ path: path.join(evidence, '02-cambiada.png') })
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, cotNum: q.cotNum, opciones: guardada.alternativas.map(a => [a.titulo, a.total, a.comparacion]) }))
} finally { await browser.close() }
