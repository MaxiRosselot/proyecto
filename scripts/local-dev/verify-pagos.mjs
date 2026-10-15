// Prueba E2E del pago en linea: link de la cotizacion → /pagar → Mercado Pago (simulado en el
// backend local) → aviso → pago registrado con la oferta, boleta anotada y dashboard al dia.
// Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-pagos.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo'
const evidence = path.resolve('docs/evidence/2026-10-15-pagos')
mkdirSync(evidence, { recursive: true })
const pesos = n => '$' + n.toLocaleString('es-CL')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const admin = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []; admin.on('pageerror', e => errors.push(e.stack || e.message))
  await admin.goto(base + '/admin')
  await admin.locator('input[type=password]').fill(PASSWORD)
  await admin.getByRole('button', { name: 'Ingresar' }).click()
  await expect(admin.getByRole('navigation')).toBeVisible()
  const token = await admin.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => {
    const r = await admin.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })
    return r.json()
  }

  // Cotizacion recien creada: $200.000 neto → $238.000; con la oferta, $214.200.
  const creada = await api('save-quote', { crear: true, nombre: 'Rocío Fuentes', email: 'rocio@example.cl', telefono: '9 5555 1234', direccion: 'Los Leones 200',
    subtotal: 200000, iva: 38000, total: 238000, repisas: [{ largo: 2.43, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 200000 }], adicionales: {} })
  expect(creada.linkPago).toMatch(new RegExp(`^${base}/pagar\\?c=${creada.cotNum}&t=`))
  const { quote } = await api('get-quotes?cotNum=' + creada.cotNum)
  expect(quote.linkPago).toBe(creada.linkPago)

  // ── El cliente abre el link en el celular ──
  const cliente = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  cliente.on('pageerror', e => errors.push(e.stack || e.message))
  await cliente.goto(creada.linkPago)
  await expect(cliente.getByRole('heading', { name: /Hola Rocío/ })).toBeVisible()
  await expect(cliente.getByText(/10% de descuento si pagas antes/)).toBeVisible()
  await expect(cliente.getByRole('link', { name: /Pagar el total/ })).toContainText(pesos(214200))
  await expect(cliente.getByRole('link', { name: /Abonar el 50%/ })).toContainText(pesos(107100))
  await cliente.screenshot({ path: path.join(evidence, '01-pagar-celular.png'), fullPage: true })
  // Un link alterado no muestra nada.
  expect((await cliente.request.get(creada.linkPago.replace(/t=[^&]+/, 't=alterado'))).status()).toBe(404)

  await cliente.getByRole('link', { name: /Abonar el 50%/ }).click()
  await expect(cliente.getByText('Mercado Pago · simulado')).toBeVisible()
  await cliente.getByRole('button', { name: 'Pagar (simulado)' }).click()
  await expect(cliente.getByRole('heading', { name: /Pago recibido/ })).toBeVisible()
  await cliente.screenshot({ path: path.join(evidence, '02-pago-recibido.png'), fullPage: true })

  // Quedo registrado solo: abono, oferta aplicada y cotizacion confirmada.
  const pagada = (await api('get-quotes?cotNum=' + creada.cotNum)).quote
  expect(pagada.status).toBe('confirmada')
  expect(pagada.adicionales.descuento_pct).toBe(10)
  expect(Number(pagada.total)).toBe(214200)
  expect(pagada.pagos.map(p => [p.monto, p.medio])).toEqual([[107100, 'Mercado Pago']])
  // Volver a abrir el link: solo queda el saldo.
  await cliente.goto(creada.linkPago)
  await expect(cliente.getByRole('link', { name: /Pagar el saldo/ })).toContainText(pesos(107100))

  // ── En el panel: el pago en linea, la boleta y el link para cobrar el saldo ──
  await admin.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await admin.getByRole('button', { name: /^Confirmadas/ }).click()
  await admin.getByText('Rocío Fuentes').click()
  const tarjeta = admin.locator('#cot-' + creada.cotNum)
  const pagos = tarjeta.getByTestId('pagos')
  await expect(pagos).toContainText('Mercado Pago (en línea)')
  await expect(pagos).toContainText('saldo ' + pesos(107100))
  await expect(pagos.getByRole('button', { name: 'Copiar link de pago' })).toBeVisible()
  await expect(tarjeta.getByRole('link', { name: 'WhatsApp al cliente' })).toHaveCount(0) // sin PDF todavia
  await pagos.getByRole('button', { name: 'Anotar boleta' }).click()
  await pagos.getByLabel('N° de boleta').fill('4521')
  await pagos.getByRole('button', { name: 'OK' }).click()
  await expect(pagos.getByRole('button', { name: 'Boleta N° 4521' })).toBeVisible()
  // Al agendar, el descuento de la oferta ya viene marcado.
  await tarjeta.getByRole('button', { name: 'Agendar instalación' }).click()
  await expect(tarjeta.getByRole('button', { name: /Oferta 48 h · 10%/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(tarjeta.getByTestId('total-instalacion')).toHaveText('Total ' + pesos(214200))
  await admin.screenshot({ path: path.join(evidence, '03-panel-pagos.png'), fullPage: true })

  // ── Dashboard: un pago por transferencia sin boleta aparece pendiente, y se anota ahi ──
  await api('pagos', { accion: 'registrar', cotNum: creada.cotNum, monto: 50000, medio: 'Transferencia', fecha: '2026-10-15' })
  await admin.getByRole('navigation').getByRole('button', { name: 'Instalaciones', exact: true }).click()
  const pendientes = admin.getByTestId('boletas-pendientes')
  await expect(pendientes).toContainText(`1 pago sin boleta · ${pesos(50000)}`)
  await pendientes.getByRole('button', { name: 'Ver y anotar' }).click()
  await expect(pendientes).toContainText('Rocío Fuentes')
  await admin.screenshot({ path: path.join(evidence, '04-boletas-pendientes.png'), fullPage: true })
  const fila = pendientes.locator('div', { hasText: 'Rocío Fuentes' }).filter({ hasText: pesos(50000) }).last()
  await fila.getByRole('button', { name: 'Anotar boleta' }).click()
  await fila.getByLabel('N° de boleta').fill('4522')
  await fila.getByRole('button', { name: 'OK' }).click()
  await expect.poll(async () => (await api('get-quotes?cotNum=' + creada.cotNum)).quote.pagos.map(p => p.boleta)).toEqual(['4521', '4522'])
  await expect(pendientes.getByText('Rocío Fuentes')).toHaveCount(0)

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, cotNum: creada.cotNum, evidence }))
} finally { await browser.close() }
