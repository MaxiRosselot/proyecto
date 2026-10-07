// Cotizacion que arma el propio cliente en /cotiza.
//
// El navegador manda las medidas de cada modulo, el proyecto 3D y dos vistas. El precio NO se
// toma del navegador: se recalcula aca con la planilla. Despues se asigna el numero, se arma el
// PDF, se guarda en Cotizaciones (por confirmar, con su modelo) y se envia por correo al cliente
// con copia a Don Maxi.
//
// Las dependencias (planilla, PDF, Drive, correo) se inyectan: en Netlify son Google, en local y
// en los tests son falsas. La logica es la misma.
import { precioRepisa } from '../../../src/admin/preciosRepisas.js'
import { actualizarCotizacion, crearCotizacion, listarCotizaciones, siguienteDisponible } from './cotizaciones.mjs'
import { MARCA, OFERTA, WHATSAPP } from './marca.mjs'

export const NOTA_WEB = 'Cotización web: la armó el cliente en /cotiza'
export const MAX_MODULOS = 40
const PROFUNDIDADES = [28, 38, 48, 68]
const ALTOS = [200, 250, 300]
// Un mismo correo no puede pedir mas que esto en dos horas: frena a quien use el formulario
// para mandar correos a terceros.
export const MAX_POR_CORREO = 3
const VENTANA_MS = 2 * 3600 * 1000
const CORREO = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/

export class ErrorCotizacionWeb extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado }
}
const falla = (mensaje, estado = 400) => { throw new ErrorCotizacionWeb(estado, mensaje) }

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const vista = (v, nombre) => {
  if (typeof v !== 'string' || !/^data:image\/png;base64,/.test(v) || v.length > 6e6) falla(`Falta la vista ${nombre} del modelo`)
  return v
}

export function validarSolicitud(body) {
  if (!body || typeof body !== 'object') falla('Solicitud inválida')
  // Campo trampa: invisible para las personas, los robots lo llenan.
  if (texto(body.sitio, 200)) falla('Solicitud inválida')
  const c = body.cliente || {}
  const cliente = {
    nombre: texto(c.nombre, 80), email: texto(c.email, 120).toLowerCase(),
    telefono: texto(c.telefono, 30), direccion: texto(c.direccion, 140),
  }
  if (cliente.nombre.length < 2) falla('Escribe tu nombre')
  if (!CORREO.test(cliente.email)) falla('Revisa tu correo: no parece válido')
  if (cliente.telefono.replace(/\D/g, '').length < 8) falla('Escribe un teléfono de contacto')

  const modulos = Array.isArray(body.modulos) ? body.modulos : []
  if (!modulos.length) falla('La cotización no tiene repisas')
  if (modulos.length > MAX_MODULOS) falla(`Máximo ${MAX_MODULOS} módulos por cotización`)
  const limpios = modulos.map(m => {
    const largoCm = Number(m?.largoCm), profundidadCm = Number(m?.profundidadCm), altoCm = Number(m?.altoCm), niveles = Number(m?.niveles)
    if (!(largoCm >= 50 && largoCm <= 243.5) || !PROFUNDIDADES.includes(profundidadCm) || !ALTOS.includes(altoCm)
      || !Number.isInteger(niveles) || niveles < 1 || niveles > 6) falla('Hay un módulo con medidas inválidas')
    return { largoCm, profundidadCm, altoCm, niveles, colgador: m?.colgador === true }
  })

  if (!body.proyecto3d || typeof body.proyecto3d !== 'object' || JSON.stringify(body.proyecto3d).length > 200000) falla('Falta el modelo 3D')
  const vistas = { isometric: vista(body.vistas?.isometric, 'isométrica'), top: vista(body.vistas?.top, 'en planta') }
  return { cliente, modulos: limpios, proyecto3d: body.proyecto3d, vistas }
}

// Filas de la cotizacion con el precio de la planilla. Una medida fuera de la tabla no se cotiza sola.
export function filasConPrecio(modulos, tabla) {
  return modulos.map(m => {
    const medidas = { largoM: m.largoCm / 100, profM: m.profundidadCm / 100, altoM: m.altoCm / 100 }
    const valor = precioRepisa(medidas, tabla)
    if (valor === null) falla('Alguna medida no está en nuestra tabla de precios. Escríbenos por WhatsApp y te la cotizamos al tiro.', 422)
    return {
      largo: medidas.largoM, prof: medidas.profM, alto: medidas.altoM, niveles: m.niveles, unidades: 1, valor,
      kind: 'shelf', colgador: m.colgador, ...(m.colgador ? { label: 'Con colgador' } : {}),
    }
  })
}

const pesos = n => '$' + Math.round(n).toLocaleString('es-CL')
const escapar = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const fechaHora = d => new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }).format(d)
const linkWhatsapp = texto => `https://wa.me/${WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`

