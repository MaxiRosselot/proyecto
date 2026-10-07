// Prueba E2E del login, el correlativo y el modelo 3D guardado con cada cotizacion.
// Corre contra el entorno local (start-native.mjs): no toca Google ni datos reales.
//   node scripts/local-dev/verify-cotizaciones.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo'
const evidence = path.resolve('docs/evidence/2026-10-05-cotizaciones')
mkdirSync(evidence, { recursive: true })

// Dos bodegas que se distinguen por el muro del fondo y la profundidad.
const bodega = (nombre, fondo, profundidad) => ({
  projectName: nombre, units: 'cm',
  room: { backWallCm: fondo, leftWallCm: 240, rightWallCm: 240, heightCm: 250, door: { wall: 'front', fromLeftCornerCm: 80, toRightCornerCm: fondo - 160, widthCm: 80 } },
  shelving: { layout: 'manual', heightCm: 200, depthCm: profundidad, runs: [{ id: 'A', wall: 'back', startCm: 0, lengthCm: fondo - 60, heightCm: 200, depthCm: profundidad }] },
})
const BODEGA_A = bodega('Bodega cliente A', 300, 48)
const BODEGA_B = bodega('Bodega cliente B', 420, 38)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  const borrador = () => page.evaluate(() => JSON.parse(localStorage.getItem('dm_cotizador_state') || 'null'))
  const shot = name => page.screenshot({ path: path.join(evidence, name), fullPage: true })

  // ── Login en el servidor ──
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill('2003')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByText('Contraseña incorrecta')).toBeVisible()
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = (ruta, opts = {}) => page.request.fetch(base + '/.netlify/functions/' + ruta, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } })

  expect((await page.request.get(base + '/.netlify/functions/get-quotes')).status()).toBe(401)
  expect((await page.request.get(base + '/.netlify/functions/get-quotes', { headers: { 'x-admin-password': '2003' } })).status()).toBe(401)
  const siguienteInicial = (await (await api('get-quotes?siguiente=1')).json()).siguiente

  // ── Dos cotizaciones nuevas, cada una con su bodega ──
  async function cotizar(cliente, proyecto) {
    await page.getByRole('navigation').getByRole('button', { name: 'Cotizar', exact: true }).click()
    await page.getByRole('button', { name: 'Reiniciar' }).click()
    await page.getByRole('button', { name: 'Ingreso manual' }).click()
    await page.getByPlaceholder('Nombre completo').fill(cliente)
    await page.getByPlaceholder('correo@ejemplo.com').fill(cliente.toLowerCase().replace(/\W+/g, '.') + '@example.com')
    await expect(page.getByTestId('numero-cotizacion')).toHaveText(/N° \d+/)

    await page.getByRole('button', { name: 'Pantalla completa' }).click()
    const modal = page.frameLocator('iframe[title="Configurador Repisas 3D"]')
    await expect(modal.locator('.room-dimensions-section')).toBeVisible({ timeout: 30000 })
    await page.evaluate(project => document.querySelector('iframe[title="Configurador Repisas 3D"]').contentWindow
      .postMessage({ type: 'repisas:load-project', version: '1', requestId: 'e2e', payload: { project } }, location.origin), proyecto)
    await expect.poll(async () => (await borrador())?.project3d?.room?.backWallCm).toBe(proyecto.room.backWallCm)
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

    await page.getByRole('button', { name: 'Generar Cotizacion PDF' }).click()
    await expect(page.getByText(/Cotización N° \d+ guardada con su modelo 3D/)).toBeVisible({ timeout: 120000 })
    const { cotGuardada, project3d } = await borrador()
    return { numero: cotGuardada.cotNum, project3d }
  }

  const a = await cotizar('Cliente Prueba A', BODEGA_A)
  await shot('01-cotizacion-a-guardada.png')
  const b = await cotizar('Cliente Prueba B', BODEGA_B)
  expect(Number(a.numero)).toBe(siguienteInicial)
  expect(Number(b.numero)).toBe(siguienteInicial + 1)

  // Lo guardado es exactamente el proyecto que tenia el cotizador al generar, y cada una el suyo.
  for (const [numero, esperado, fondo] of [[a.numero, a.project3d, 300], [b.numero, b.project3d, 420]]) {
    const { quote } = await (await api('get-quotes?cotNum=' + numero)).json()
    expect(quote.proyecto3d).toEqual(esperado)
    expect(quote.proyecto3d.room.backWallCm).toBe(fondo)
    expect(quote.repisas.length).toBeGreaterThan(0)
    expect(quote.pdfUrl).toContain('/.netlify/functions/local-pdf?id=')
    expect((await (await page.request.get(quote.pdfUrl)).body()).subarray(0, 4).toString()).toBe('%PDF')
  }

  // Un numero tomado no se puede volver a crear.
  const choque = await api('save-quote', { method: 'POST', data: { crear: true, cotNum: Number(a.numero), nombre: 'Intruso' } })
  expect(choque.status()).toBe(409)
  expect((await choque.json()).siguiente).toBe(Number(b.numero) + 1)

  // ── Lista: mas nuevas arriba, con su modelo ──
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await expect(page.getByText('Cliente Prueba B')).toBeVisible()
  const texto = await page.locator('main').innerText()
  expect(texto.indexOf('Cliente Prueba B')).toBeLessThan(texto.indexOf('Cliente Prueba A'))
  expect(texto.indexOf('Cliente Prueba A')).toBeLessThan(texto.indexOf('Ignacio Vera Salas'))
  await expect.poll(() => page.getByText('Modelo 3D', { exact: true }).count()).toBeGreaterThanOrEqual(2)
  await shot('02-lista-ordenada.png')

  // Confirmar A desde la lista no debe borrarle el modelo.
  await page.getByText('Cliente Prueba A').click()
  await page.getByRole('button', { name: 'Confirmada', exact: true }).click()
  await expect.poll(async () => (await (await api('get-quotes?cotNum=' + a.numero)).json()).quote.status).toBe('confirmada')
  const confirmada = (await (await api('get-quotes?cotNum=' + a.numero)).json()).quote
  expect(confirmada.proyecto3d).toEqual(a.project3d)

  // ── Reabrir A en el cotizador, con su bodega, y regenerarla sin crear otra ──
  await page.getByRole('button', { name: /^Confirmadas/ }).click()
  // La tarjeta sigue expandida desde la otra pestaña; un clic en el nombre la cerraria.
  const abrir = page.getByRole('button', { name: 'Abrir en cotizador' })
  if (!(await abrir.isVisible())) await page.getByText('Cliente Prueba A').click()
  await abrir.click()
  await expect(page.getByTestId('numero-cotizacion')).toHaveText('N° ' + a.numero)
  await expect(page.getByText('Guardada', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Cliente Prueba A')
  expect((await borrador()).project3d).toEqual(a.project3d)
  await expect.poll(() => page.frameLocator('iframe[title="Vista 3D de la cotizacion"]').locator('canvas').first()
    .evaluate(c => c.toDataURL().length), { timeout: 30000 }).toBeGreaterThan(10000)
  await shot('03-reabierta-con-modelo.png')

  const antes = (await (await api('get-quotes')).json()).quotes.length
  await page.getByRole('button', { name: 'Generar Cotizacion PDF' }).click()
  await expect(page.getByText(`Cotización N° ${a.numero} guardada con su modelo 3D`)).toBeVisible({ timeout: 120000 })
  const lista = (await (await api('get-quotes')).json()).quotes
  expect(lista.length).toBe(antes)
  const regenerada = (await (await api('get-quotes?cotNum=' + a.numero)).json()).quote
  expect(regenerada.status).toBe('confirmada')
  expect(regenerada.creado).toBe(confirmada.creado)
  expect(regenerada.proyecto3d.room.backWallCm).toBe(300)
  await shot('04-regenerada-mismo-numero.png')

  // Cerrar sesion vuelve al login.
  await page.getByRole('button', { name: 'Cerrar sesion' }).click()
  await expect(page.locator('input[type=password]')).toBeVisible()

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, a: a.numero, b: b.numero, evidence }))
} finally { await browser.close() }
