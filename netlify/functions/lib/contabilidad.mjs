// Contabilidad de la cuenta corriente BCI de la empresa (Admin → Contabilidad).
//
// Los movimientos entran desde los PDF de BCI:
//  - la cartola mensual ("CARTOLA DE CUENTA CORRIENTE"): monto y saldo diario. El cargo o abono
//    sale de la diferencia de saldo, así que cada carga se comprueba contra el banco;
//  - los "Movimientos desde Última Cartola", que se pueden bajar cualquier día: monto con signo.
// Se pueden subir las veces que se quiera: lo que ya está no se repite (clave fecha + monto + glosa).
//
// Lo que el usuario confirma (categoría, cotización, costo fijo) queda guardado. Lo demás se sugiere
// en cada lectura con sus reglas, los pagos de las cotizaciones y los costos fijos, así que una
// regla nueva sirve también para lo que ya estaba cargado.
// Sin dependencias de Node: lo usan las funciones, el servidor local y los tests.

export const HOJA_BANCO = 'Banco'
export const ENCABEZADOS_BANCO = ['Id', 'Fecha', 'Glosa', 'Monto', 'Categoría', 'Cot N°', 'Costo fijo', 'Nota', 'Origen', 'Clave', 'Agregado', 'De / para']
export const HOJA_CONFIG = 'Contabilidad'

// tipo: ingreso | gasto | traspaso (se mueve plata pero no es ganancia ni gasto: no entra al resultado).
// iva: el monto trae IVA (para ver el resultado neto, como en el Excel).
export const CATEGORIAS = [
  { id: 'venta-transferencia', nombre: 'Venta (transferencia)', tipo: 'ingreso', grupo: 'Ventas', iva: true },
  { id: 'venta-mp', nombre: 'Retiro de Mercado Pago', tipo: 'traspaso', grupo: 'Ventas', iva: false },
  { id: 'venta-otra', nombre: 'Otra venta / depósito', tipo: 'ingreso', grupo: 'Ventas', iva: true },
  { id: 'otro-ingreso', nombre: 'Otro ingreso', tipo: 'ingreso', grupo: 'Otros', iva: false },
  { id: 'materiales', nombre: 'Materiales', tipo: 'gasto', grupo: 'Materiales', iva: true },
  { id: 'herramientas', nombre: 'Herramientas', tipo: 'gasto', grupo: 'Materiales', iva: true },
  { id: 'bencina', nombre: 'Bencina', tipo: 'gasto', grupo: 'Vehículo', iva: true },
  { id: 'auto', nombre: 'Cuota / mantención auto', tipo: 'gasto', grupo: 'Vehículo', iva: false },
  { id: 'tag', nombre: 'TAG / estacionamiento', tipo: 'gasto', grupo: 'Vehículo', iva: true },
  { id: 'bodega', nombre: 'Bodega', tipo: 'gasto', grupo: 'Fijos', iva: true },
  { id: 'celular', nombre: 'Celular / internet', tipo: 'gasto', grupo: 'Fijos', iva: true },
  { id: 'publicidad', nombre: 'Publicidad', tipo: 'gasto', grupo: 'Fijos', iva: true },
  { id: 'software', nombre: 'Software / suscripciones', tipo: 'gasto', grupo: 'Fijos', iva: true },
  { id: 'sueldos', nombre: 'Sueldos (líquido)', tipo: 'gasto', grupo: 'Personas', iva: false },
  { id: 'imposiciones', nombre: 'Imposiciones (Previred)', tipo: 'gasto', grupo: 'Personas', iva: false },
  { id: 'ayudas', nombre: 'Ayudas extra', tipo: 'gasto', grupo: 'Personas', iva: false },
  { id: 'contador', nombre: 'Contador', tipo: 'gasto', grupo: 'Personas', iva: false },
  { id: 'impuestos', nombre: 'IVA / impuestos (F29)', tipo: 'gasto', grupo: 'Impuestos', iva: false },
  { id: 'comisiones', nombre: 'Comisiones bancarias', tipo: 'gasto', grupo: 'Financieros', iva: false },
  { id: 'credito', nombre: 'Cuota crédito / tarjeta', tipo: 'gasto', grupo: 'Financieros', iva: false },
  { id: 'comida', nombre: 'Comida / colaciones', tipo: 'gasto', grupo: 'Otros', iva: true },
  { id: 'otro-gasto', nombre: 'Otro gasto', tipo: 'gasto', grupo: 'Otros', iva: false },
  { id: 'retiro-maxi', nombre: 'Retiro Maxi', tipo: 'traspaso', grupo: 'Dueño', iva: false },
  { id: 'aporte-maxi', nombre: 'Aporte Maxi', tipo: 'traspaso', grupo: 'Dueño', iva: false },
  { id: 'prestamo', nombre: 'Préstamo (recibido / devuelto)', tipo: 'traspaso', grupo: 'Financieros', iva: false },
  { id: 'cuenta-propia', nombre: 'Entre cuentas propias', tipo: 'traspaso', grupo: 'Otros', iva: false },
]
export const CATEGORIA = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]))

