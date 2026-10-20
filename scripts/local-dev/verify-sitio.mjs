// Prueba E2E del sitio publico: las paginas, la navegacion, la galeria, las preguntas, el contacto,
// "Envíanos fotos o un video" (archivos en trozos + correos) y Admin → Web (la foto subida reemplaza
// a la de ejemplo en la web). Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-sitio.mjs
import { chromium, devices, expect } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-20-sitio')
mkdirSync(evidence, { recursive: true })
const correosDir = path.resolve('scripts/local-dev/correos')
const correos = () => { try { return readdirSync(correosDir).map(f => path.join(correosDir, f)).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs) } catch { return [] } }
const asunto = f => { const b = readFileSync(f, 'utf8').match(/Subject: (?:=\?UTF-8\?B\?(.+?)\?=|(.+))/); return b?.[1] ? Buffer.from(b[1], 'base64').toString('utf8') : b?.[2] }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))

  // Inicio
  await page.goto(base + '/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Repisas de madera')
  await expect(page).toHaveTitle(/Repisas Don Maxi/)
  await expect(page.locator('.st-hero-foto')).toHaveJSProperty('complete', true)
  await expect(page.getByText('instalaciones en 2025')).toBeVisible()
  await expect(page.locator(".st-destacada")).toHaveCount(5)
  // Las fotos van con carga diferida: se recorre la pagina para que la captura salga completa.
  const cargarTodo = async p => { for (let y = 0; y < 9000; y += 600) { await p.mouse.wheel(0, 600); await p.waitForTimeout(60) } await p.waitForLoadState('networkidle'); await p.evaluate(() => window.scrollTo(0, 0)) }
  await cargarTodo(page)
  await expect(page.locator('.st-servicios img').first()).toHaveJSProperty('complete', true)
  await page.screenshot({ path: path.join(evidence, 'inicio.png'), fullPage: true })

  // Navegacion sin recargar: Cotizar con sus 3 opciones
  await page.evaluate(() => { window.__sinRecargar = true })
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Cotizar' }).click()
  await expect(page).toHaveURL(base + '/cotizar')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿Cómo prefieres cotizar?')
  expect(await page.evaluate(() => window.__sinRecargar)).toBe(true)
  await expect(page.getByTestId('opcion-cotizar-auto').getByRole('link', { name: /Cotizar ahora/ })).toHaveAttribute('href', '/cotiza')
  await expect(page.getByTestId('opcion-cotizar-visita').getByRole('link', { name: /Agendar visita/ })).toHaveAttribute('href', '/visita')
  await page.screenshot({ path: path.join(evidence, 'cotizar.png'), fullPage: true })

  // Fotos: filtro y visor
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Fotos' }).click()
  const total = await page.locator('.st-galeria-foto').count()
  expect(total).toBeGreaterThan(40)
  await page.getByRole('button', { name: 'Bicicletas' }).click()
  await expect(page.locator('.st-galeria-foto')).toHaveCount(4)
  await page.locator('.st-galeria-foto').first().click()
  await expect(page.getByRole('dialog', { name: 'Foto ampliada' })).toContainText('1 / 4')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog')).toContainText('2 / 4')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Todas' }).click()
  await page.screenshot({ path: path.join(evidence, 'fotos.png') })

  // Preguntas
  await page.goto(base + '/preguntas')
  await page.getByText('¿Cómo pago?').click()
  await expect(page.getByText(/5% de descuento/).first()).toBeVisible()
  await page.screenshot({ path: path.join(evidence, 'preguntas.png'), fullPage: true })

  // Contacto
  await page.goto(base + '/contacto')
  const antes = correos().length
  await page.getByRole('button', { name: 'Enviar mensaje' }).click()
  await expect(page.getByRole('alert')).toContainText('nombre')
  await page.getByLabel('Nombre').fill('Ana Pérez')
  await page.getByLabel('Teléfono').fill('9 1234 5678')
  await page.getByLabel('Mensaje').fill('¿Instalan en Maipú?')
  await page.getByRole('button', { name: 'Enviar mensaje' }).click()
  await expect(page.getByTestId('contacto-listo')).toContainText('Gracias, Ana')
  expect(correos().slice(antes).map(asunto)).toEqual(['Contacto web: Ana Pérez'])

  // Enviar fotos o video (en celular)
  const cel = await browser.newPage({ ...devices['iPhone 13'] })
  cel.on('pageerror', e => errors.push(e.stack || e.message))
  await cel.goto(base + '/cotizar/fotos')
  // Un "video" de 4 MB para que viaje en dos trozos.
  const video = Buffer.alloc(4 * 1024 * 1024, 1)
  const foto = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')
  await cel.getByTestId('fotos-input').setInputFiles([{ name: 'bodega.jpg', mimeType: 'image/jpeg', buffer: foto }, { name: 'recorrido.mp4', mimeType: 'video/mp4', buffer: video }])
  await expect(cel.locator('.st-archivo')).toHaveCount(2)
  await cel.getByLabel('Nombre y apellido').fill('Paula Rojas')
  await cel.getByLabel('Correo').fill('paula@example.cl')
  await cel.getByLabel('Celular').fill('9 5555 4444')
  await cel.getByLabel('Comuna o dirección').fill('Ñuñoa')
  await cel.screenshot({ path: path.join(evidence, 'enviar-fotos-cel.png'), fullPage: true })
  const antesFotos = correos().length
  await cel.getByRole('button', { name: 'Enviar para cotizar' }).click()
  await expect(cel.getByTestId('fotos-listo')).toContainText('¡Recibimos tus fotos!', { timeout: 30000 })
  const nuevos = correos().slice(antesFotos)
  expect(nuevos.map(asunto)).toEqual(['📸 Cotizar por fotos: Paula Rojas · Ñuñoa', 'Recibimos tus fotos · Repisas Don Maxi'])
  const cuerpo = Buffer.from(readFileSync(nuevos[0], 'utf8').split('\r\n\r\n').slice(3).join('').split('--')[0].replace(/\s/g, ''), 'base64').toString('utf8')
  expect(cuerpo).toMatch(/recorrido\.mp4 \(4,2 MB\)/)
  await cel.screenshot({ path: path.join(evidence, 'enviar-fotos-listo-cel.png') })

  // Menu en celular
  await cel.goto(base + '/')
  await cel.getByRole('button', { name: 'Abrir menú' }).click()
  await cel.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Preguntas' }).click()
  await expect(cel).toHaveURL(base + '/preguntas')
  await cel.goto(base + '/')
  await cargarTodo(cel)
  await cel.screenshot({ path: path.join(evidence, 'inicio-cel.png'), fullPage: true })
  await cel.goto(base + '/cotizar')
  await cel.screenshot({ path: path.join(evidence, 'cotizar-cel.png'), fullPage: true })

  // Admin → Web: subir la foto de la tarjeta "Cotización automática"
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Web', exact: true }).click()
  await expect(page.getByTestId('fotos-web')).toContainText('la web muestra estas 6 de ejemplo')
  await page.getByRole('tab', { name: 'Cotizar · cotización automática' }).click()
  const png = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#DB992B'; x.fillRect(0, 0, 400, 300); return c.toDataURL('image/png').split(',')[1] })
  await page.getByTestId('subir-foto-web').setInputFiles({ name: 'nueva.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByTestId('foto-web')).toHaveCount(1)
  await page.screenshot({ path: path.join(evidence, 'admin-web.png') })
  await page.goto(base + '/cotizar')
  await expect(page.getByTestId('opcion-cotizar-auto').locator('img')).toHaveAttribute('src', /\/\.netlify\/functions\/foto\?id=/)
  await expect(page.getByTestId('opcion-cotizar-auto').locator('img')).toHaveJSProperty('naturalWidth', 400)

  // Las otras paginas siguen en su lugar
  await page.goto(base + '/visita')
  await expect(page.getByRole('heading', { name: 'Agenda tu visita' })).toBeVisible()
  await page.goto(base + '/cotiza')
  await expect(page.locator('.ctz')).toBeVisible()
  await page.goto(base + '/no-existe')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No encontramos esta página')

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, fotosGaleria: total }))
} finally { await browser.close() }
