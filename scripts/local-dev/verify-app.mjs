// Prueba local de la app del panel: /admin trae manifest e icono para instalarse en el iPhone,
// la pagina publica no. Contra el entorno local (start-native.mjs).
//   node scripts/local-dev/verify-app.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
const evidence = path.resolve('docs/evidence/2026-10-15-app')
mkdirSync(evidence, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
  await page.goto(base + '/admin')
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/admin.webmanifest')
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', '/app/icon-180.png')
  await expect(page.locator('meta[name=apple-mobile-web-app-title]')).toHaveAttribute('content', 'Don Maxi')
  await expect(page).toHaveTitle('Don Maxi · Panel')

  const manifest = await (await page.request.get(base + '/admin.webmanifest')).json()
  expect([manifest.start_url, manifest.display, manifest.short_name]).toEqual(['/admin', 'standalone', 'Don Maxi'])
  for (const icono of [...manifest.icons.map(i => i.src), '/app/icon-180.png']) {
    const r = await page.request.get(base + icono)
    expect(r.headers()['content-type']).toContain('image/png')
  }

  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  await expect(page.getByText('Proximas visitas (7 dias)')).toBeVisible()
  // Nada se sale de la pantalla del celular.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: path.join(evidence, '01-panel-iphone.png') })

  // La pagina publica no se instala como el panel.
  const publica = await browser.newPage()
  await publica.goto(base + '/visita')
  await expect(publica.locator('link[rel=manifest]')).toHaveCount(0)
  console.log(JSON.stringify({ ok: true, evidence }))
} finally { await browser.close() }
