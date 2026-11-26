import test from 'node:test'
import assert from 'node:assert/strict'
import { accionDeTecla, siguiente } from './atajosWhatsapp.js'

const t = (key, code = '', extra = {}) => ({ key, code, ...extra })

test('atajos whatsapp: teclas sin escribir', () => {
  assert.deepEqual(accionDeTecla(t('ArrowDown')), { tipo: 'mover', paso: 1 })
  assert.deepEqual(accionDeTecla(t('k')), { tipo: 'mover', paso: -1 })
  assert.deepEqual(accionDeTecla(t('ArrowRight')), { tipo: 'filtro', paso: 1 })
  assert.deepEqual(accionDeTecla(t('1', 'Digit1')), { tipo: 'mensaje', n: 1, copiar: false })
  assert.deepEqual(accionDeTecla(t('!', 'Digit1', { shiftKey: true })), { tipo: 'mensaje', n: 1, copiar: true })
  assert.deepEqual(accionDeTecla(t('3', 'Numpad3')), { tipo: 'mensaje', n: 3, copiar: false })
  assert.deepEqual(accionDeTecla(t('P', 'KeyP')), { tipo: 'clic', atajo: 'pregunte' })
  assert.deepEqual(accionDeTecla(t('/')), { tipo: 'buscar' })
  assert.deepEqual(accionDeTecla(t('a', 'KeyA')), { tipo: 'clic', atajo: 'copiar-agenda' })
  assert.equal(accionDeTecla(t('0', 'Digit0')), null)
  assert.equal(accionDeTecla(t('c', 'KeyC', { ctrlKey: true })), null) // Ctrl+C es copiar
})

test('atajos whatsapp: escribiendo solo valen Esc, ↓ en el buscador y los de Alt', () => {
  assert.equal(accionDeTecla(t('p', 'KeyP'), 'otro'), null)
  assert.equal(accionDeTecla(t('1', 'Digit1'), 'buscar'), null)
  assert.equal(accionDeTecla(t('ArrowDown'), 'otro'), null)
  assert.deepEqual(accionDeTecla(t('ArrowDown'), 'buscar'), { tipo: 'mover', paso: 1 })
  assert.deepEqual(accionDeTecla(t('Escape'), 'otro'), { tipo: 'salir' })
  assert.deepEqual(accionDeTecla(t('ArrowUp', '', { altKey: true }), 'otro'), { tipo: 'mover', paso: -1 })
  assert.deepEqual(accionDeTecla(t('¡', 'Digit2', { altKey: true }), 'otro'), { tipo: 'mensaje', n: 2, copiar: false })
  assert.equal(accionDeTecla(t('ArrowLeft', '', { altKey: true })), null) // Alt+← es "atrás" del navegador
})

test('atajos whatsapp: moverse por la lista', () => {
  assert.equal(siguiente(-1, 1, 5), 0)
  assert.equal(siguiente(-1, -1, 5), 4)
  assert.equal(siguiente(2, 1, 5), 3)
  assert.equal(siguiente(4, 1, 5), 4)
  assert.equal(siguiente(0, -1, 5), 0)
  assert.equal(siguiente(0, 1, 0), -1)
})
