// Prueba E2E del boton "Copiar lista" de Visitas: copia las visitas de la pestana, por dia y en orden.
//   node scripts/local-dev/verify-copiar-visitas.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo usa el backend local')
const evidence = path.resolve('docs/evidence/2026-10-16-copiar-visitas')
mkdirSync(evidence, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1300, height: 900 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  const page = await context.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Visitas', exact: true }).click()
  const boton = page.getByRole('button', { name: /Copiar lista/ })
  await expect(boton).toBeVisible()
  // Usa la primera pestana que tenga visitas (los datos locales de ejemplo ya pasaron).
  const cuenta = async () => Number((await boton.textContent()).match(/\((\d+)\)/)[1])
  for (const pestana of ['Agendadas', 'Pendientes', 'Realizadas', 'Canceladas']) {
    await page.getByRole('button', { name: new RegExp('^' + pestana + '\\s*\\d') }).click()
    if (await cuenta()) break
  }
  const n = await cuenta()
  if (n > 0) {
    await boton.click()
    await expect(page.getByRole('button', { name: '✓ Copiado' })).toBeVisible()
    const texto = await page.evaluate(() => navigator.clipboard.readText())
    console.log(texto)
    expect(texto).toMatch(/^📅 \*/)
    expect((texto.match(/^\*\d+\. /gm) || []).length).toBe(n)
  } else throw new Error('No hay visitas en los datos locales para probar')
  await page.screenshot({ path: path.join(evidence, '01-visitas.png') })
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, visitas: n }))
} finally { await browser.close() }
