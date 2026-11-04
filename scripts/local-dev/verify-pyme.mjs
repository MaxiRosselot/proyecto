// Prueba E2E: la pagina /pyme (marca para empresas) se ve en PC y celular, y su formulario llega.
// Contra el entorno local (start-native.mjs).
//   node scripts/local-dev/verify-pyme.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
const evidence = path.resolve('docs/evidence/2026-11-04-pyme')
mkdirSync(evidence, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const [nombre, viewport] of [['pc', { width: 1366, height: 860 }], ['celular', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport })
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.goto(base + '/pyme')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Estanterías de madera a medida')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(evidence, `01-${nombre}-portada.png`) })
    // Las fotos cargan al acercarse: se recorre la pagina antes de la captura completa.
    for (let y = 0; y < 9000; y += 600) { await page.mouse.wheel(0, 600); await page.waitForTimeout(120) }
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(evidence, `02-${nombre}-completa.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    if (nombre === 'pc') {
      const form = page.getByTestId('pyme-form')
      await form.getByRole('button', { name: 'Solicitar visita y cotización' }).click()
      await expect(form.getByRole('alert')).toContainText('empresa')
      await form.getByLabel('Empresa').fill('Logística Sur SpA')
      await form.getByLabel('Tu nombre').fill('Ana Pérez')
      await form.getByLabel('Correo').fill('ana@logsur.cl')
      await form.getByLabel('Tipo de espacio').selectOption('Bodegas de un edificio')
      await form.getByRole('button', { name: 'Solicitar visita y cotización' }).click()
      await expect(page.getByTestId('pyme-listo')).toBeVisible()
      await page.getByTestId('pyme-listo').screenshot({ path: path.join(evidence, '03-enviado.png') })
    }
    expect(errors).toEqual([])
    await page.close()
  }
  console.log(JSON.stringify({ ok: true, evidence }))
} finally { await browser.close() }
