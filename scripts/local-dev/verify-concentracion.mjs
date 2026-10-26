// Prueba E2E de Admin → Visitas → 📊 Concentración (importar un CSV de Calendly inventado, mapa de
// calor, tablas por comuna y sector), la pestaña Calendly (conciliar a mano), el "Mapa del día" de
// las proximas visitas (numerado, solo RM, descargable) y el mapa de trabajos de Instalaciones. Los centros de las comunas se precargan para no depender de internet.
// Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-concentracion.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-26-concentracion')
mkdirSync(evidence, { recursive: true })
const CENTROS = { 'Ñuñoa': { lat: -33.4569, lng: -70.5976 }, 'Providencia': { lat: -33.4314, lng: -70.6093 }, 'Las Condes': { lat: -33.4089, lng: -70.5675 }, 'Vitacura': { lat: -33.3906, lng: -70.5711 }, 'La Cisterna': { lat: -33.5292, lng: -70.6633 }, 'Maipú': { lat: -33.5106, lng: -70.7572 }, 'La Florida': { lat: -33.5227, lng: -70.5986 }, 'Puente Alto': { lat: -33.6117, lng: -70.5758 } }

// Visitas de Calendly inventadas (no son clientes reales).
const ENCABEZADO = 'Invitee Name,Invitee Email,Start Date & Time,Location,Canceled,Question 1,Response 1,Marked as No-Show,Invitee UUID'
const filasCSV = [
  ['Prueba Uno', 'uno@example.cl', '2025-03-08 10:00', 'Grecia 1500, Ñuñoa'], ['Prueba Dos', 'dos@example.cl', '2025-03-08 10:30', 'Irarrázaval 3000, Ñuñoa'],
  ['Prueba Tres', 'tres@example.cl', '2025-04-12 11:00', 'Pedro de Valdivia 100, Providencia'], ['Prueba Cuatro', 'cuatro@example.cl', '2025-05-03 15:00', 'Apoquindo 3000, Las Condes'],
  ['Prueba Cinco', 'cinco@example.cl', '2025-06-07 09:00', 'Los Aromos 6858 viracura'], ['Prueba Seis', 'seis@example.cl', '2025-06-07 12:00', 'Pajaritos 2000, Maipú'],
  ['Prueba Siete', 'siete@example.cl', '2025-07-05 10:00', 'Calle sin comuna 12, depto 4'],
].map(([n, e, f, d], i) => [n, e, f, `'+56 9 1000 00${i}0`, 'false', 'Ingrese su dirección', `"${d}"`, 'No', `uuid-prueba-${i}`].join(','))
const CSV = [ENCABEZADO, ...filasCSV].join('\n')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1300, height: 950 }, acceptDownloads: true })
  await context.addInitScript(c => localStorage.setItem('dm_centros_comunas_v1', c), JSON.stringify(CENTROS))
  const page = await context.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))

  // Dos visitas proximas el mismo dia (para el mapa del dia), una con coordenadas.
  const { dias } = await (await page.request.get(base + '/.netlify/functions/visitas-rangos')).json()
  const dia = dias[0]
  for (const [nombre, direccion, comuna, lat, lng] of [['Próxima Exacta', 'Av. Grecia 1500', 'Ñuñoa', -33.4559, -70.6012], ['Próxima Aprox', 'Apoquindo 4000', 'Las Condes']]) {
    const r = await (await page.request.post(base + '/.netlify/functions/create_event', { data: { nombre, apellido: 'Mapa', email: `${nombre.split(' ')[1].toLowerCase()}@example.cl`, celular: '9 2222 3333', direccion, comuna, ...(lat ? { lat, lng } : {}), fechaISO: dia.fecha, rango: dia.rangos[0].desde } })).json()
    expect(r.ok).toBe(true)
  }

  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Visitas', exact: true }).click()

  // Mapa del dia (proximas): numerado por hora, descargable.
  const grupo = page.getByTestId('dia-visitas').filter({ hasText: 'Próxima Exacta' })
  await grupo.getByRole('button', { name: '🗺 Mapa del día' }).click()
  const mapaDia = grupo.getByTestId('mapa-visitas')
  await expect(mapaDia.locator('.leaflet-marker-icon')).toHaveCount(2)
  await expect(mapaDia.locator('.leaflet-tooltip')).toHaveCount(2)
  await expect(mapaDia).toContainText('1 en su dirección')
  await page.waitForTimeout(800)
  await mapaDia.screenshot({ path: path.join(evidence, '01-mapa-del-dia.png') })
  const [descarga] = await Promise.all([page.waitForEvent('download'), mapaDia.getByRole('button', { name: '📷 Descargar imagen' }).click()])
  expect(descarga.suggestedFilename()).toMatch(/^Visitas \d{4}-\d{2}-\d{2}\.png$/)

  // Concentracion: importar el CSV de Calendly.
  await page.getByRole('button', { name: '📊 Concentración' }).click()
  const importar = page.getByTestId('importar-calendly')
  await importar.getByLabel('Archivo CSV de Calendly').setInputFiles({ name: 'events-export.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
  await importar.getByRole('button', { name: 'Revisar' }).click()
  await expect(importar.getByRole('status')).toContainText('7 en el archivo · 7 nuevas · 0 ya estaban · 1 sin comuna')
  await importar.getByRole('button', { name: 'Importar 7' }).click()
  await expect(importar.getByRole('status')).toContainText('✓ 7 visitas agregadas a la hoja Visitas')
  await expect(importar.getByRole('status')).toContainText('Por revisar: 7')

  const conc = page.getByTestId('concentracion')
  await expect(conc.getByTestId('tabla-comunas')).toContainText('Ñuñoa')
  const filaNunoa = conc.getByTestId('tabla-comunas').locator('tr', { hasText: 'Ñuñoa' })
  await expect(filaNunoa.locator('td').nth(2)).toHaveText('3') // 2 de Calendly + la proxima
  await expect(conc.getByTestId('tabla-sectores').locator('tr', { hasText: 'Oriente' }).locator('td').nth(2)).toHaveText('7')
  await expect(conc.locator('canvas.leaflet-heatmap-layer')).toHaveCount(1)
  await expect(conc).toContainText(/\d+ sin comuna ni ubicación/)
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(evidence, '02-concentracion-calor.png'), fullPage: true })

  await conc.getByRole('button', { name: '⚪ Por comuna' }).click()
  await expect(conc.locator('.leaflet-tooltip', { hasText: 'Ñuñoa: 3' })).toBeVisible()
  await conc.getByRole('button', { name: 'Calendly por revisar' }).click()
  await expect(conc.getByTestId('tabla-comunas').locator('tr', { hasText: 'Ñuñoa' }).locator('td').nth(2)).toHaveText('2')
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(evidence, '03-concentracion-comunas.png'), fullPage: true })

  // Subirlo de nuevo no las repite.
  await importar.getByRole('button', { name: 'Revisar' }).click()
  await expect(importar.getByRole('status')).toContainText('0 nuevas · 7 ya estaban')

  // Pestaña Calendly: se concilian a mano y no se mezclan con las otras pestañas.
  await page.getByRole('button', { name: '← Volver a la lista' }).click()
  await page.getByRole('button', { name: /^Realizadas\s*\d/ }).first().click()
  await expect(page.getByText('Prueba Cinco', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /^Calendly\s*7/ }).click()
  await expect(page.getByRole('button', { name: 'Por revisar (7)' })).toBeVisible()
  const cinco = page.getByTestId('conciliar-calendly').filter({ has: page.getByRole('button', { name: 'Realizada y cotizada' }) }).nth(0)
  const nombrePrimera = await page.getByTestId('dia-visitas').first().locator('strong, span').filter({ hasText: /Prueba/ }).first().innerText()
  await cinco.getByRole('button', { name: 'Realizada y cotizada' }).click()
  await expect(page.getByRole('button', { name: 'Por revisar (6)' })).toBeVisible()
  await page.getByRole('button', { name: 'Realizadas y cotizadas (1)' }).click()
  await expect(page.getByText(nombrePrimera, { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(evidence, '04-pestana-calendly.png') })

  // Instalaciones: trabajos realizados en el mapa, con puntos pequeños y su ficha.
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, body) => (await page.request[body ? 'post' : 'get'](base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token }, ...(body ? { data: body } : {}) })).json()
  const crearTrabajo = async (nombre, direccion, total) => {
    const { siguiente } = await api('get-quotes')
    const r = await api('save-quote', { crear: true, cotNum: siguiente, nombre, email: 'trabajo@example.cl', telefono: '9 1234 5678', direccion, status: 'confirmada', repisas: [{ largo: 2.43, prof: 0.48, alto: 2, niveles: 4, unidades: 1, valor: total }], adicionales: {}, subtotal: total, iva: 0, total, instalacion: { fecha: '2026-03-10', inicio: '10:00', fin: '13:00', instalada: true } })
    expect(r.ok).toBe(true)
    return r.cotNum
  }
  const t1 = await crearTrabajo('Trabajo Ñuñoa', 'Grecia 1500, Ñuñoa', 300000)
  await crearTrabajo('Trabajo Las Condes', 'Apoquindo 3000, Las Condes', 500000)
  // La ubicacion exacta como la deja "📍 Ubicar en el mapa" (en local no hay clave de Google).
  expect((await api('planilla', { accion: 'ubicaciones', ubicaciones: [{ cotNum: t1, lat: -33.4559, lng: -70.6012, comuna: 'Ñuñoa' }] })).guardadas).toBe(1)
  await page.getByRole('navigation').getByRole('button', { name: 'Instalaciones', exact: true }).click()
  await page.getByRole('button', { name: '🗺 Mapa' }).click()
  const mapaInst = page.getByTestId('mapa-instalaciones')
  await expect(mapaInst).toContainText('1 en su dirección')
  await expect(mapaInst.getByTestId('instalaciones-comunas').locator('tr', { hasText: 'Las Condes' })).toContainText('$500.000')
  const exacto = mapaInst.locator('path.leaflet-interactive[fill="' + '#A86E14' + '"]')
  await expect(exacto).toHaveCount(1)
  await exacto.click({ force: true })
  await expect(page.locator('.leaflet-popup-content')).toContainText('Trabajo Ñuñoa')
  await page.waitForTimeout(800)
  await mapaInst.screenshot({ path: path.join(evidence, '05-instalaciones.png') })

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, evidence }))
} finally { await browser.close() }
