// Textos del sitio publico. Para cambiar una pregunta, una ventaja o agregar reseñas, se edita aca.
import { MARCA, OFERTA, SERVICIOS } from '../../netlify/functions/lib/marca.mjs'

// Cifras de la portada. Salen de la planilla de ventas 2025 (587 instalaciones, mediana 2 h).
export const CIFRAS = [
  { valor: '+580', texto: 'instalaciones en 2025' },
  { valor: '≈ 2 h', texto: 'dura una instalación típica' },
  { valor: '5 años', texto: 'de garantía' },
  { valor: `${MARCA.rating} ★`, texto: `en Google · ${MARCA.resenas} reseñas` },
]

export const PASOS = [
  { titulo: 'Cotiza', texto: 'En línea en un par de minutos, enviándonos fotos o con una visita. Tú eliges.' },
  { titulo: 'Agenda', texto: 'Con tu cotización te llega un link para elegir el día y la hora de la instalación.' },
  { titulo: 'Instalamos', texto: 'Llegamos con todo cortado a tu medida y lo dejamos listo en pocas horas. Pagas al terminar.' },
]

export const VENTAJAS = [
  { icono: '📐', titulo: 'Al centímetro', texto: 'Cada repisa se fabrica para tu espacio: aprovechamos el largo, el alto y las esquinas.' },
  { icono: '🧊', titulo: 'Tu bodega en 3D', texto: 'Antes de comprar ves cómo queda tu bodega con las repisas, desde cualquier ángulo.' },
  { icono: '📅', titulo: 'Agenda en línea', texto: 'Eliges día y hora de la instalación desde tu link, y puedes cambiarla hasta 48 h antes.' },
  { icono: '🛡️', titulo: '5 años de garantía', texto: 'Sobre la estructura y la instalación.' },
  { icono: '💳', titulo: 'Pagas al terminar', texto: `Abona el 50% antes o paga todo al final. Por transferencia tienes ${OFERTA.descuento}% de descuento.` },
  { icono: '🧥', titulo: 'Hecho a tu uso', texto: 'Barra para colgar ropa, nivel antiinundación, doble profundidad o soporte para la bicicleta.' },
]

export const SERVICIOS_SITIO = SERVICIOS.map(([clave, nombre, , descripcion]) => ({ clave, nombre, descripcion, foto: `/web/servicios/${clave}.jpg` }))

// Reseñas de Google para la portada, copiadas tal cual de la ficha (nombre como aparece en Google).
// Mientras la lista este vacia, la portada muestra la nota y el link a Google.
//   { nombre: 'Ana P.', texto: '…', fecha: 'hace 2 meses' }
export const RESENAS = []

export const PREGUNTAS = [
  {
    grupo: 'Cotización',
    preguntas: [
      ['¿Cómo cotizo?', 'De tres formas: con la cotización automática (dibujas tu bodega y ves el precio al instante), enviándonos fotos o un video, o agendando una visita para que un especialista tome las medidas.'],
      ['¿La visita tiene costo?', 'No. Las visitas son sin costo y las hacemos los domingos: un especialista toma las medidas y te enviamos la cotización.'],
      ['¿Qué medidas necesito para cotizar en línea?', 'El largo de cada muro, el alto de la bodega y dónde está la puerta. Si no las tienes, envíanos fotos o un video desde la puerta y te ayudamos.'],
      ['¿Los precios incluyen IVA?', 'La cotización muestra el neto, el IVA y el total. El total ya incluye la instalación.'],
      ['¿Cuánto se demoran en enviarme la cotización?', 'La cotización automática te llega al correo al instante. Si nos envías fotos, te la enviamos apenas las revisemos; si nos falta alguna medida, te escribimos por WhatsApp.'],
      ['¿Puedo cambiar el diseño después de cotizar?', 'Sí. Escríbenos con los cambios y te enviamos la cotización actualizada.'],
    ],
  },
  {
    grupo: 'Instalación',
    preguntas: [
      ['¿Cuánto demora la instalación?', 'Depende del tamaño: una bodega típica queda lista en unas 2 horas. Al agendar te mostramos la duración estimada de la tuya.'],
      ['¿Cómo agendo la instalación?', 'Con tu cotización te llega un link para elegir el día y la hora. Instalamos de lunes a viernes.'],
      ['¿Puedo cambiar la fecha?', 'Sí, desde el mismo link hasta 48 horas antes. Si falta menos, escríbenos por WhatsApp y lo vemos.'],
      ['¿Tengo que vaciar la bodega?', 'El espacio debe estar despejado al llegar. Si prefieres, contrata el servicio de retiro y orden: sacamos todo y lo volvemos a ordenar en las repisas nuevas.'],
      ['¿Pueden llevarse lo que ya no uso?', 'Sí, con el servicio de retiro de basura nos llevamos muebles, cajas y escombros.'],
    ],
  },
  {
    grupo: 'Pago',
    preguntas: [
      ['¿Cómo pago?', `Puedes abonar un 50% antes de la instalación o pagar el total al terminar. Aceptamos transferencia y tarjetas a través de Mercado Pago. Por transferencia tienes ${OFERTA.descuento}% de descuento.`],
      ['¿Tengo que pagar para agendar?', 'No. Agendas la instalación sin pagar y el pago se coordina al terminar el trabajo.'],
    ],
  },
  {
    grupo: 'Las repisas',
    preguntas: [
      ['¿De qué material son?', 'Estructura de madera de pino y niveles de terciado, fabricados a la medida de tu espacio.'],
      ['¿Qué garantía tienen?', 'Garantía de 5 años sobre la estructura y la instalación.'],
      ['¿Puedo elegir la altura y la cantidad de niveles?', 'Sí. Eliges el alto de la estructura y cuántos niveles lleva; también puedes sumar un nivel antiinundación a pocos centímetros del suelo.'],
      ['¿Puedo poner una barra para colgar ropa?', 'Sí, en cualquier módulo. Esos tramos quedan sin niveles al medio para que la ropa cuelgue.'],
      ['¿Hacen repisas de doble profundidad?', 'Sí: ponemos una repisa delante de otra para guardar más en un muro largo.'],
      ['¿Tienen soporte para bicicletas o esquís?', 'Sí, lo agregas como servicio adicional y lo anclamos al muro.'],
      ['¿También hacen proyectos para empresas?', 'Sí: bodegas de empresas, oficinas, locales y contenedores. Envíanos fotos o agenda una visita.'],
    ],
  },
]