// Reglas de partida (las que aprende con "recordar" van antes). patron: texto que contiene la glosa.
export const REGLAS_BASE = [
  { patron: 'IMPERIAL', categoria: 'materiales' },
  { patron: 'SODIMAC', categoria: 'materiales' },
  { patron: 'EASY', categoria: 'materiales' },
  { patron: 'CONSTRUMART', categoria: 'materiales' },
  { patron: 'MERPAGO', categoria: 'materiales' },
  { patron: 'MERCADOLIBRE', categoria: 'materiales' },
  { patron: 'COPEC', categoria: 'bencina' },
  { patron: 'SHELL', categoria: 'bencina' },
  { patron: 'PETROBRAS', categoria: 'bencina' },
  { patron: 'ARAMCO', categoria: 'bencina' },
  { patron: 'STORAGE', categoria: 'bodega' },
  { patron: 'TRANSFER DE DON MAXI SPA', categoria: 'venta-mp' },
  { patron: 'TRANSFER DE M.ROSSELOT', categoria: 'aporte-maxi' },
  { patron: 'RECIBIDA DE DON MAXI SPA', categoria: 'venta-mp' },
  { patron: 'RECIBIDA DE MAXIMILIANO ROSSELOT', categoria: 'aporte-maxi' },
  { patron: 'ENVIADA A MAXIMILIANO ROSSELOT', categoria: 'retiro-maxi' },
  { patron: 'COMISION', categoria: 'comisiones' },
  { patron: 'IMPUESTO', categoria: 'comisiones' },
  { patron: 'PREVIRED', categoria: 'imposiciones' },
  { patron: 'TESORERIA', categoria: 'impuestos' },
]

const sinTildes = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
export const normalizarGlosa = s => sinTildes(s).toUpperCase()
  .replace(/^(OF CENTRA|UGCA AUT)\s*/, '')
  .replace(/([A-Z.])\d{6,}$/, '$1')            // N° de documento pegado al nombre (cartola)
  .replace(/(\s+\d[\d-]*)+$/, '')               // N° de documento y serial al final
  .replace(/\s+/g, ' ').trim()

