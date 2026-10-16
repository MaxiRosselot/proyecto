// Prueba E2E de "Pasar al calendario": las instalaciones del mes quedan con su evento, enlazando las
// que ya tienen uno con su nombre (como los del script del Excel) y sin duplicar.
// Contra el entorno local (start-native.mjs), con datos limpios.
//   node scripts/local-dev/verify-pasar-calendario.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ahoraEnZona } from '../../netlify/functions/lib/horarios.mjs'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-16-planilla')
mkdirSync(evidence, { recursive: true })
const dia = ahoraEnZona().fecha.slice(0, 8) + '20'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const api = async (ruta, data) => (await page.request.fetch(base + '/.netlify/functions/' + ruta, { method: data ? 'POST' : 'GET', data, headers: { Authorization: 'Bearer ' + token } })).json()
  const venta = nombre => ({ crear: true, nombre, status: 'confirmada', subtotal: 100000, iva: 19000, total: 119000, repisas: [{ unidades: 1, valor: 100000 }], adicionales: {} })

  // Ana ya tiene su evento; Bruno tiene uno del script con otro titulo; Carla no tiene; Diego no tiene horas.
  await api('planilla', { accion: 'crear', nombre: 'Ana Enlazada', fecha: dia, inicio: '09:00', fin: '10:00' })
  await api('save-quote', { ...venta('Bruno Script'), instalacion: { fecha: dia, inicio: '10:00', fin: '12:00', origen: 'excel' } })
  const suelto = await api('evento-local-suelto', { summary: 'BRUNO SCRIPT bodega Ñuñoa', inicio: `${dia}T10:00:00`, fin: `${dia}T12:00:00` })
  await api('save-quote', { ...venta('Carla Nueva'), instalacion: { fecha: dia, inicio: '13:00', fin: '16:00', origen: 'excel' } })
  await api('save-quote', { ...venta('Diego Sin Hora'), instalacion: { fecha: dia, inicio: '', fin: '', origen: 'excel' } })

  await page.getByRole('navigation').getByRole('button', { name: 'Instalaciones', exact: true }).click()
  await page.getByRole('tab', { name: 'Mes' }).click()
  await page.getByRole('button', { name: 'Pasar al calendario' }).click()
  const dialogo = page.getByTestId('pasar-calendario')
  await expect(dialogo).toContainText('Se enlazan con el evento que ya tienen · 1')
  await expect(dialogo).toContainText('Bruno Script → “BRUNO SCRIPT bodega Ñuñoa”')
  await expect(dialogo).toContainText('Se crea su evento · 1')
  await expect(dialogo).toContainText('Sin horas: no se pueden agendar · 1')
  await expect(dialogo).toContainText('Ya están en el calendario')
  await page.screenshot({ path: path.join(evidence, '05-pasar-al-calendario.png') })
  await dialogo.getByRole('button', { name: 'Hacer 2 cambios' }).click()
  await expect(page.getByTestId('pasar-calendario')).toHaveCount(0) // se cierra solo si todo salio bien

  // Bruno quedo enlazado a su evento del script (marcado como instalacion), Carla con uno nuevo.
  const { quotes } = await api('get-quotes')
  const de = n => quotes.find(q => q.nombre === n).instalacion
  expect(de('Bruno Script').eventId).toBe(suelto.id)
  expect(de('Carla Nueva').eventId).toBeTruthy()
  expect(de('Diego Sin Hora').eventId || '').toBe('')
  const eventos = (await api('eventos-local')).eventos
  expect(eventos[suelto.id].extendedProperties.shared.cot_num).toBe(quotes.find(q => q.nombre === 'Bruno Script').cotNum)
  const delDia = Object.values(eventos).filter(e => String(e.start?.dateTime || '').startsWith(dia))
  expect(delDia.length).toBe(3) // Ana, Bruno (el del script) y Carla: sin duplicados

  // Una segunda pasada: todo al dia.
  await page.getByRole('button', { name: 'Pasar al calendario' }).click()
  await expect(dialogo.getByRole('button', { name: 'Todo está al día' })).toBeDisabled()
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, dia }))
} finally { await browser.close() }
