// Prueba E2E: "Regenerar como nueva" crea otra cotizacion igual (N° nuevo, mismo modelo 3D), con su
// PDF y su propio link para agendar, sin abrir el cotizador. Contra el entorno local (start-native.mjs).
//   node scripts/local-dev/verify-regenerar-como-nueva.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-11-03-regenerar-como-nueva')
mkdirSync(evidence, { recursive: true })
const proyecto3d = { units: 'cm', room: { backWallCm: 200, leftWallCm: 160, rightWallCm: 160, heightCm: 240, door: { wall: 'front', fromLeftCornerCm: 40, toRightCornerCm: 80 } },
  shelving: { layout: 'manual', heightCm: 200, depthCm: 48, runs: [{ id: 'A', wall: 'back', startCm: 0, lengthCm: 200, depthCm: 48 }] } }

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
  const q = await api('save-quote', { crear: true, nombre: 'Cristina Copia', email: 'cristina@example.cl', telefono: '9 7777 8888', direccion: 'Estación Central', subtotal: 170000, iva: 32300, total: 202300,
    repisas: [{ largo: 2, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 170000 }], adicionales: { recargo_pct: 5 }, proyecto3d })

  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByText('Cristina Copia').first().click()
  await page.locator('#cot-' + q.cotNum).getByTestId('regenerar-como-nueva').click()
  const { quotes } = await (async () => { for (let i = 0; i < 60; i++) { const r = await api('get-quotes'); const n = r.quotes.find(x => x.nombre === 'Cristina Copia' && String(x.cotNum) !== String(q.cotNum) && x.pdfUrl); if (n) return r; await page.waitForTimeout(1000) } throw new Error('No apareció la nueva con PDF') })()
  const nueva = quotes.find(x => x.nombre === 'Cristina Copia' && String(x.cotNum) !== String(q.cotNum))
  const completa = (await api('get-quotes?cotNum=' + nueva.cotNum)).quote
  expect(completa.repisas.map(r => Number(r.valor))).toEqual([170000])
  expect(Number(completa.total)).toBe(202300)
  expect(completa.adicionales.recargo_pct).toBeUndefined()
  expect(completa.proyecto3d.shelving.runs[0].lengthCm).toBe(200)
  expect(completa.notas).toContain(`N° ${q.cotNum}`)
  const tarjeta = page.locator('#cot-' + nueva.cotNum)
  await expect(tarjeta).toBeVisible()
  await expect(tarjeta).toContainText('👥 2 cotizaciones')
  expect(nueva.linkAgenda).toContain('c=' + nueva.cotNum)
  await page.screenshot({ path: path.join(evidence, '01-nueva.png') })
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, original: q.cotNum, nueva: nueva.cotNum, pdf: Boolean(nueva.pdfUrl) }))
} finally { await browser.close() }