// Para no repetir movimientos entre la cartola y los "movimientos desde la última cartola":
// las dos dicen distinto el N° de documento, así que se compara solo el comienzo de la glosa sin números.
export const glosaBase = s => normalizarGlosa(s).replace(/\d[\d-]*/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ')

const aNumero = s => Number(String(s).replace(/\./g, ''))
const fechaIso = dmy => { const [d, m, a] = dmy.split('/'); return `${a}-${m}-${d}` }
const MONTO = /^-?\d{1,3}(\.\d{3})*$/

// Corta el texto en un registro por movimiento (cada uno empieza con su fecha).
function registros(texto, inicio, fin) {
  const cuerpo = texto.slice(inicio, fin)
  return cuerpo.split(/(?=\b\d\d\/\d\d\/\d{4})/).map(r => r.replace(/\s+/g, ' ').trim()).filter(r => /^\d\d\/\d\d\/\d{4}/.test(r))
}

// Lee el texto de un PDF de BCI (pdf-parse o similar). Devuelve los movimientos con su monto con signo.
export function parsearCartolaBci(texto) {
  const t = String(texto || '').replace(/\r/g, '')
  const errores = []
  if (/Movimientos desde [ÚU]ltima Cartola/i.test(t)) {
    const saldoAnterior = t.match(/Saldo [ÚU]ltima Cartola\s*\$?\s*([\d.]+)/i)
    const saldoActual = t.match(/Saldo Contable\s*\$?\s*([\d.]+)/i)
    const fechaCorte = t.match(/Fecha:\s*(\d\d\/\d\d\/\d{4})/)
    const ini = t.search(/Movimientos Cuenta Corriente/i)
    const movimientos = []
    for (const r of registros(t, ini < 0 ? 0 : ini)) {
      const fecha = fechaIso(r.slice(0, 10))
      // El monto puede venir pegado a la glosa ("PEREZ SOTO150.000", "MAPOCHO 123456-45.000").
      const m = r.slice(10).trim().match(/^(.*?)\s*(-?\d{1,3}(?:\.\d{3})*)$/)
      if (!m || !m[1]) { errores.push(r); continue }
      movimientos.push({ fecha, glosa: m[1], monto: aNumero(m[2]) })
    }
    const ini0 = saldoAnterior && aNumero(saldoAnterior[1])
    const fin0 = saldoActual && aNumero(saldoActual[1])
    const suma = movimientos.reduce((s, m) => s + m.monto, 0)
    return {
      formato: 'movimientos', movimientos, errores,
      saldoInicial: ini0 ?? null, saldoFinal: fin0 ?? null,
      fechaSaldo: fechaCorte ? fechaIso(fechaCorte[1]) : (movimientos.at(-1)?.fecha || null),
      cuadra: ini0 != null && fin0 != null ? ini0 + suma === fin0 : null,
    }
  }
  if (/CARTOLA DE CUENTA CORRIENTE/i.test(t)) {
    // "1.000.000-250.000 + 300.000 =1.050.000": saldo anterior - cargos + abonos = saldo final
    const resumen = t.match(/(\d{1,3}(?:\.\d{3})*)\s*-\s*(\d{1,3}(?:\.\d{3})*)\s*\+\s*(\d{1,3}(?:\.\d{3})*)\s*=\s*(\d{1,3}(?:\.\d{3})*)/)
    const periodo = t.match(/PERIODO\s*(\d\d-\d\d-\d{4})\s*al\s*(\d\d-\d\d-\d{4})/i)
    const ini = t.search(/PERIODO/i)
    const finTexto = t.search(/Resumen del Periodo/i)
    let saldo = resumen ? aNumero(resumen[1]) : null
    const movimientos = []
    for (const r0 of registros(t, ini < 0 ? 0 : ini, finTexto < 0 ? undefined : finTexto)) {
      // Lo que viene después del movimiento en la misma página (encabezados de la tabla) no es parte de él.
      const r = r0.replace(/\s*FECHA\s*SUCURSAL[\s\S]*$/i, '')
      const fecha = fechaIso(r.slice(0, 10))
      const partes = r.slice(10).trim().split(' ')
      const nSaldo = partes.at(-1), nMonto = partes.at(-2)
      if (!MONTO.test(nSaldo || '') || !MONTO.test(nMonto || '')) { errores.push(r); continue }
      const nuevo = aNumero(nSaldo), monto = aNumero(nMonto)
      let signo = 0
      if (saldo == null) signo = 1
      else if (saldo + monto === nuevo) signo = 1
      else if (saldo - monto === nuevo) signo = -1
      if (!signo) { errores.push(r); saldo = nuevo; continue }
      movimientos.push({ fecha, glosa: partes.slice(0, -2).join(' '), monto: signo * monto, saldo: nuevo })
      saldo = nuevo
    }
    const saldoInicial = resumen ? aNumero(resumen[1]) : null
    const saldoFinal = resumen ? aNumero(resumen[4]) : null
    const suma = movimientos.reduce((s, m) => s + m.monto, 0)
    return {
      formato: 'cartola', movimientos, errores, saldoInicial, saldoFinal,
      fechaSaldo: periodo ? periodo[2].split('-').reverse().join('-') : (movimientos.at(-1)?.fecha || null),
      cuadra: saldoInicial != null && saldoFinal != null ? saldoInicial + suma === saldoFinal && !errores.length : null,
    }
  }
  return { formato: null, movimientos: [], errores: ['No parece una cartola de BCI'], saldoInicial: null, saldoFinal: null, fechaSaldo: null, cuadra: null }
}

// Junta los movimientos leídos con los guardados sin repetirlos. Las fuentes escriben distinto la
// glosa (cartola "TRANSFER DE N.TAPIA CESPE", banco en línea "Transferencia recibida de Nicolás
// Tapia Céspedes"), así que el mismo movimiento se reconoce por fecha contable + monto: el 1.º de
// ese día y monto con el 1.º, el 2.º con el 2.º. Si lo leído trae el nombre completo y el guardado
// no, se le agrega. Los anotados a mano no cuentan (no están en el banco).
export function fusionarMovimientos(existentes, leidos, { origen = '', ahora = new Date().toISOString(), siempreNuevos = false } = {}) {
  const grupos = new Map()
  for (const m of existentes) {
    if (m.origen === 'manual') continue
    const k = `${m.fecha}|${m.monto}`
    grupos.set(k, [...(grupos.get(k) || []), m])
  }
  const vistos = new Map()
  const nuevos = []
  let enriquecidos = 0
  for (const m of leidos) {
    const k = `${m.fecha}|${m.monto}`
    const n = (vistos.get(k) || 0) + 1
    vistos.set(k, n)
    const igual = !siempreNuevos && grupos.get(k)?.[n - 1]
    if (igual) {
      if (m.contraparte && !igual.contraparte) { igual.contraparte = m.contraparte; enriquecidos++ }
      continue
    }
    const glosa = String(m.glosa).replace(/\s+/g, ' ').trim()
    const clave = `${k}|${n}|${glosaBase(glosa)}${siempreNuevos ? '|' + ahora : ''}`
    nuevos.push({
      id: 'b' + hash(clave), fecha: m.fecha, glosa, monto: m.monto,
      categoria: '', cotNum: '', fijo: '', nota: '', origen, clave, agregado: ahora, contraparte: m.contraparte || '',
    })
  }
  return { nuevos, enriquecidos, todos: [...existentes, ...nuevos].sort((a, b) => a.fecha.localeCompare(b.fecha)) }
}

// Lo que manda la extensión desde "Mis Movimientos" de BCI en línea:
// { fecha: 'dd/mm/aa', fechaContable: 'dd/mm/aa', descripcion, monto (con signo), saldo }.
// La fecha que vale es la contable (la misma de la cartola).
const aIso = f => { const [d, m, a] = String(f).split('/'); return `${a.length === 2 ? '20' + a : a}-${m}-${d}` }
export function movimientosDeBancoEnLinea(lista) {
  return (lista || []).filter(x => /^\d\d\/\d\d\/\d{2,4}$/.test(x?.fechaContable || x?.fecha || '') && Number.isFinite(Number(x.monto)) && Number(x.monto))
    .map(x => {
      const descripcion = String(x.descripcion || '').replace(/\s+/g, ' ').trim()
      const rec = descripcion.match(/^transferencia recibida de (.+)$/i)
      const env = descripcion.match(/^transferencia enviada a (.+)$/i)
      return {
        fecha: aIso(x.fechaContable || x.fecha), fechaOperacion: aIso(x.fecha || x.fechaContable), glosa: descripcion, monto: Math.round(Number(x.monto)),
        saldo: Number.isFinite(Number(x.saldo)) ? Math.round(Number(x.saldo)) : null,
        contraparte: rec ? 'De ' + rec[1] : env ? 'A ' + env[1] : '',
      }
    })
}

// El banco en línea muestra lo más nuevo arriba y el saldo después de cada movimiento: si cada saldo
// es el siguiente más su monto, no falta ninguno entre medio.
export function saldosEncadenan(lista) {
  for (let i = 0; i + 1 < lista.length; i++) {
    const a = lista[i], b = lista[i + 1]
    if (a.saldo == null || b.saldo == null) return null
    if (b.saldo + a.monto !== a.saldo) return false
  }
  return true
}

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

export const movimientoAFila = m => [m.id, m.fecha, m.glosa, m.monto, m.categoria, m.cotNum, m.fijo, m.nota, m.origen, m.clave, m.agregado, m.contraparte || '']
export const filaAMovimiento = f => ({
  id: String(f[0] || ''), fecha: String(f[1] || ''), glosa: String(f[2] || ''), monto: Number(f[3]) || 0,
  categoria: CATEGORIA[f[4]] ? f[4] : '', cotNum: String(f[5] || ''), fijo: String(f[6] || ''), nota: String(f[7] || ''),
  origen: String(f[8] || ''), clave: String(f[9] || ''), agregado: String(f[10] || ''), contraparte: String(f[11] || ''),
})

// ---------- Sugerencias ----------

// "TRANSFER DE C.FUENTES T" → { inicial: 'C', palabras: ['FUENTES', 'T'] }. Sirve también para
// "Abono Terceros 11111111-1 M.ARAYA HER" y "TRANSFER DE ALGUNA EMPRESA SPA".
export function remitente(glosa) {
  const g = normalizarGlosa(glosa)
  const m = g.match(/^(?:TRANSFERENCIA RECIBIDA DE|TRANSFER DE|ABONO TERCEROS(?: [\d.]+-[\dK])?|ABONO TRF DESDE OTRO BANCO EN LINEA)\s*(.*)$/)
  if (!m || !m[1]) return null
  const texto = m[1].trim()
  const conInicial = texto.match(/^([A-Z])\.(.+)$/)
  return conInicial
    ? { texto, inicial: conInicial[1], palabras: conInicial[2].split(' ').filter(Boolean) }
    : { texto, inicial: '', palabras: texto.split(' ').filter(Boolean) }
}

const palabrasNombre = s => sinTildes(s).toUpperCase().replace(/[^A-Z ]/g, ' ').split(' ').filter(Boolean)

// ¿El nombre de la cotización calza con el remitente del banco? El banco corta los nombres
// (~14 letras): "C.FUENTES T" o "FERNANDO ANDR", así que la última palabra puede venir a medias.
export function nombreCalza(rem, nombre) {
  if (!rem) return false
  const ps = palabrasNombre(nombre)
  if (!ps.length) return false
  const w = rem.palabras.map(p => p.replace(/[^A-Z]/g, '')).filter(Boolean)
  if (!w.length) return false
  const contiene = (p, i, ultima) => ps.some((x, j) => j >= i && (ultima ? x.startsWith(p) : x === p))
  if (rem.inicial) {
    // inicial del nombre + apellido completo (la última palabra puede estar cortada)
    return ps[0].startsWith(rem.inicial) && contiene(w[0], 1, w.length === 1 && w[0].length >= 9)
  }
  // nombre completo: todas las palabras, la última puede estar cortada
  return w.every((p, i) => p.length >= 2 && contiene(p, 0, i === w.length - 1))
}

// El nombre completo que se anota a mano desde la app de BCI ("Nicolás Antonio Tapia Céspedes"):
// calza si comparten el primer nombre y un apellido, o si todas las palabras de uno están en el otro.
const RELLENO = ['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y']
export function nombresCalzan(a, b) {
  const x = palabrasNombre(a).filter(p => p.length > 1 && !RELLENO.includes(p))
  const y = palabrasNombre(b).filter(p => p.length > 1 && !RELLENO.includes(p))
  if (!x.length || !y.length) return false
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x]
  if (corto.length >= 2 && corto.every(p => largo.includes(p))) return true
  return x[0] === y[0] && x.slice(1).some(p => y.slice(1).includes(p))
}