// El cliente ya midio: el correo empuja a cerrar ahora (pago o WhatsApp), no a agendar una visita.
export function correoCliente({ cliente, cotNum, total, modulos, ofertaHasta, avisoA }) {
  const nombre = cliente.nombre.split(' ')[0]
  const lineas = [
    `Hola ${nombre}:`,
    '',
    `Te adjuntamos la cotización N° ${cotNum} de las repisas que armaste: ${modulos} ${modulos === 1 ? 'módulo' : 'módulos'} por ${pesos(total)} con IVA incluido.`,
    '',
    `Acéptala antes del ${fechaHora(ofertaHasta)} y obtén ${OFERTA.descuento}% de descuento adicional.`,
    '',
    'Para reservar tu instalación:',
    `• Paga en línea (débito o crédito, hasta 3 cuotas sin interés): ${MARCA.linkPago}`,
    `• O por transferencia: ${MARCA.razonSocial} · RUT ${MARCA.rut} · ${MARCA.banco} Cta. ${MARCA.tipoCuenta} ${MARCA.numeroCuenta}`,
    `• O confírmanos por WhatsApp: ${linkWhatsapp(`Hola, quiero aceptar la cotización N° ${cotNum}`)}`,
    '',
    'Puedes abonar el 50% para reservar y pagar el resto al terminar la instalación. Garantía de 5 años.',
    'Antes de fabricar revisamos las medidas contigo por WhatsApp.',
    '',
    'Repisas Don Maxi',
  ]
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.55">${lineas.map(l => l ? `<p style="margin:0 0 4px">${escapar(l)}</p>` : '<br>').join('')}</div>`
  return { para: cliente.email, responderA: avisoA, asunto: `Tu cotización N° ${cotNum} — Repisas Don Maxi`, texto: lineas.join('\n'), html }
}

export function correoAviso({ cliente, cotNum, total, modulos, pdfUrl, avisoA }) {
  const texto = [
    `Nueva cotización web N° ${cotNum}`,
    '',
    `Cliente: ${cliente.nombre}`,
    `Correo: ${cliente.email}`,
    `Teléfono: ${cliente.telefono}`,
    `Dirección: ${cliente.direccion || '-'}`,
    `Módulos: ${modulos} · Total con IVA: ${pesos(total)}`,
    ...(pdfUrl ? [`PDF: ${pdfUrl}`] : []),
    '',
    'Quedó en Admin → Cotizaciones como "por confirmar", con su modelo 3D: se puede abrir en el cotizador.',
  ].join('\n')
  return { para: avisoA, responderA: cliente.email, asunto: `Nueva cotización web N° ${cotNum} — ${cliente.nombre}`, texto }
}

export async function procesarCotizacionWeb(body, deps) {
  const { tabla, almacen, generarPdf, subirPdf, enviarCorreo, avisoA, ahora = new Date() } = deps
  const ofertaHasta = new Date(ahora.getTime() + OFERTA.horas * 3600 * 1000)
  const { cliente, modulos, proyecto3d, vistas } = validarSolicitud(body)
  const repisas = filasConPrecio(modulos, tabla)

  const { quotes } = await listarCotizaciones(almacen)
  const recientes = quotes.filter(q => String(q.email).toLowerCase() === cliente.email && q.notas === NOTA_WEB
    && q.creadoMs != null && ahora.getTime() - q.creadoMs < VENTANA_MS)
  if (recientes.length >= MAX_POR_CORREO) falla('Ya recibimos varias cotizaciones de este correo. Revisa tu bandeja o escríbenos por WhatsApp.', 429)

  // El numero va impreso en el PDF: si otro lo toma entre medio, se rehace con el siguiente.
  let numero = await siguienteDisponible(almacen)
  let pdf
  for (let intento = 0; ; intento++) {
    pdf = await generarPdf({ cot_num: numero, nombre: cliente.nombre, direccion: cliente.direccion, rut: '', telefono: cliente.telefono, email: cliente.email, repisas, grafica3d: vistas })
    const { estado, respuesta } = await crearCotizacion(almacen, {
      crear: true, cotNum: numero, ...cliente, fechaVisita: '',
      subtotal: pdf.subtotal, iva: pdf.iva, total: pdf.total,
      status: 'por confirmar', notas: NOTA_WEB, repisas, adicionales: {}, proyecto3d,
    }, ahora)
    if (estado === 201) break
    if (respuesta.siguiente && intento < 2) { numero = respuesta.siguiente; continue }
    falla('No pudimos guardar la cotización. Intenta de nuevo en un momento.', 503)
  }

  const nombreArchivo = `Cotizacion ${numero} - Repisas Don Maxi.pdf`
  let pdfUrl = ''
  try {
    pdfUrl = (await subirPdf({ pdfBuffer: pdf.bytes, fileName: nombreArchivo, cotNum: numero })).viewUrl || ''
    if (pdfUrl) await actualizarCotizacion(almacen, { cotNum: numero, pdfUrl })
  } catch (e) { console.error(`cotizacion-web: no se subió el PDF de la N° ${numero}:`, e) }

  const adjunto = { nombre: nombreArchivo, tipo: 'application/pdf', contenido: pdf.bytes }
  const datos = { cliente, cotNum: numero, total: pdf.total, modulos: repisas.length, pdfUrl, ofertaHasta, avisoA }
  let correoEnviado = true
  try { await enviarCorreo({ ...correoCliente(datos), adjuntos: [adjunto] }) }
  catch (e) { correoEnviado = false; console.error(`cotizacion-web: no se envió el correo de la N° ${numero}:`, e) }
  if (avisoA) {
    try { await enviarCorreo({ ...correoAviso(datos), adjuntos: [adjunto] }) }
    catch (e) { console.error(`cotizacion-web: no se envió el aviso de la N° ${numero}:`, e) }
  }

  // Lo que la pagina necesita para cerrar ahi mismo.
  return {
    cotNum: String(numero), total: pdf.total, correoEnviado,
    oferta: { hasta: ofertaHasta.toISOString(), descuento: OFERTA.descuento },
    pago: { link: MARCA.linkPago, razonSocial: MARCA.razonSocial, rut: MARCA.rut, banco: MARCA.banco, tipoCuenta: MARCA.tipoCuenta, numeroCuenta: MARCA.numeroCuenta },
    whatsapp: WHATSAPP,
  }
}
