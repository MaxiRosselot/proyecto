// Prueba E2E: Instalaciones abre en el dia de hoy (celular) y el registro de uso del panel anota
// secciones y botones y los muestra en Inicio → Uso del panel. Contra el entorno local.
//   node scripts/local-dev/verify-uso.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve(process.env.EVIDENCIA || 'docs/evidence/2026-11-11-uso')
mkdirSync(evidence, { recursive: true })
const dosDig = n => String(n).padStart(2, '0')
const d = new Date(), hoy = `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const post = async (ruta, body) => (await page.request.post(base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token }, data: body })).json()

  // Instalaciones en los primeros dias del mes, para que haya que bajar hasta hoy.
  for (let dia = 1; dia < d.getDate(); dia++) {
    await post('planilla', { accion: 'crear', nombre: `Prueba uso ${dia}`, fecha: `${hoy.slice(0, 8)}${dosDig(dia)}`, inicio: '10:00', fin: '12:00' })
  }
  await post('planilla', { accion: 'crear', nombre: 'Prueba uso hoy', fecha: hoy, inicio: '10:00', fin: '12:00' })
  for (let dia = d.getDate() + 1; dia <= Math.min(d.getDate() + 6, 28); dia++) {
    await post('planilla', { accion: 'crear', nombre: `Prueba uso despues ${dia}`, fecha: `${hoy.slice(0, 8)}${dosDig(dia)}`, inicio: '10:00', fin: '12:00' })
  }

  await page.getByRole('navigation').getByRole('button', { name: /Instal/ }).click()
  const hoyEl = page.locator(`[data-dia="${hoy}"]`)
  await expect(hoyEl).toBeVisible()
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
  const top = await hoyEl.evaluate(el => el.getBoundingClientRect().top)
  if (top < 40 || top > 160) throw new Error('El dia de hoy no quedo arriba: top=' + top)
  await page.screenshot({ path: path.join(evidence, '01-instalaciones-hoy.png') })

  // Algunos clics para el registro, y luego el resumen.
  await page.getByRole('button', { name: /Mapa/ }).click()
  await page.getByRole('button', { name: /Ocultar mapa/ }).click()
  await page.waitForTimeout(4500) // botones vistos
  await page.getByRole('navigation').getByRole('button', { name: 'Inicio' }).click()
  await page.getByRole('button', { name: 'Uso del panel' }).click()
  await expect(page.getByText('Lo que más usas')).toBeVisible()
  await expect(page.locator('tr', { hasText: '🗺 Mapa' }).first()).toBeVisible()
  await expect(page.getByText('Aparecen pero nunca los tocas')).toBeVisible()
  await expect(page.getByText('Importar Excel')).toBeVisible()
  await page.screenshot({ path: path.join(evidence, '02-uso-panel.png'), fullPage: true })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('verify-uso: ok')
} finally { await browser.close() }