// ¿Esta cotización es de quien hizo el movimiento? Con el nombre anotado a mano, por ese; si no, por la glosa.
export function esDeQuien(mov, nombre) {
  const quien = String(mov.contraparte || '').replace(/^\s*(de|a)\s+/i, '')
  return quien ? nombresCalzan(quien, nombre) : nombreCalza(remitente(mov.glosa), nombre)
}

const diasEntre = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000)

// Abonos de clientes: busca la cotización. Primero un pago registrado del mismo monto (±4 días);
// si no, un cliente con ese nombre que deba ese monto (total, 50 % o saldo).
export function cotizacionDelAbono(mov, cotizaciones) {
  if (mov.monto <= 0) return null
  const rem = remitente(mov.glosa) || (mov.contraparte ? {} : null)
  const pagos = []
  for (const c of cotizaciones) for (const p of c.pagos || []) pagos.push({ c, p })
  const mismoMonto = pagos.filter(({ p }) => Math.round(Number(p.monto)) === mov.monto && p.fecha && diasEntre(p.fecha, mov.fecha) <= 4 && p.medio !== 'Mercado Pago')
  const porNombre = mismoMonto.filter(({ c }) => esDeQuien(mov, c.nombre))
  const elegido = porNombre[0] || (mismoMonto.length === 1 ? mismoMonto[0] : null)
  if (elegido) return { cotNum: elegido.c.cotNum, nombre: elegido.c.nombre, registrado: true, pagoId: elegido.p.id, motivo: porNombre[0] ? 'pago registrado, mismo nombre y monto' : 'pago registrado del mismo monto' }
  if (!rem) return null
  const candidatos = cotizaciones.filter(c => esDeQuien(mov, c.nombre) && c.status !== 'rechazada')
  for (const c of candidatos) {
    const total = Math.round(Number(c.total) || 0)
    const pagado = (c.pagos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0)
    const opciones = [total, Math.round(total / 2), total - pagado].filter(v => v > 0)
    if (opciones.some(v => Math.abs(v - mov.monto) <= 2)) return { cotNum: c.cotNum, nombre: c.nombre, registrado: false, motivo: 'mismo nombre y monto que la cotización (pago sin registrar)' }
  }
  if (candidatos.length === 1) return { cotNum: candidatos[0].cotNum, nombre: candidatos[0].nombre, registrado: false, motivo: 'mismo nombre (monto distinto)', dudoso: true }
  return null
}

