// Prueba E2E del mapa de visitas (Admin → Visitas → 🗺 Mapa): una visita con coordenadas (como las
// deja el autocompletado) va en su direccion; una sin coordenadas, aproximada en su comuna.
// Los centros de las comunas se dejan precargados para no depender de internet en la prueba.
// Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-mapa-visitas.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-26-mapa-visitas')
mkdirSync(evidence, { recursive: true })
const CENTROS = { 'Ñuñoa': { lat: -33.4569, lng: -70.5976 }, 'Providencia': { lat: -33.4314, lng: -70.6093 }, 'Las Condes': { lat: -33.4089, lng: -70.5675 }, 'Vitacura': { lat: -33.3906, lng: -70.5711 }, 'La Cisterna': { lat: -33.5292, lng: -70.6633 }, 'Maipú': { lat: -33.5106, lng: -70.7572 } }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1300, height: 950 } })
  await context.addInitScript(c => localStorage.setItem('dm_centros_comunas_v1', c), JSON.stringify(CENTROS))
  const page = await context.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  const nominatim = []; page.on('request', r => { if (r.url().includes('nominatim')) nominatim.push(r.url()) })

  const { dias } = await (await page.request.get(base + '/.netlify/functions/visitas-rangos')).json()
  const agendar = data => page.request.post(base + '/.netlify/functions/create_event', { data: { apellido: 'Mapa', celular: '9 1111 2222', fechaISO: dias[0].fecha, rango: dias[0].rangos[0].desde, ...data } })
  expect((await (await agendar({ nombre: 'Exacta', email: 'exacta@example.cl', direccion: 'Av. Grecia 1500', comuna: 'Ñuñoa', lat: -33.4559, lng: -70.6012 })).json()).ok).toBe(true)
  expect((await (await agendar({ nombre: 'Aprox', email: 'aprox@example.cl', direccion: 'Pajaritos 2000', comuna: 'Maipú' })).json()).ok).toBe(true)

  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Visitas', exact: true }).click()
  await page.getByRole('button', { name: '🗺 Mapa' }).click()
  const mapa = page.getByTestId('mapa-visitas')
  await expect(mapa).toBeVisible()
  const agendadas = Number((await page.getByRole('button', { name: /^Agendadas/ }).innerText()).match(/\d+/)[0])
  // Un punto por visita agendada (las de la semilla traen comuna: aproximadas).
  await expect(mapa.locator('path.leaflet-interactive')).toHaveCount(agendadas)
  await expect(mapa).toContainText('1 en su dirección')
  await expect(mapa).toContainText(`${agendadas - 1} ${agendadas - 1 === 1 ? "aproximada" : "aproximadas"} por comuna`)
  expect(nominatim).toEqual([]) // los centros ya estaban guardados

  // Ficha al tocar el punto exacto.
  const exacta = mapa.locator('path.leaflet-interactive[stroke="#fff"]')
  await expect(exacta).toHaveCount(1)
  await exacta.click({ force: true })
  await expect(page.locator('.leaflet-popup-content')).toContainText('Exacta Mapa')
  await expect(page.locator('.leaflet-popup-content')).toContainText('Av. Grecia 1500, Ñuñoa')
  await page.waitForTimeout(800) // que carguen los mosaicos del mapa
  await page.screenshot({ path: path.join(evidence, '01-mapa.png') })

  // El mapa sigue a la pestaña: en Canceladas no hay puntos.
  await page.getByRole('button', { name: /^Canceladas/ }).click()
  await expect(mapa.locator('path.leaflet-interactive')).toHaveCount(0)

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, agendadas, evidence }))
} finally { await browser.close() }
