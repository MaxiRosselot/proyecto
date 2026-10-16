import test from 'node:test'
import assert from 'node:assert/strict'
import { textoVisitas } from './listaVisitas.js'

test('la lista de visitas va por dia, en orden de hora y con todos los datos', () => {
  const texto = textoVisitas([
    { nombre: 'Bruno', start: '2026-10-18T15:00:00-03:00', direccion: 'Av. Siempre Viva 742, Ñuñoa', celular: '+56911111111' },
    { nombre: 'Ana', start: '2026-10-18T10:30:00-03:00', email: 'ana@ejemplo.cl', notas: 'Tocar timbre 2' },
    { nombre: 'Carla', start: '2026-10-25T11:00:00-03:00' },
  ])
  assert.ok(texto.startsWith('📅 *Domingo, 18 de octubre* (2 visitas)') || texto.startsWith('📅 *Domingo 18 de octubre* (2 visitas)'), texto.split('\n')[0])
  assert.ok(texto.indexOf('*1. 10:30 · Ana*') < texto.indexOf('*2. 15:00 · Bruno*'))
  assert.match(texto, /📍 Av\. Siempre Viva 742, Ñuñoa\n🗺️ https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Av\.%20Siempre/)
  assert.match(texto, /📞 \+56911111111/)
  assert.match(texto, /✉️ ana@ejemplo\.cl\n📝 Tocar timbre 2/)
  assert.match(texto, /———\n\n📅 \*Domingo,? 25 de octubre\* \(1 visita\)\n\n\*1\. 11:00 · Carla\*$/)
})
