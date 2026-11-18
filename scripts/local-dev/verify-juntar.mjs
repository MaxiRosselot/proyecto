// Prueba E2E de Admin → Cotizaciones → "Juntar cotizaciones": elegir 2, revisar el cliente y armar
// el presupuesto conjunto (con las vistas 3D dibujadas por el visor local).
//   node scripts/local-dev/verify-juntar.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve(process.env.EVIDENCIA || 'docs/evidence/2026-11-18-juntar')
mkdirSync(evidence, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, acceptDownloads: true })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = (ruta, data) => (data ? page.request.post(base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token }, data }) : page.request.get(base + '/.netlify/functions/' + ruta, { headers: { Authorization: 'Bearer ' + token } })).then(r => r.json())
  // Dos bodegas del mismo cliente, con su modelo 3D.
  const proyecto = (ancho, fondo, largo) => ({ units: 'cm', room: { backWallCm: ancho, leftWallCm: fondo, rightWallCm: fondo, heightCm: 240, door: { wall: 'front', fromLeftCornerCm: 0, toRightCornerCm: ancho - 80, widthCm: 80, heightCm: 200 } },
    shelving: { layout: 'manual', heightCm: 200, depthCm: 48, runs: [{ id: 'r1', wall: 'back', startCm: 0, lengthCm: largo }] } })
  const crear = async (nombre, largo, valor, proyecto3d) => {
    const { siguiente } = await api('get-quotes?siguiente=1')
    const r = await api('save-quote', { crear: true, cotNum: siguiente, nombre, telefono: '+56 9 5555 0000', status: 'por confirmar',
      repisas: [{ largo, prof: 0.48, alto: 2, niveles: 4, unidades: 1, valor, kind: 'shelf' }], adicionales: {}, subtotal: valor, iva: Math.round(valor * .19), total: Math.round(valor * 1.19), proyecto3d })
    if (!r.ok) throw new Error('No se creó la cotización de prueba: ' + r.error)
    return { cotNum: siguiente, nombre }
  }
  const a = await crear('Cliente Juntar', 2, 120000, proyecto(245, 195, 200))
  const b = await crear('Cliente Juntar (bodega 2)', 1.5, 90000, proyecto(180, 150, 150))
  await page.reload(); await expect(page.getByRole('navigation')).toBeVisible()

  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await page.getByRole('button', { name: 'Juntar cotizaciones' }).click()
  const panel = page.getByTestId('panel-juntar')
  await expect(panel).toContainText('Marca abajo las cotizaciones')
  await page.getByLabel(`Juntar N${a.cotNum}`).check()
  await page.getByLabel(`Juntar N${b.cotNum}`).check()
  await expect(panel).toContainText(`Bodega 1 · N${a.cotNum}`)
  await expect(panel).toContainText(`Bodega 2 · N${b.cotNum}`)
  await expect(panel.getByLabel('Cliente')).toHaveValue(a.nombre)
  await panel.getByLabel('Cliente').fill('Cliente Varias Bodegas')
  await page.screenshot({ path: path.join(evidence, '01-elegidas.png') })

  await panel.getByRole('button', { name: /Armar presupuesto \(2\)/ }).click()
  const descargar = panel.getByTestId('descargar-presupuesto')
  await expect(descargar).toBeVisible({ timeout: 120000 })
  const [descarga] = await Promise.all([page.waitForEvent('download'), descargar.click()])
  const archivo = path.join(evidence, 'presupuesto.pdf')
  await descarga.saveAs(archivo)
  const pdf = readFileSync(archivo)
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('No es un PDF')
  const paginas = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length
  if (paginas !== 1 + 2 + 3) throw new Error('Paginas: ' + paginas)
  expect(descarga.suggestedFilename()).toMatch(/Presupuesto Cliente Varias Bodegas - 2 bodegas/)
  await page.screenshot({ path: path.join(evidence, '02-listo.png') })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('verify-juntar: ok', { a: a.cotNum, b: b.cotNum, paginas })
} finally { await browser.close() }
