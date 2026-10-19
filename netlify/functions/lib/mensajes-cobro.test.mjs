import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeCobro } from './mensajes.mjs'

test('el mensaje de cobro detalla los servicios y el total, sin datos bancarios', () => {
  const lineas = [{ nombre: '3 × Repisa 80 cm', monto: 150000 }, { nombre: 'Retiro y orden', monto: 30000 }]
  const texto = mensajeCobro({ nombre: 'Carlos Belmar', fecha: '2026-10-20' }, lineas, { subtotal: 162000, iva: 30780, total: 192780 }, { pagado: 50000, saldo: 142780 })
  assert.match(texto, /^¡Hola Carlos! .*instalación del martes,? 20 de octubre/)
  assert.match(texto, /• 3 × Repisa 80 cm: \$150\.000\n• Retiro y orden: \$30\.000\n• Descuento: −\$18\.000/)
  assert.match(texto, /Neto \$162\.000 \+ IVA \$30\.780 = \$192\.780\nYa pagado: \$50\.000\n\*Total a pagar: \$142\.780\*/)
  assert.doesNotMatch(texto, /RUT|Cta\.|BCI|transferir|mercadopago/i)
})
