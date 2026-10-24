import test from 'node:test'
import assert from 'node:assert/strict'
import { COMUNAS, comunaDe, zonaDe } from './zonas.mjs'

test('la zona sale de la comuna o de la direccion escrita a mano', () => {
  assert.equal(zonaDe('Ñuñoa'), 'oriente')
  assert.equal(zonaDe('Av. Grecia 1500, depto 302, nunoa'), 'oriente')
  assert.equal(zonaDe('Pasaje Los Aromos 355, Puente Alto'), 'suroriente')
  assert.equal(zonaDe('Camino El Alba 9021, Las Condes, Santiago'), 'oriente') // "Las Condes" gana
  assert.equal(zonaDe('Calle Falsa 123, San José de Maipo'), 'suroriente')
  assert.equal(zonaDe('Valparaíso'), null)
  assert.equal(comunaDe('los militares 5400, las condes'), 'Las Condes')
  assert.ok(COMUNAS.includes('Lo Barnechea') && COMUNAS.length > 50)
})
