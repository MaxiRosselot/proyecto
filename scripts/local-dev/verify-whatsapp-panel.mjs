// Prueba E2E: WhatsApp dentro del panel. Con la extension (Edge, porque Chrome ya no carga
// extensiones por linea de comandos) WhatsApp Web se ve dentro, "Preguntar" deja el mensaje listo en
// la ventana sin abrir otra pestaña y el buscador encuentra al cliente. Sin la extension, salen las
// instrucciones. Contra el entorno local (start-native.mjs).   node scripts/local-dev/verify-whatsapp-panel.mjs
import { chromium, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const extension = resolve(dirname(fileURLToPath(import.meta.url)), '../../extension-whatsapp')
const perfil = mkdtempSync(join(tmpdir(), 'wa-panel-'))

async function entrar(page) {
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
}

const ctx = await chromium.launchPersistentContext(perfil, {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 900 },
  args: ['--headless=new', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
})
try {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await entrar(page)
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => (await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const nombre = 'Prueba Whatsapp ' + Date.now().toString(36)
  const q = await api('save-quote', { crear: true, nombre, telefono: '9 3333 4444', subtotal: 100000, iva: 19000, total: 119000, repisas: [{ largo: 1.2, prof: .45, alto: 2, niveles: 5, unidades: 1, valor: 100000 }], adicionales: {} })

  // Abrir WhatsApp: la ventana aparece a la derecha y WhatsApp Web carga dentro (pide el QR).
  await page.getByRole('button', { name: 'WhatsApp al lado' }).click()
  const ventana = page.getByTestId('ventana-whatsapp')
  await expect(ventana).toBeVisible()
  const marco = page.frameLocator('iframe[title="WhatsApp Web"]')
  await expect(marco.getByText(/Escanea|Scan|código QR|QR code/i).first()).toBeVisible({ timeout: 30000 })

  // "Preguntar" no abre otra pestaña: deja el mensaje listo (y copiado) en la ventana.
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizaciones', exact: true }).click()
  const paginas = ctx.pages().length
  await page.locator('#cot-' + q.cotNum).getByTestId('seguimiento-whatsapp').getByRole('button', { name: 'Preguntar' }).click()
  const listo = ventana.getByTestId('whatsapp-para-enviar')
  await expect(listo.getByText(nombre)).toBeVisible()
  await expect(listo.getByText('+56 9 3333 4444')).toBeVisible()
  await expect(listo.getByText('✓ Mensaje copiado')).toBeVisible()
  if (ctx.pages().length !== paginas) throw new Error('Preguntar abrió otra pestaña con la ventana abierta')
  const copiado = await page.evaluate(() => navigator.clipboard.readText())
  if (!copiado.includes('N° ' + q.cotNum)) throw new Error('No quedó copiado el mensaje: ' + copiado)

  // Buscar al cliente y copiar su numero.
  await ventana.getByLabel('Buscar cliente').fill(nombre.split(' ').at(-1))
  const resultado = ventana.getByTestId('whatsapp-resultados')
  await expect(resultado.getByText(nombre)).toBeVisible()
  await resultado.getByRole('button', { name: 'Copiar número' }).click()
  if (await page.evaluate(() => navigator.clipboard.readText()) !== '+56 9 3333 4444') throw new Error('No copió el número')
  await page.screenshot({ path: process.env.SHOT || 'whatsapp-panel.png' })

  // Cotizador: recien generada, "PDF a su WhatsApp" deja el PDF en su chat (WhatsApp con sesion simulada
  // dentro del marco) y "Mensaje para agendar" abre su chat con el mensaje escrito. Nada se envia.
  const cola = String(Date.now() % 10000).padStart(4, '0')
  await page.getByRole('navigation').getByRole('button', { name: 'Cotizar', exact: true }).click()
  await page.getByRole('button', { name: 'Reiniciar' }).click()
  await page.getByRole('button', { name: 'Ingreso manual' }).click()
  await page.getByPlaceholder('Nombre completo').fill('Cotizador Chat ' + cola)
  await page.getByPlaceholder('+56 9 XXXX XXXX').fill('9 6666 ' + cola)
  await page.getByRole('button', { name: /Generar Cotizacion PDF/ }).click()
  await expect(page.getByText(/Cotización N° \d+ guardada/)).toBeVisible({ timeout: 120000 })
  const fr = page.frames().find(x => x.parentFrame() === page.mainFrame() && x.url().includes('web.whatsapp.com'))
  await fr.evaluate(() => {
    document.querySelector('#side') || document.body.append(Object.assign(document.createElement('div'), { id: 'side' }))
    window.__pegado = null
    document.addEventListener('click', e => {
      const a = e.target.closest?.('a[href^="https://wa.me/"]')
      if (!a) return
      e.preventDefault()
      window.__links = [...(window.__links || []), a.href]
      document.querySelector('#main')?.remove()
      const main = Object.assign(document.createElement('div'), { id: 'main' })
      main.style.cssText = 'position:fixed;top:0;left:0;width:300px;height:300px;z-index:99999;background:white'
      main.innerHTML = '<footer><div contenteditable="true"></div></footer>'
      main.addEventListener('paste', ev => {
        window.__pegado = { nombre: ev.clipboardData.files[0].name, chat: a.href }
        main.querySelector('footer').style.display = 'none'
        const vista = Object.assign(document.createElement('div'), { contentEditable: 'true', id: 'vista' })
        document.body.append(vista)
      })
      document.body.append(main)
    }, true)
  })
  await page.getByTestId('pdf-al-chat').click()
  await expect(page.getByTestId('estado-pdf-al-chat')).toContainText('PDF en su chat', { timeout: 30000 })
  const pegado = await fr.evaluate(() => window.__pegado)
  if (!pegado?.chat.endsWith('/5696666' + cola) || !pegado.nombre.startsWith('Cotizacion Cotizador Chat')) throw new Error('PDF mal dejado: ' + JSON.stringify(pegado))
  await page.getByTestId('mensaje-al-chat').click()
  await expect(page.getByTestId('estado-pdf-al-chat')).toContainText('Mensaje escrito en su chat')
  await expect.poll(() => fr.evaluate(() => decodeURIComponent(window.__links.at(-1)))).toContain('https://wa.me/5696666' + cola + '?text=')
  if (!(await fr.evaluate(() => decodeURIComponent(window.__links.at(-1)))).includes('Te adjunto la cotización')) throw new Error('El chat no se abrió con el mensaje')
  if (!(await page.evaluate(() => navigator.clipboard.readText())).includes('Te adjunto la cotización')) throw new Error('El mensaje no quedó copiado')
  const cotChat = Number((await page.getByText(/Cotización N° \d+ guardada/).textContent()).match(/N° (\d+)/)[1])
  await api('delete-quote', { cotNum: cotChat })

  // Sin celular (p. ej. desde una visita que no lo tiene) los botones igual salen, con un campo para
  // escribirlo que parte con el número del chat abierto en WhatsApp.
  await page.getByRole('button', { name: 'Reiniciar' }).click()
  await page.getByRole('button', { name: 'Ingreso manual' }).click()
  await page.getByPlaceholder('Nombre completo').fill('Sin Celular ' + cola)
  await page.getByRole('button', { name: /Generar Cotizacion PDF/ }).click()
  await expect(page.getByText(/Cotización N° \d+ guardada/)).toBeVisible({ timeout: 120000 })
  const celular = page.getByLabel('Celular para WhatsApp')
  await expect(page.getByTestId('pdf-al-chat')).toBeVisible()
  await celular.fill('')
  await page.getByTestId('mensaje-al-chat').click()
  await expect(page.getByTestId('estado-pdf-al-chat')).toContainText('Escribe el celular')
  await celular.fill('9 5555 ' + cola)
  await page.getByTestId('mensaje-al-chat').click()
  await expect.poll(() => fr.evaluate(() => decodeURIComponent(window.__links.at(-1)))).toContain('https://wa.me/5695555' + cola + '?text=')
  await api('delete-quote', { cotNum: Number((await page.getByText(/Cotización N° \d+ guardada/).textContent()).match(/N° (\d+)/)[1]) })

  // Instalaciones: en la ficha de una venta instalada y sin pagar, "En su chat" junto al cobro y a la
  // reseña deja el mensaje escrito en su chat. La ficha queda a la izquierda de WhatsApp, sin taparlo.
  await api('planilla', { accion: 'actualizar', cotNum: q.cotNum, cambios: { fecha: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' }), inicio: '10:00', fin: '12:00' } })
  await api('planilla', { accion: 'actualizar', cotNum: q.cotNum, cambios: { instalada: true } })
  await page.getByRole('navigation').getByRole('button', { name: 'Instalaciones', exact: true }).click()
  await page.getByRole('button', { name: /^Todas/ }).click()
  await page.getByRole('button', { name: nombre, exact: true }).first().click()
  const ficha = page.getByRole('dialog', { name: nombre })
  const acciones = ficha.getByTestId('acciones-venta')
  await expect(acciones.getByText('⭐ Copiar pedido de reseña')).toBeVisible()
  const [cajaFicha, cajaVentana] = [await ficha.boundingBox(), await ventana.boundingBox()]
  if (cajaFicha.x + cajaFicha.width > cajaVentana.x + 1) throw new Error('La ficha tapa la ventana de WhatsApp')
  const ultimoLink = () => fr.evaluate(() => decodeURIComponent(window.__links.at(-1)))
  await acciones.getByTestId('en-su-chat').first().click()
  await expect(acciones.getByText('✓ En su chat: da Enter')).toBeVisible()
  await expect.poll(ultimoLink).toContain('https://wa.me/56933334444?text=')
  if (!(await ultimoLink()).includes('Total a pagar')) throw new Error('El cobro no quedó en su chat: ' + await ultimoLink())
  await acciones.getByTestId('en-su-chat').nth(1).click()
  await expect.poll(ultimoLink).toContain('reseña en Google')
  await ficha.getByRole('button', { name: 'Cerrar' }).click()

  // Cerrar: el panel vuelve a todo el ancho y queda el boton para abrirla otra vez.
  await ventana.getByRole('button', { name: 'Cerrar WhatsApp' }).click()
  await expect(ventana).toBeHidden()
  await expect(page.getByRole('button', { name: 'WhatsApp al lado' })).toBeVisible()
  await api('delete-quote', { cotNum: q.cotNum })
  if (errors.length) throw new Error(errors.join('\n'))
} finally { await ctx.close(); rmSync(perfil, { recursive: true, force: true }) }

// Sin la extension: instrucciones para instalarla, sin iframe.
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await entrar(page)
  await page.getByRole('button', { name: 'WhatsApp al lado' }).click()
  await expect(page.getByTestId('whatsapp-sin-extension')).toBeVisible()
  await expect(page.locator('iframe[title="WhatsApp Web"]')).toHaveCount(0)
  const zip = await page.request.get(base + '/whatsapp-en-el-panel.zip')
  if (!zip.ok() || (await zip.body()).length < 1000) throw new Error('No se puede descargar la extensión')
} finally { await browser.close() }
console.log('OK whatsapp en el panel')
