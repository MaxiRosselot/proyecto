// Prueba E2E del cotizador para clientes (/cotiza) en celular, contra el entorno local
// (start-native.mjs). No toca Google: el PDF y los correos quedan en scripts/local-dev/.
//   node scripts/local-dev/verify-cotiza.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo'
const evidence = path.resolve('docs/evidence/2026-10-07-cotiza')
const correos = path.resolve('scripts/local-dev/correos')
mkdirSync(evidence, { recursive: true })
const pesos = n => '$' + n.toLocaleString('es-CL')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  const shot = name => page.screenshot({ path: path.join(evidence, name), fullPage: true })

  await page.goto(base + '/cotiza')
  await expect(page.getByRole('heading', { name: 'Cotiza tus repisas' })).toBeVisible()
  const cfg = page.frameLocator('iframe[title="Arma tus repisas"]')

  // ── Paso 1: medidas y puerta ──
  await expect(cfg.getByRole('heading', { name: 'Mide tu bodega' })).toBeVisible({ timeout: 30000 })
  const medida = etiqueta => cfg.getByLabel(new RegExp(`^${etiqueta}`))
  await medida('A Muro').fill('400')
  await medida('B · E').fill('220')
  await medida('Alto').fill('260')
  await expect(medida('Ancho de la puerta')).toHaveValue('80')
  const posicion = cfg.getByLabel('Posición de la puerta, desde la esquina izquierda')
  await posicion.fill('160')
  // C y D salen solos de la posicion de la puerta, y el plano los rotula.
  await expect(cfg.getByText('D · 160 cm').first()).toBeVisible()
  await expect(cfg.getByText('C · 160 cm').first()).toBeVisible()
  await shot('01-medidas.png')
  // En la esquina, C o D ya no se rotulan en el plano.
  await cfg.getByRole('button', { name: 'Esquina izquierda' }).click()
  await expect(cfg.locator('svg.cli-planta text', { hasText: /^D ·/ })).toHaveCount(0)
  await expect(cfg.locator('svg.cli-planta text', { hasText: 'C · 320 cm' })).toHaveCount(1)
  // Una puerta imposible avisa y no deja seguir.
  await medida('Ancho de la puerta').fill('500')
  await expect(cfg.getByText(/ancho de la puerta debe estar/)).toBeVisible()
  await expect(cfg.getByRole('button', { name: 'Ver mis repisas' })).toBeDisabled()
  await medida('Ancho de la puerta').fill('80')
  await posicion.fill('160')
  await cfg.getByRole('button', { name: 'Ver mis repisas' }).click()

  // ── Paso 2: repisas ──
  await expect(cfg.getByTestId('cliente-visor').locator('canvas')).toBeVisible({ timeout: 30000 })
  await cfg.getByRole('button', { name: /Solo fondo/ }).click()
  const modulos = cfg.getByTestId('cliente-modulo')
  // 400 cm de fondo: 243 + 157, con su precio de la tabla (110.000 y 90.000 netos).
  await expect(modulos).toHaveCount(2)
  await expect(modulos.nth(0)).toContainText(pesos(130900))
  await expect(modulos.nth(1)).toContainText(pesos(107100))
  await expect(cfg.getByTestId('cliente-total')).toHaveText(pesos(238000))

  // Puerta a 30 cm de la esquina izquierda: una repisa de 48 cm a la izquierda la taparia 18 cm,
  // asi que esa profundidad se bloquea y se ajusta sola a 38 cm.
  await cfg.getByRole('button', { name: /Tu bodega/ }).click()
  await posicion.fill('30')
  await cfg.getByRole('button', { name: 'Ver mis repisas' }).click()
  await cfg.getByRole('button', { name: /Fondo \+ izquierda/ }).click()
  await expect(cfg.getByRole('button', { name: '48 cm' })).toBeDisabled()
  await expect(cfg.getByRole('button', { name: '38 cm' })).toHaveAttribute('aria-pressed', 'true')
  await expect(cfg.getByRole('status')).toContainText('tapa 18 cm de la puerta por la izquierda')
  await shot('02a-puerta-tapada.png')
  await cfg.getByRole('button', { name: /Tu bodega/ }).click()
  await posicion.fill('160')
  await cfg.getByRole('button', { name: 'Ver mis repisas' }).click()

  // En L: el fondo (el muro mas largo) va entero y el costado se acomoda en la esquina:
  // 220 - 48 = 172 cm, cubiertos completos.
  await cfg.getByRole('button', { name: /Fondo \+ derecha/ }).click()
  const costado = modulos.filter({ hasText: 'Derecha (B)' })
  await expect(costado).toHaveCount(1)
  await expect(costado).toContainText('1,72 m')
  await expect(modulos.filter({ hasText: 'Fondo (A)' })).toHaveCount(2)
  // Otra profundidad cambia los precios.
  const totalL48 = await cfg.getByTestId('cliente-total').textContent()
  await cfg.getByRole('button', { name: '38 cm' }).click()
  await expect(cfg.getByTestId('cliente-total')).not.toHaveText(totalL48)
  await cfg.getByRole('button', { name: '48 cm' }).click()
  await expect(cfg.getByTestId('cliente-total')).toHaveText(totalL48)

  // Vista en plano con los modulos numerados.
  await cfg.getByRole('tab', { name: 'Plano' }).click()
  await expect(cfg.locator('.cli-visor svg .cli-planta-modulo')).toHaveCount(3)
  await shot('02b-plano.png')
  await cfg.getByRole('tab', { name: '3D' }).click()

  // Colgador en el modulo del costado: quedan menos niveles y el precio no cambia.
  await expect(costado).toContainText('4 niveles')
  await costado.getByText('Colgador').click()
  await expect(costado).toContainText('2 niveles')
  await expect(cfg.getByTestId('cliente-total')).toHaveText(totalL48)
  await expect.poll(() => cfg.getByTestId('cliente-visor').locator('canvas').evaluate(c => c.toDataURL().length), { timeout: 30000 }).toBeGreaterThan(10000)
  await shot('02-repisas-con-colgador.png')

  // ── Envio ──
  await expect(page.locator('.ctz-barra')).toContainText(totalL48)
  await page.getByRole('textbox', { name: 'Nombre' }).fill('Cliente Web Prueba')
  await page.getByRole('textbox', { name: 'Correo' }).fill('cliente.web@example.com')
  await page.getByRole('textbox', { name: 'Teléfono' }).fill('+56 9 2222 3333')
  await page.getByRole('textbox', { name: /Dirección/ }).fill('Ñuñoa')
  const antes = (() => { try { return readdirSync(correos).length } catch { return 0 } })()
  await page.getByRole('button', { name: /Enviar cotización/ }).click()
  await expect(page.getByRole('heading', { name: '¡Tu cotización está lista!' })).toBeVisible({ timeout: 90000 })
  await expect(page.getByText('cliente.web@example.com')).toBeVisible()
  const numero = (await page.locator('.ctz-listo-numero').textContent()).match(/\d+/)[0]
  // Empuja a cerrar ahora: oferta, pago en linea y WhatsApp con la cotizacion. Nada de agendar visita.
  await expect(page.locator('.ctz-listo-total')).toContainText(totalL48)
  await expect(page.getByText('10% de descuento adicional')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pagar y reservar instalación' })).toHaveAttribute('href', 'https://link.mercadopago.cl/repisasdonmaxi')
  await expect(page.getByRole('link', { name: 'Aceptar por WhatsApp' })).toHaveAttribute('href', new RegExp(`wa\\.me/56951020367\\?text=.*${numero}`))
  await expect(page.getByText(/visita/i).filter({ visible: true })).toHaveCount(0)
  await page.getByText('Pagar por transferencia').click()
  await expect(page.getByText('13702807')).toBeVisible()
  await shot('03-enviada.png')

  // Correos al cliente y a Don Maxi, con el PDF adjunto.
  const nuevos = readdirSync(correos).sort().slice(antes)
  expect(nuevos.length).toBe(2)
  const alCliente = readFileSync(path.join(correos, nuevos.find(n => n.includes('cliente.web'))), 'utf8')
  expect(alCliente).toMatch(/Content-Type: application\/pdf/)

  // ── Admin: quedo en Cotizaciones con su modelo, por confirmar ──
  const admin = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  admin.on('pageerror', e => errors.push(e.stack || e.message))
  await admin.goto(base + '/admin')
  await admin.locator('input[type=password]').fill(PASSWORD)
  await admin.getByRole('button', { name: 'Ingresar' }).click()
  await expect(admin.getByRole('navigation')).toBeVisible()
  const token = await admin.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const { quote } = await (await admin.request.get(`${base}/.netlify/functions/get-quotes?cotNum=${numero}`, { headers: { Authorization: 'Bearer ' + token } })).json()
  expect(quote.nombre).toBe('Cliente Web Prueba')
  expect(quote.status).toBe('por confirmar')
  expect(quote.notas).toMatch(/Cotización web/)
  expect(pesos(Number(quote.total))).toBe(totalL48)
  expect(quote.repisas.filter(r => r.colgador)).toHaveLength(1)
  expect(quote.proyecto3d.shelving.runs.some(r => r.variants?.some(v => v.type === 'hanging-rod'))).toBe(true)
  expect((await (await admin.request.get(quote.pdfUrl)).body()).subarray(0, 4).toString()).toBe('%PDF')

  await admin.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await expect(admin.getByText('Cliente Web Prueba').first()).toBeVisible()
  await admin.screenshot({ path: path.join(evidence, '04-admin-cotizacion-web.png') })

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, numero, total: totalL48, evidence }))
} finally { await browser.close() }
