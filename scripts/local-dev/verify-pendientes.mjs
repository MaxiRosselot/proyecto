// Prueba E2E de Admin → Pendientes: columnas por estado con los pendientes iniciales, detalle con
// bitacora, nota + cambio de estado, crear uno nuevo, y en el celular desde Inicio.
//   node scripts/local-dev/verify-pendientes.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve(process.env.EVIDENCIA || 'docs/evidence/2026-11-16-pendientes')
mkdirSync(evidence, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  page.on('dialog', d => d.accept())
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Pendientes' }).click()

  const col = e => page.getByTestId(`columna-${e}`)
  await expect(col('hecho').getByTestId('pendiente')).toHaveCount(5) // 7 hechos, se ven los 5 ultimos
  await expect(col('por-hacer')).toContainText('Tiempos reales del maestro por Telegram')
  await expect(col('idea')).toContainText('Juntar cotizaciones de un mismo cliente')
  await page.screenshot({ path: path.join(evidence, '01-pendientes.png'), fullPage: true })

  // Detalle: nota y paso a "En curso".
  await col('por-hacer').getByRole('button', { name: /Tiempos reales del maestro/ }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Nota').fill('Partimos con los botones en el bot')
  await dialogo.getByRole('button', { name: 'Anotar' }).click()
  await expect(dialogo).toContainText('Partimos con los botones en el bot')
  await dialogo.getByRole('group', { name: 'Estado' }).getByRole('button', { name: 'En curso' }).click()
  await expect(dialogo).toContainText('Estado: Por hacer → En curso')
  await page.screenshot({ path: path.join(evidence, '02-detalle.png') })
  await dialogo.getByRole('button', { name: 'Cerrar' }).click()
  await expect(col('en-curso')).toContainText('Tiempos reales del maestro')

  // Nuevo.
  await page.getByRole('button', { name: '+ Nuevo' }).click()
  await page.getByLabel('Título').fill('Probar pendiente nuevo')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(col('por-hacer')).toContainText('Probar pendiente nuevo')

  // Celular: desde Inicio.
  const cel = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await cel.goto(base + '/admin')
  await cel.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await cel.getByRole('button', { name: 'Ingresar' }).click()
  await expect(cel.getByRole('navigation').getByRole('button', { name: 'Pendientes' })).toHaveCount(0)
  await cel.getByRole('button', { name: 'Pendientes', exact: true }).click()
  await expect(cel.getByTestId('columna-en-curso')).toContainText('Tiempos reales del maestro')
  await cel.screenshot({ path: path.join(evidence, '03-celular.png'), fullPage: true })

  if (errors.length) throw new Error(errors.join('\n'))
  console.log('verify-pendientes: ok')
} finally { await browser.close() }