function reglaPara(mov, reglas) {
  const g = normalizarGlosa(mov.glosa)
  const quien = normalizarGlosa(mov.contraparte || '')
  const lado = mov.monto < 0 ? 'cargo' : 'abono'
  const aplica = r => (r.campo === 'contraparte' ? quien && quien === normalizarGlosa(r.patron) : g.includes(normalizarGlosa(r.patron))) && (!r.lado || r.lado === lado) && (r.monto == null || r.monto === Math.abs(mov.monto))
  // Las aprendidas con monto son las más precisas, luego las aprendidas, luego las de partida.
  return reglas.find(r => r.monto != null && aplica(r)) || reglas.find(r => r.monto == null && aplica(r)) || REGLAS_BASE.find(aplica) || null
}

// Para cada costo fijo y mes sin pago confirmado, el cargo que mejor calza: con su texto (si tiene)
// o un monto parecido (±5 %); entre varios, el monto más cercano y luego el día más cercano al vencimiento.
function fijosSugeridos(movimientos, fijos) {
  const usados = new Set(movimientos.filter(m => m.fijo).map(m => `${m.fijo}|${m.fecha.slice(0, 7)}`))
  const tomados = new Map()
  const cargos = movimientos.filter(m => m.monto < 0 && !m.fijo)
  const meses = [...new Set(cargos.map(m => m.fecha.slice(0, 7)))]
  for (const f of fijos.filter(x => x.activo !== false)) {
    for (const mes of meses) {
      if (usados.has(`${f.id}|${mes}`)) continue
      const calza = m => {
        const monto = -m.monto
        if (f.patron) return normalizarGlosa(m.glosa).includes(normalizarGlosa(f.patron)) && (!f.monto || Math.abs(monto - f.monto) <= f.monto * 0.25)
        return f.monto && Math.abs(monto - f.monto) <= Math.max(2, f.monto * 0.05)
      }
      const opciones = cargos.filter(m => m.fecha.startsWith(mes) && !tomados.has(m.id) && calza(m))
      const puntaje = m => [Math.abs(-m.monto - (f.monto || 0)), Math.abs(Number(m.fecha.slice(8)) - (Number(f.dia) || 1))]
      opciones.sort((x, y) => { const [a1, a2] = puntaje(x), [b1, b2] = puntaje(y); return a1 - b1 || a2 - b2 })
      if (opciones[0]) tomados.set(opciones[0].id, f)
    }
  }
  return tomados
}

