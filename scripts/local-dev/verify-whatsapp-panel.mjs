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

  // Cotizador: recien generada, "PDF + mensaje a su WhatsApp" deja el PDF en su chat (WhatsApp con sesion
  // simulada dentro del marco) y, al enviarlo, el mensaje para agendar queda escrito. Nada se envia.
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
  if (!(await page.evaluate(() => navigator.clipboard.readText())).includes('Te adjunto la cotización')) throw new Error('El mensaje no quedó copiado')
  await page.waitForTimeout(800)
  if (await fr.evaluate(() => document.querySelector('#main footer [contenteditable]').textContent)) throw new Error('El mensaje se escribió antes de enviar el PDF')
  await fr.evaluate(() => { document.querySelector('#vista').remove(); document.querySelector('#main footer').style.display = '' })
  await expect.poll(() => fr.evaluate(() => document.querySelector('#main footer [contenteditable]').textContent), { timeout: 5000 }).toContain('Te adjunto la cotización')
  const cotChat = Number((await page.getByText(/Cotización N° \d+ guardada/).textContent()).match(/N° (\d+)/)[1])
  await api('delete-quote', { cotNum: cotChat })

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
