// Prueba E2E: la seccion WhatsApp. Clientes a la izquierda, WhatsApp Web al centro (con la extension,
// en Edge) y la ficha a la derecha: esperar hasta una fecha, bitacora, mensaje "en su chat" que anota
// la pregunta, mis mensajes con {nombre}, y el mismo WhatsApp (sin recargar) al ir a otra seccion y
// volver. Contra el entorno local (start-native.mjs).   node scripts/local-dev/verify-modulo-whatsapp.mjs
import { chromium, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ahoraEnZona, sumarDias } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const extension = resolve(dirname(fileURLToPath(import.meta.url)), '../../extension-whatsapp')
const perfil = mkdtempSync(join(tmpdir(), 'wa-modulo-'))
const ctx = await chromium.launchPersistentContext(perfil, {
  channel: 'msedge', headless: false, viewport: { width: 1600, height: 950 },
  args: ['--headless=new', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
})
let api, cotNum
try {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  api = async (ruta, data) => (await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const nombre = 'Modulo Whatsapp ' + Date.now().toString(36)
  const cola = String(Date.now() % 10000).padStart(4, '0') // celular distinto en cada corrida
  cotNum = (await api('save-quote', { crear: true, nombre, telefono: '9 5555 ' + cola, subtotal: 100000, iva: 19000, total: 119000, repisas: [{ largo: 1.2, prof: .45, alto: 2, niveles: 5, unidades: 1, valor: 100000 }], adicionales: {} })).cotNum
  const hoy = ahoraEnZona().fecha

  // Abrir la seccion: WhatsApp al centro, cargado dentro (pide el QR), sobre su hueco.
  await page.getByRole('navigation').getByRole('button', { name: 'WhatsApp', exact: true }).click()
  const modulo = page.getByTestId('modulo-whatsapp')
  await expect(modulo).toBeVisible()
  const marco = page.frameLocator('iframe[title="WhatsApp Web"]')
  await expect(marco.getByText(/Escanea|Scan|código QR|QR code/i).first()).toBeVisible({ timeout: 30000 })
  const [hueco, iframe] = await Promise.all([modulo.getByTestId('lugar-whatsapp').boundingBox(), page.getByTestId('marco-whatsapp').boundingBox()])
  if (Math.abs(hueco.x - iframe.x) > 2 || Math.abs(hueco.width - iframe.width) > 2) throw new Error(`WhatsApp no quedó en su lugar: ${JSON.stringify({ hueco, iframe })}`)
  await page.evaluate(() => { window.__marco = document.querySelector('[data-testid=marco-whatsapp]') })

  // Buscar al cliente y elegirlo: su ficha a la derecha.
  await modulo.getByLabel('Buscar cliente').fill(nombre)
  await page.getByTestId('cliente-' + cotNum).click()
  const ficha = page.getByTestId('ficha-cliente')
  await expect(ficha.getByText(nombre)).toBeVisible()
  await expect(ficha.getByText('+56 9 5555 ' + cola)).toBeVisible()

  // "En su chat" con el mensaje de seguimiento: lo deja escrito en su chat y anota la pregunta.
  await page.getByTestId('mensaje-sin-respuesta').getByRole('button', { name: 'En su chat' }).click()
  await expect(page.getByTestId('ficha-seguimiento').getByText(/Preguntado 1 vez/)).toBeVisible()
  await expect.poll(() => page.getByTestId('marco-whatsapp').getAttribute('src'), { timeout: 8000 }).toContain('web.whatsapp.com/send?phone=5695555' + cola + '&text=Hola+Modulo')

  // Pospuso: esperar 2 semanas. Sale del "toca preguntar" y aparece en Esperando.
  await page.getByTestId('ficha-seguimiento').getByRole('button', { name: '2 semanas' }).click()
  await expect(page.getByTestId('ficha-seguimiento').getByText(/Esperando hasta el/)).toBeVisible()
  await page.getByTestId('ficha-bitacora').getByLabel('Nota para la bitácora').fill('Lo ve con su señora en diciembre')
  await page.getByTestId('ficha-bitacora').getByRole('button', { name: 'Anotar' }).click()
  await expect(page.getByTestId('ficha-bitacora').getByText('Lo ve con su señora en diciembre')).toBeVisible()
  const guardada = (await api('get-quotes')).quotes.find(x => x.cotNum === cotNum)
  const esperado = { preguntas: [hoy], esperarHasta: sumarDias(hoy, 14), bitacora: [{ fecha: hoy, texto: 'Lo ve con su señora en diciembre' }] }
  if (JSON.stringify(guardada.seguimiento) !== JSON.stringify(esperado)) throw new Error('Quedó guardado ' + JSON.stringify(guardada.seguimiento))
  await modulo.getByLabel('Buscar cliente').fill('')
  await modulo.getByRole('button', { name: /^Esperando · / }).click()
  await expect(page.getByTestId('lista-clientes').getByTestId('cliente-' + cotNum)).toBeVisible()

  // Mis mensajes: con el nombre del cliente.
  await expect(page.getByTestId('mensaje-propio-saludo').getByText('Hola Modulo 👋 Te escribo de Repisas Don Maxi.')).toBeVisible()
  await page.screenshot({ path: process.env.SHOT || 'modulo-whatsapp.png' })

  // Ir a Cotizaciones y volver: el mismo WhatsApp, sin recargar, y en Cotizaciones se ve la espera.
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  await expect(page.getByTestId('marco-whatsapp')).toBeHidden()
  await expect(page.locator('#cot-' + cotNum).getByText(/Esperando hasta el/)).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: 'WhatsApp', exact: true }).click()
  await expect(page.getByTestId('marco-whatsapp')).toBeVisible()
  if (!await page.evaluate(() => window.__marco === document.querySelector('[data-testid=marco-whatsapp]'))) throw new Error('WhatsApp se volvió a cargar')

  // Un boton de WhatsApp de otra parte (aqui, el evento que mandan) elige al cliente y deja el mensaje.
  await page.evaluate(tel => window.dispatchEvent(new CustomEvent('dm:whatsapp-para-enviar', { detail: { telefono: tel, texto: 'Mensaje de prueba', cliente: 'X' } })), '+5695555' + cola)
  await expect(modulo.getByTestId('whatsapp-para-enviar').getByText('Mensaje de prueba')).toBeVisible()
  await expect(page.getByTestId('whatsapp-para-enviar')).toHaveCount(1)
  await expect(page.getByTestId('ficha-cliente').getByText(nombre)).toBeVisible()

  // Atajos de teclado: / busca, ↓ elige el primero, ? muestra la ayuda, Shift+1 copia el mensaje 1,
  // R anota que respondió, → cambia de filtro, y desde dentro de WhatsApp Alt+2 deja el mensaje 2 en su chat.
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('/')
  await page.keyboard.type(nombre)
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('ficha-cliente').getByText(nombre)).toBeVisible()
  if (await page.evaluate(() => document.activeElement?.type === 'search')) throw new Error('↓ no salió del buscador')
  await page.keyboard.press('?')
  await expect(page.getByTestId('ayuda-atajos')).toBeVisible()
  await page.keyboard.press('?')
  await expect(page.getByTestId('ayuda-atajos')).toBeHidden()
  await page.keyboard.press('Shift+Digit1')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('N° ' + cotNum)
  await page.keyboard.press('r')
  await expect(page.getByTestId('ficha-seguimiento').getByText(/Respondió el/)).toBeVisible()
  await modulo.getByLabel('Buscar cliente').fill('')
  await page.evaluate(() => document.activeElement?.blur())
  const filtroAntes = await modulo.locator('button[aria-pressed=true]').first().textContent()
  await page.keyboard.press('ArrowRight')
  await expect(modulo.locator('button[aria-pressed=true]').first()).not.toHaveText(filtroAntes)
  await modulo.getByLabel('Buscar cliente').fill(nombre)
  await page.getByTestId('cliente-' + cotNum).click()
  await marco.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Alt+Digit2')
  await expect.poll(() => page.getByTestId('marco-whatsapp').getAttribute('src')).toContain('sigue+disponible')

  // Si WhatsApp se queda con el teclado al abrir un chat, vuelve al panel (para seguir con las flechas).
  await modulo.getByLabel('Buscar cliente').fill(nombre)
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('ArrowDown')
  await page.evaluate(() => document.querySelector('[data-testid=marco-whatsapp]').focus())
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName), { timeout: 4000 }).not.toBe('IFRAME')

  // WhatsApp dice que el numero no existe (la extension avisa): queda en "Sin WhatsApp".
  await expect(page.getByTestId('ficha-cliente').getByText(nombre)).toBeVisible()
  await expect(async () => {
    const frame = page.frames().find(f => f.parentFrame() === page.mainFrame() && f.url().includes('web.whatsapp.com'))
    await frame.evaluate(tel => window.parent.postMessage({ dm: 'sin-whatsapp', telefono: tel }, '*'), '5695555' + cola)
    await expect(page.getByTestId('ficha-sin-whatsapp')).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20000 })
  await expect(page.getByTestId('ficha-sin-whatsapp')).toBeVisible()
  await modulo.getByLabel('Buscar cliente').fill('')
  await expect(modulo.getByRole('button', { name: /^Sin WhatsApp · 1$/ })).toBeVisible()
  await expect.poll(async () => (await api('get-quotes')).quotes.find(x => x.cotNum === cotNum).seguimiento.sinWhatsapp?.tel).toBe('5555' + cola)
  await page.getByTestId('ficha-sin-whatsapp').getByRole('button', { name: 'Sí tiene' }).click()
  await expect(page.getByTestId('ficha-sin-whatsapp')).toBeHidden()

  // PDF en su chat (tecla D). WhatsApp sin sesion: lo descarga y copia el mensaje.
  const pdf = Buffer.from(['%PDF-1.4', '1 0 obj<<>>endobj', 'trailer<<>>', '%%EOF', ''].join(String.fromCharCode(10)))
  const { viewUrl } = await api('upload-pdf', { pdfBase64: pdf.toString('base64'), fileName: 'x.pdf', cotNum })
  await api('save-quote', { cotNum, pdfUrl: viewUrl })
  await modulo.getByRole('button', { name: '↻ Actualizar' }).click()
  await modulo.getByLabel('Buscar cliente').fill(nombre)
  await page.getByTestId('cliente-' + cotNum).click()
  await page.evaluate(() => document.activeElement?.blur())
  const [descarga] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.keyboard.press('d')])
  if (!descarga.suggestedFilename().startsWith('Cotizacion Modulo')) throw new Error('Descargó ' + descarga.suggestedFilename())
  await expect(page.getByTestId('estado-pdf')).toContainText('Lo descargué')

  // Con sesion (simulada dentro del marco: un chat que recibe lo que se suelta): queda el PDF con su mensaje.
  await expect(async () => {
    const f = page.frames().find(x => x.parentFrame() === page.mainFrame() && x.url().includes('web.whatsapp.com'))
    await f.evaluate(() => {
      if (!document.querySelector('#app')) throw new Error('cargando')
      document.querySelector('#side') || document.body.append(Object.assign(document.createElement('div'), { id: 'side' }))
      window.__soltado = null
      document.addEventListener('click', e => {
        const a = e.target.closest?.('a[href^="https://wa.me/"]')
        if (!a) return
        e.preventDefault()
        document.querySelector('#main')?.remove()
        const main = Object.assign(document.createElement('div'), { id: 'main' })
        main.style.cssText = 'position:fixed;top:0;left:0;width:300px;height:300px;z-index:99999;background:white'
        main.innerHTML = '<footer><div contenteditable="true"></div></footer>'
        main.addEventListener('drop', ev => {
          const archivo = ev.dataTransfer.files[0]
          window.__soltado = { nombre: archivo.name, tipo: archivo.type, tam: archivo.size, chat: a.href }
          const comentario = Object.assign(document.createElement('div'), { contentEditable: 'true', id: 'comentario' })
          document.body.append(comentario); comentario.focus()
        })
        document.body.append(main)
      }, true)
    })
  }).toPass({ timeout: 20000 })
  await page.keyboard.press('d')
  await expect(page.getByTestId('estado-pdf')).toContainText('Quedó en su chat')
  const f = page.frames().find(x => x.parentFrame() === page.mainFrame() && x.url().includes('web.whatsapp.com'))
  const soltado = await f.evaluate(() => ({ ...window.__soltado, comentario: document.querySelector('#comentario')?.textContent }))
  if (soltado.tipo !== 'application/pdf' || soltado.tam !== pdf.length || !soltado.chat.endsWith('/5695555' + cola) || !soltado.comentario.includes('Te adjunto la cotización'))
    throw new Error('No quedó bien el PDF en el chat: ' + JSON.stringify(soltado))
  if (errors.length) throw new Error(errors.join('\n'))
} finally {
  if (api && cotNum) await api('delete-quote', { cotNum }).catch(() => {})
  await ctx.close(); rmSync(perfil, { recursive: true, force: true })
}
console.log('OK seccion WhatsApp')