// Cada movimiento con lo confirmado y, si falta, lo sugerido: { categoria, cotizacion, fijo, motivo }.
export function conSugerencias(movimientos, { reglas = [], cotizaciones = [], fijos = [] } = {}) {
  const sugeridos = fijosSugeridos(movimientos, fijos)
  return movimientos.map(m => {
    const s = { categoria: '', cotNum: '', fijo: '', motivo: '', registrado: null, dudoso: false }
    const fijoConf = m.fijo && fijos.find(f => f.id === m.fijo)
    const f = sugeridos.get(m.id)
    if (f) { s.fijo = f.id; s.motivo = `parece "${f.nombre}"`; if (f.categoria) s.categoria = f.categoria }
    if (!m.cotNum && m.monto > 0 && !['aporte-maxi', 'venta-mp', 'prestamo', 'cuenta-propia', 'otro-ingreso'].includes(m.categoria)) {
      const c = cotizacionDelAbono(m, cotizaciones)
      if (c) { s.cotNum = c.cotNum; s.nombre = c.nombre; s.registrado = c.registrado; s.dudoso = !!c.dudoso; s.motivo = c.motivo; s.categoria = s.categoria || 'venta-transferencia' }
    }
    if (!m.categoria && !s.categoria) {
      const r = reglaPara(m, reglas)
      if (r) { s.categoria = r.categoria; s.motivo = s.motivo || (r.aprendida ? 'como la vez anterior' : `contiene "${r.patron}"`) }
    }
    if (!m.categoria && !s.categoria && fijoConf?.categoria) s.categoria = fijoConf.categoria
    // Una transferencia de una persona o empresa que no es la propia: casi siempre es un cliente.
    const deQuien = remitente(m.glosa)?.texto || normalizarGlosa(m.contraparte)
    if (!m.categoria && !s.categoria && m.monto > 0 && deQuien && !/^(DE )?(DON MAXI|M\.ROSSELOT|MAXIMILIANO ROSSELOT)/.test(normalizarGlosa(deQuien))) {
      s.categoria = 'venta-transferencia'; s.motivo = 'transferencia recibida: ¿un cliente? (no encontré su cotización)'
    }
    const categoria = m.categoria || s.categoria
    return { ...m, sugerencia: s, categoriaFinal: categoria, confirmado: Boolean(m.categoria) }
  })
}

// Regla que se aprende al clasificar con "recordar": la glosa sin números (y el monto, si la glosa
// sola no dice nada, como "TRASPASO FONDOS OTRO BANCO EN LINEA").
const GLOSAS_GENERICAS = /^(TRASPASO FONDOS OTRO BANCO|CARGO POR TRANSF|TRANSFERENCIA DE FONDOS|ABONO TRF DESDE OTRO BANCO|TRANSFER A$)/
export function reglaAprendida(mov, categoria) {
  // Con el nombre anotado ("A Maximiliano Rosselot"), se recuerda por esa persona, cualquier monto.
  if (mov.contraparte) return { patron: normalizarGlosa(mov.contraparte), campo: 'contraparte', categoria, lado: mov.monto < 0 ? 'cargo' : 'abono', monto: null, aprendida: true }
  const patron = normalizarGlosa(mov.glosa).replace(/\d[\d-]*/g, ' ').replace(/\s+/g, ' ').trim()
  const generica = GLOSAS_GENERICAS.test(patron)
  return { patron, categoria, lado: mov.monto < 0 ? 'cargo' : 'abono', monto: generica ? Math.abs(mov.monto) : null, aprendida: true }
}

export function agregarRegla(reglas, nueva) {
  const igual = r => r.patron === nueva.patron && (r.campo || '') === (nueva.campo || '') && r.lado === nueva.lado && (r.monto ?? null) === (nueva.monto ?? null)
  return [nueva, ...reglas.filter(r => !igual(r))].slice(0, 300)
}

// ---------- Conciliación por cliente ----------

