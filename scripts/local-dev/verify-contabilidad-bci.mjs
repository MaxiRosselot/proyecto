// Prueba E2E: extensión "Don Maxi: BCI al panel". Una página falsa en bel.bci.cl (Playwright la
// sirve, no se toca el banco) con la tabla de Mis Movimientos; la extensión la lee, y al abrir
// Contabilidad en el panel local los movimientos entran solos con su nombre completo.
// Contra el entorno local (start-native.mjs).   node scripts/local-dev/verify-contabilidad-bci.mjs
// Datos inventados: el repo es público.
import { chromium, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const extension = resolve(dirname(fileURLToPath(import.meta.url)), '../../extension-bci')
const perfil = mkdtempSync(join(tmpdir(), 'bci-panel-'))

// Como se ve en BCI: fecha, fecha contable, descripción, abono, cargo, saldo. Lo más nuevo arriba.
const fila = (f, fc, d, abono, cargo, saldo) => `<tr><td>${f}</td><td>${fc}</td><td>${d}</td><td>${abono ? '+ $ ' + abono : ''}</td><td>${cargo ? '- $ ' + cargo : ''}</td><td>$ ${saldo}</td><td>- -</td></tr>`
const BCI = `<!doctype html><html><body><h1>Mis Movimientos</h1><table>
<tr><th>Fecha</th><th>Fecha contable</th><th>Descripción</th><th>Abonos</th><th>Cargos</th><th>Saldo</th></tr>
${fila('26/11/26', '27/11/26', 'Transferencia recibida de Paula Andrea Ríos Vega', '50.000', '', '1.150.000')}
${fila('26/11/26', '26/11/26', 'Compra con tarjeta de débito en imperial', '', '30.000', '1.100.000')}
${fila('24/11/26', '25/11/26', 'Transferencia enviada a Juan Pérez Dueño', '', '20.000', '1.130.000')}
${fila('24/11/26', '25/11/26', 'Transferencia recibida de Carlos Ignacio Mena Soto', '150.000', '', '1.150.000')}
</table></body></html>`

const ctx = await chromium.launchPersistentContext(perfil, {
  channel: 'msedge', headless: false, viewport: { width: 1400, height: 900 },
  args: ['--headless=new', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
})
try {
  await ctx.route('https://bel.bci.cl/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: BCI }))
  const banco = await ctx.newPage()
  await banco.goto('https://bel.bci.cl/cl/bci/aplicaciones/movimientos-prueba')
  await expect(banco.getByText(/4 movimientos leídos/)).toBeVisible({ timeout: 10000 })
  await expect(banco.getByText(/saldos encadenan ✓/)).toBeVisible()

  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('button', { name: 'Contabilidad' }).first().click()
  await expect(page.getByText(/BCI en línea: 4 movimientos/)).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('👤 De Paula Andrea Ríos Vega')).toBeVisible()
  await expect(page.getByText('👤 A Juan Pérez Dueño')).toBeVisible()

  // Volver a abrir no repite: la extensión ya los entregó.
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const datos = await (await page.request.fetch(base + '/.netlify/functions/contabilidad?mes=2026-11', { headers: { Authorization: 'Bearer ' + token } })).json()
  const deBci = datos.movimientos.filter(m => m.origen === 'web')
  if (deBci.length !== 4) throw new Error(`Se esperaban 4 movimientos de BCI y hay ${deBci.length}`)
  if (deBci.find(m => m.monto === -30000)?.categoriaFinal !== 'materiales') throw new Error('La compra en Imperial debía sugerirse como materiales')
  if (errors.length) throw new Error(errors.join('\n'))
  await page.screenshot({ path: join(tmpdir(), 'contabilidad-bci.png') })
  console.log('OK: la extensión leyó BCI y el panel los trajo solos.', join(tmpdir(), 'contabilidad-bci.png'))
} finally {
  await ctx.close()
  rmSync(perfil, { recursive: true, force: true })
}
