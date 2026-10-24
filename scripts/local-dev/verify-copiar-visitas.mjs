// Prueba E2E de confirmar visitas: pedir confirmacion por WhatsApp, marcar "Confirmó" y copiar
// las confirmadas de un dia para quien hace las visitas. Contra el entorno local, con datos limpios.
//   node scripts/local-dev/verify-copiar-visitas.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo escribe en el backend local')
const evidence = path.resolve('docs/evidence/2026-10-16-copiar-visitas')
mkdirSync(evidence, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1300, height: 900 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  const page = await context.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message))
  // Windows devuelve el portapapeles con \r\n.
  const leerPortapapeles = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')

  // Dos visitas el mismo dia (la primera fecha con 2 rangos), agendadas como lo hace un cliente.
  const fn = ruta => base + '/.netlify/functions/' + ruta
  const rangosDe = async () => (await (await page.request.get(fn('visitas-rangos'))).json()).dias
  const dias = await rangosDe()
  const dia = dias.find(d => d.rangos.length >= 2)
  for (const [i, [nombre, apellido]] of [['Bruno', 'Tarde'], ['Ana', 'Temprano']].entries()) {
    const r = await page.request.post(fn('create_event'), { data: {
      nombre, apellido, email: `${nombre.toLowerCase()}@example.cl`, celular: '9 1234 567' + i,
      direccion: `Calle Prueba ${100 + i}, Ñuñoa`, fechaISO: dia.fecha, rango: dia.rangos[i === 0 ? 1 : 0].desde, note: i ? 'Tocar timbre' : '',
    } })
    expect((await r.json()).ok).toBe(true)
  }

  await page.goto(base + '/admin')
  await page.locator('input[type=password]').fill(process.env.LOCAL_ADMIN_PASSWORD || 'donmaxi-local-demo')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Visitas', exact: true }).click()

  const grupo = page.getByTestId('dia-visitas').filter({ hasText: 'Ana Temprano' })
  const copiar = grupo.getByRole('button', { name: /Copiar confirmadas/ })
  await expect(copiar).toHaveText('📋 Copiar confirmadas (0/2)')
  await expect(copiar).toBeDisabled()

  // Pedir confirmacion: link de WhatsApp al celular del cliente con el mensaje.
  const tarjeta = nombre => grupo.locator('div', { has: page.getByText(nombre, { exact: true }) }).filter({ has: page.getByRole('button', { name: /Confirmó|Deshacer/ }) }).last()
  await tarjeta('Ana Temprano').getByRole('button', { name: '📋 Copiar mensaje de confirmación' }).click()
  const href = await tarjeta('Ana Temprano').getByTestId('mensaje-copiado').inputValue()
  expect(href).toMatch(/^Hola Ana! 👋/)
  expect(href).toContain('1 hora de flexibilidad')
  expect(href).toContain('si no puedes, avísanos')

  // Marca que Ana confirmo: queda como Confirmada y entra a la lista del dia.
  await tarjeta('Ana Temprano').getByRole('button', { name: '✓ Confirmó' }).click()
  await expect(tarjeta('Ana Temprano')).toContainText('✓ El cliente confirmó')
  await expect(copiar).toHaveText('📋 Copiar confirmadas (1/2)')
  await copiar.click()
  await expect(grupo.getByRole('button', { name: '✓ Copiado' })).toBeVisible()
  const texto = await leerPortapapeles()
  console.log(texto)
  expect(texto).toMatch(/^📅 \*.+\* \(1 visita\)\n\n\*1\. \d\d:\d\d–\d\d:\d\d · Ana Temprano\*\n📍 Calle Prueba 101, Ñuñoa/)
  expect(texto).not.toContain('Bruno')

  // Con las dos confirmadas salen en orden de hora.
  await tarjeta('Bruno Tarde').getByRole('button', { name: '✓ Confirmó' }).click()
  await expect(copiar).toHaveText('📋 Copiar confirmadas (2/2)')
  await copiar.click()
  const texto2 = await leerPortapapeles()
  expect(texto2.indexOf('1. ')).toBeLessThan(texto2.indexOf('2. '))
  expect(texto2.indexOf('Ana Temprano')).toBeLessThan(texto2.indexOf('Bruno Tarde'))
  await page.screenshot({ path: path.join(evidence, '01-visitas.png') })

  // Sigue confirmada al recargar, y "Deshacer" la vuelve a agendada.
  await page.getByRole('button', { name: 'Actualizar' }).click()
  await expect(copiar).toHaveText('📋 Copiar confirmadas (2/2)')
  await tarjeta('Bruno Tarde').getByRole('button', { name: 'Deshacer' }).click()
  await expect(copiar).toHaveText('📋 Copiar confirmadas (1/2)')

  // Reagendar: ofrece los rangos con cupo de otro dia y mueve la visita a ese rango.
  await tarjeta('Bruno Tarde').getByRole('button', { name: '📅 Reagendar' }).click()
  const panel = page.getByTestId('reagendar-visita')
  const otroDia = dias.find(d => d.fecha !== dia.fecha)
  const r0 = otroDia.rangos[0]
  await panel.getByRole('button', { name: new RegExp(` ${Number(otroDia.fecha.slice(8))} `) }).first().click()
  await panel.getByRole('button', { name: `${r0.desde}–${r0.hasta}`, exact: true }).click()
  await panel.getByRole('button', { name: /^Mover al / }).click()
  await expect(panel).toContainText('✓ Reagendada para el')
  await panel.getByRole('button', { name: '📋 Copiar aviso para el cliente' }).click()
  const aviso = await panel.getByTestId('mensaje-copiado').inputValue()
  expect(aviso).toMatch(/^Hola Bruno! 👋 .*reagendada para el .* entre las /)
  expect(aviso).toContain(`entre las ${r0.desde} y las ${r0.hasta}`)
  await page.screenshot({ path: path.join(evidence, '02-reagendar.png') })
  await panel.getByRole('button', { name: 'Listo' }).click()
  const brunoGrupo = page.getByTestId('dia-visitas').filter({ hasText: 'Bruno Tarde' })
  await expect(brunoGrupo).not.toContainText('Ana Temprano')
  await expect(brunoGrupo.getByRole('button', { name: /Copiar confirmadas/ })).toHaveText('📋 Copiar confirmadas (0/1)')
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dm_admin_session')).token)
  const hoyVisitas = (await (await page.request.get(fn('get-visits'), { headers: { Authorization: 'Bearer ' + token } })).json()).visits
  const bruno = hoyVisitas.find(v => v.nombre === 'Bruno Tarde')
  expect(bruno.status).toBe('agendada')

  // Cancelar: sale de Agendadas, queda en Canceladas y su cupo vuelve a estar libre.
  const libresAntes = (await rangosDe()).find(d => d.fecha === dia.fecha).rangos.find(r => r.desde === dia.rangos[0].desde).libres
  page.once('dialog', d => d.accept())
  await tarjeta('Ana Temprano').getByRole('button', { name: '✕ Cancelar' }).click()
  await expect(page.getByText('Ana Temprano', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /^Canceladas\s*\d/ }).click()
  await expect(page.getByText('Ana Temprano', { exact: true })).toBeVisible()
  const libresDespues = (await rangosDe()).find(d => d.fecha === dia.fecha).rangos.find(r => r.desde === dia.rangos[0].desde).libres
  expect(libresDespues).toBe(libresAntes + 1)

  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true }))
} finally { await browser.close() }