// Para el mes: cada cotización con pagos (fuera de Mercado Pago) o con abonos ligados en el banco,
// lo registrado contra lo que llegó. Y los abonos que parecen de clientes sin cotización.
export function conciliarClientes(movs, cotizaciones, mes) {
  const delMes = movs.filter(m => m.fecha.startsWith(mes) && m.monto > 0)
  const ligados = new Map()
  for (const m of delMes) {
    const n = m.cotNum || (m.sugerencia?.cotNum && !m.sugerencia.dudoso ? m.sugerencia.cotNum : '')
    if (n) ligados.set(n, [...(ligados.get(n) || []), m])
  }
  const filas = []
  for (const c of cotizaciones) {
    const pagos = (c.pagos || []).filter(p => String(p.fecha || '').startsWith(mes) && p.medio !== 'Mercado Pago')
    const movsC = ligados.get(String(c.cotNum)) || []
    if (!pagos.length && !movsC.length) continue
    const registrado = pagos.reduce((s, p) => s + Math.round(Number(p.monto) || 0), 0)
    const efectivo = pagos.filter(p => /efectivo/i.test(p.medio)).reduce((s, p) => s + Math.round(Number(p.monto) || 0), 0)
    const enBanco = movsC.reduce((s, m) => s + m.monto, 0)
    const porConfirmar = movsC.some(m => !m.cotNum)
    const diferencia = enBanco - (registrado - efectivo)
    filas.push({
      cotNum: String(c.cotNum), nombre: c.nombre, total: Math.round(Number(c.total) || 0),
      registrado, efectivo, enBanco, diferencia, porConfirmar,
      estado: diferencia === 0 ? (porConfirmar ? 'por confirmar' : 'cuadra') : !movsC.length ? 'no llegó al banco' : registrado - efectivo === 0 ? 'pago sin registrar' : 'montos distintos',
      pagos: pagos.map(p => ({ fecha: p.fecha, monto: Math.round(Number(p.monto) || 0), medio: p.medio })),
      movimientos: movsC.map(m => ({ id: m.id, fecha: m.fecha, monto: m.monto, confirmado: Boolean(m.cotNum) })),
    })
  }
  const sinCotizacion = delMes.filter(m => !m.cotNum && !m.sugerencia?.cotNum && ['venta-transferencia', 'venta-otra', ''].includes(m.categoriaFinal || ''))
  const orden = { 'no llegó al banco': 0, 'pago sin registrar': 1, 'montos distintos': 2, 'por confirmar': 3, cuadra: 4 }
  return { filas: filas.sort((a, b) => orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre)), sinCotizacion: sinCotizacion.map(m => m.id) }
}

// ---------- Costos fijos ----------

const diasDelMes = mes => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()

// Estado de cada costo fijo en el mes: pagado (con qué movimiento), por vencer o vencido.
export function estadoFijos(fijos, movimientos, mes, hoy) {
  return fijos.filter(f => f.activo !== false).map(f => {
    const pagos = movimientos.filter(m => m.fecha.startsWith(mes) && (m.fijo || m.sugerencia?.fijo) === f.id)
    const pagado = pagos.reduce((s, m) => s - m.monto, 0)
    const dia = Math.min(Math.max(1, Number(f.dia) || 1), diasDelMes(mes))
    const vence = `${mes}-${String(dia).padStart(2, '0')}`
    const faltan = Math.round((Date.parse(vence) - Date.parse(hoy)) / 86400000)
    const estado = pagos.length ? (pagos.every(m => m.fijo) ? 'pagado' : 'pagado?') : hoy.slice(0, 7) > mes || faltan < 0 ? 'vencido' : faltan <= 3 ? 'por vencer' : 'pendiente'
    return { ...f, vence, faltan, estado, pagado, movimientos: pagos.map(m => m.id) }
  })
}

// Cargos del mismo monto (±1 %) en dos meses distintos o más que no son costos fijos todavía.
export function pareceFijo(movimientos, fijos = []) {
  const cargos = movimientos.filter(m => m.monto < -5000 && !m.fijo && !m.sugerencia?.fijo)
  const grupos = []
  for (const m of cargos) {
    const g = grupos.find(x => Math.abs(x.monto - -m.monto) <= x.monto * 0.01 && glosaBase(x.glosa) === glosaBase(m.glosa))
    if (g) { g.movs.push(m); g.meses.add(m.fecha.slice(0, 7)) } else grupos.push({ monto: -m.monto, glosa: m.glosa, movs: [m], meses: new Set([m.fecha.slice(0, 7)]) })
  }
  const yaFijo = g => fijos.some(f => f.monto && Math.abs(f.monto - g.monto) <= f.monto * 0.05)
  return grupos.filter(g => g.meses.size >= 2 && !yaFijo(g))
    .map(g => ({ monto: g.monto, glosa: normalizarGlosa(g.glosa), dia: Math.round(g.movs.reduce((s, m) => s + Number(m.fecha.slice(8)), 0) / g.movs.length), veces: g.movs.length, categoria: g.movs.find(m => m.categoriaFinal)?.categoriaFinal || '' }))
    .sort((a, b) => b.monto - a.monto)
}

