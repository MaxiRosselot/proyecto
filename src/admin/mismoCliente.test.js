import test from 'node:test'
import assert from 'node:assert/strict'
import { mismoCliente } from './mismoCliente.js'

test('otro cliente no es el mismo: generar crea una nueva', () => {
  assert.equal(mismoCliente({ nombre: 'Valeria Prueba', telefono: '+56900001111' }, { nombre: 'Marcelo Ejemplo', telefono: '+56911112222' }), false)
  assert.equal(mismoCliente({ nombre: 'Josefa Uno' }, { nombre: 'Julia Dos' }), false)
  assert.equal(mismoCliente({ nombre: 'Ana Tres Demo' }, { nombre: '' }), false)
})

test('completar o corregir el nombre sigue siendo el mismo cliente', () => {
  assert.equal(mismoCliente({ nombre: 'Francisco' }, { nombre: 'Francisco Demo' }), true)
  assert.equal(mismoCliente({ nombre: 'Francisco Demo' }, { nombre: 'francisco' }), true)
  assert.equal(mismoCliente({ nombre: 'Valéria Prueba' }, { nombre: 'Valeria Pruba' }), true)
  assert.equal(mismoCliente({ nombre: 'Carmen  Muñoz' }, { nombre: 'Carmen Muñoz' }), true)
})

test('mismo telefono es el mismo cliente aunque cambie el nombre', () => {
  assert.equal(mismoCliente({ nombre: 'Nicole (providencia)', telefono: '+56 9 1234 5678' }, { nombre: 'Nicole Demo', telefono: '912345678' }), true)
})

test('sin nombre guardado (borrador antiguo) se mantiene como antes', () => {
  assert.equal(mismoCliente({ cotNum: '1600' }, { nombre: 'Cualquiera' }), true)
  assert.equal(mismoCliente(null, { nombre: 'Cualquiera' }), true)
})