export function limpiarFijo(f, existentes = []) {
  const nombre = String(f?.nombre || '').trim().slice(0, 60)
  if (!nombre) throw Object.assign(new Error('Escribe el nombre del costo fijo'), { estado: 400 })
  const id = /^f[a-z0-9]{1,12}$/.test(f.id || '') ? f.id : 'f' + (Math.max(0, ...existentes.map(x => Number(String(x.id).slice(1)) || 0)) + 1)
  return {
    id, nombre, categoria: CATEGORIA[f.categoria] ? f.categoria : '', monto: Math.max(0, Math.round(Number(f.monto) || 0)),
    dia: Math.min(31, Math.max(1, Math.round(Number(f.dia) || 1))), patron: String(f.patron || '').trim().slice(0, 60), activo: f.activo !== false,
  }
}

// ---------- Mercado Pago ----------

// Los pagos aprobados de Mercado Pago de un mes: venta bruta, comisión (con su IVA) y lo que queda.
export function resumenMercadoPago(pagos) {
  const lista = (pagos || []).filter(p => p.status === 'approved').map(p => {
    const bruto = Math.round(Number(p.transaction_amount) || 0)
    const comision = Math.round((p.fee_details || []).reduce((s, f) => s + (Number(f.amount) || 0), 0))
    const neto = Math.round(Number(p.transaction_details?.net_received_amount ?? bruto - comision))
    return {
      id: String(p.id), fecha: String(p.date_approved || p.date_created || '').slice(0, 10), bruto, comision, neto,
      cotNum: String(p.external_reference || p.metadata?.cot_num || ''), descripcion: String(p.description || ''),
      pagador: [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(' ') || p.payer?.email || '',
      liberado: String(p.money_release_date || '').slice(0, 10), medio: p.payment_type_id || '',
    }
  })
  const suma = k => lista.reduce((s, p) => s + p[k], 0)
  return { pagos: lista, bruto: suma('bruto'), comision: suma('comision'), neto: suma('neto'), cantidad: lista.length }
}

// ---------- Resumen del mes ----------

// Descuentos que se dieron en las ventas pagadas del mes (lo que se dejó de cobrar).
export function descuentosDelMes(cotizaciones, mes, totalesDe) {
  const lista = []
  for (const c of cotizaciones) {
    const pagos = (c.pagos || []).filter(p => String(p.fecha || '').startsWith(mes))
    if (!pagos.length) continue
    const primero = (c.pagos || []).map(p => p.fecha).sort()[0]
    if (!String(primero).startsWith(mes)) continue
    const t = totalesDe(c)
    if (t.descuento > 0) lista.push({ cotNum: c.cotNum, nombre: c.nombre, pct: t.descuentoPct, monto: Math.round(t.descuento * 1.19) })
  }
  return { lista, total: lista.reduce((s, d) => s + d.monto, 0) }
}

export function resumenMes(movs, mes, { mp = null } = {}) {
  const delMes = movs.filter(m => m.fecha.startsWith(mes))
  const porCategoria = {}
  let sinClasificar = 0, montoSinClasificar = 0
  for (const m of delMes) {
    const id = m.categoriaFinal
    if (!id) { sinClasificar++; montoSinClasificar += m.monto; continue }
    porCategoria[id] = porCategoria[id] || { id, total: 0, cantidad: 0, porConfirmar: 0 }
    porCategoria[id].total += m.monto; porCategoria[id].cantidad++
    if (!m.confirmado) porCategoria[id].porConfirmar++
  }
  // Sin datos de Mercado Pago, lo que llega de MP al banco es la única forma de ver esas ventas.
  const lineas = Object.values(porCategoria).map(l => ({ ...l, ...CATEGORIA[l.id], ...(l.id === 'venta-mp' && !mp ? { tipo: 'ingreso' } : {}) }))
  const suma = (tipo, neto) => lineas.filter(l => l.tipo === tipo).reduce((s, l) => s + (neto && l.iva ? Math.round(l.total / 1.19) : l.total), 0)
  // Con los datos de Mercado Pago, las ventas por MP entran por su monto bruto y la comisión como
  // gasto; el retiro de MP al banco es solo un traspaso (si no, se contaría dos veces).
  const mpBruto = mp ? mp.bruto : 0
  const mpComision = mp ? mp.comision : 0
  const resultado = neto => {
    const ingresos = suma('ingreso', neto) + (neto ? Math.round(mpBruto / 1.19) : mpBruto)
    const gastos = -suma('gasto', neto) + (neto ? Math.round(mpComision / 1.19) : mpComision)
    return { ingresos, gastos, resultado: ingresos - gastos }
  }
  return {
    mes, cantidad: delMes.length, sinClasificar, montoSinClasificar,
    entradas: delMes.filter(m => m.monto > 0).reduce((s, m) => s + m.monto, 0),
    salidas: -delMes.filter(m => m.monto < 0).reduce((s, m) => s + m.monto, 0),
    porConfirmar: delMes.filter(m => !m.confirmado).length,
    lineas: lineas.sort((a, b) => a.total - b.total),
    conIva: resultado(false), sinIva: resultado(true),
  }
}

export const mesDe = fecha => String(fecha || '').slice(0, 7)
