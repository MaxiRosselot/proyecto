// RepisasPro: la marca para empresas y pymes. Mismo taller, identidad propia y separada de la
// marca para personas (no menciona a Don Maxi). Se ve en /pyme mientras no tenga su dominio.
// El nombre, los datos de contacto y los textos se cambian aca, en un solo lugar.
import { WHATSAPP } from '../../netlify/functions/lib/marca.mjs'

export const PYME = {
  nombre: 'RepisasPro',
  bajada: 'Estanterías de madera para empresas',
  instagram: '',            // p. ej. 'repisaspro' cuando exista la cuenta
  correo: '',               // p. ej. 'contacto@repisaspro.cl' cuando exista; vacio no se muestra
  whatsapp: WHATSAPP,
  // El mensaje de WhatsApp parte asi, para saber que viene de la marca empresa.
  saludo: 'Hola, les escribo desde la web de RepisasPro.',
}

export const CIFRAS_PYME = [
  { valor: '+580', texto: 'proyectos instalados en 2025' },
  { valor: '5 años', texto: 'de garantía en estructura e instalación' },
  { valor: '24 h', texto: 'hábiles para tu propuesta formal' },
  { valor: 'Factura', texto: 'electrónica y orden de compra' },
]

export const SEGMENTOS = [
  { icono: '🏢', titulo: 'Inmobiliarias y constructoras', texto: 'Equipamos las bodegas de un edificio completo, por etapas y con un solo diseño. Un valor agregado para vender o arrendar.', foto: '/web/fotos/dm-094-m.jpg' },
  { icono: '📦', titulo: 'Bodegas y centros de distribución', texto: 'Estanterías largas y de varios niveles, a la medida exacta del galpón, para ordenar stock y despachar más rápido.', foto: '/web/fotos/dm-090-m.jpg' },
  { icono: '🛍️', titulo: 'Retail y trastiendas', texto: 'Aprovechamos cada centímetro de la trastienda para que el inventario esté a mano y el local, despejado.', foto: '/web/fotos/dm-006-m.jpg' },
  { icono: '🚚', titulo: 'Contenedores y módulos', texto: 'Repisas a medida para contenedores marítimos y bodegas modulares: firmes, ancladas y aprovechando el alto.', foto: '/web/fotos/dm-076-m.jpg' },
  { icono: '🏘️', titulo: 'Administraciones y comunidades', texto: 'Bodegas comunes, salas de basura y espacios del condominio ordenados con un proyecto único.', foto: '/web/fotos/dm-022-m.jpg' },
  { icono: '🍽️', titulo: 'Restaurantes, oficinas y talleres', texto: 'Bodegas secas, archivos y talleres con niveles a la altura que tu operación necesita.', foto: '/web/fotos/dm-095-m.jpg' },
]

export const VENTAJAS_PYME = [
  { titulo: 'Fabricación propia', texto: 'Taller, vehículos y equipo propios en Santiago: sin intermediarios y con capacidad para proyectos grandes.' },
  { titulo: 'Diseño en 3D antes de fabricar', texto: 'Recibes la propuesta con el modelo de tu espacio, para aprobarla con tu equipo antes de empezar.' },
  { titulo: 'A la medida exacta', texto: 'Cada estructura se fabrica para tu espacio: largo, alto, profundidad y niveles según lo que guardas.' },
  { titulo: 'Instalación sin detener tu operación', texto: 'Coordinamos el horario y las etapas contigo. Llegamos con todo cortado y lo dejamos listo.' },
  { titulo: 'Factura y orden de compra', texto: 'Propuesta formal, factura electrónica y un contacto directo para todo el proyecto.' },
  { titulo: 'Precio por volumen', texto: 'Mientras más metros, mejor precio por metro. Ideal para varias sucursales o un edificio completo.' },
]

export const PASOS_PYME = [
  { titulo: 'Cuéntanos tu proyecto', texto: 'Por el formulario o WhatsApp: el espacio, qué necesitas guardar y para cuándo.' },
  { titulo: 'Visita técnica sin costo', texto: 'Medimos el lugar y revisamos contigo el uso, la carga y los accesos.' },
  { titulo: 'Propuesta formal con 3D', texto: 'Precio, plazo y el modelo 3D del espacio, en 24 horas hábiles después de la visita.' },
  { titulo: 'Fabricación e instalación', texto: 'Fabricamos en nuestro taller e instalamos en la fecha acordada.' },
  { titulo: 'Postventa', texto: 'Garantía de 5 años y ampliaciones con el mismo diseño cuando crezcas.' },
]

export const TIPOS_ESPACIO = ['Bodega o centro de distribución', 'Bodegas de un edificio', 'Trastienda o local', 'Contenedor o módulo', 'Bodega común de condominio', 'Restaurante o cocina', 'Oficina o archivo', 'Taller', 'Otro']
export const TAMANOS = ['Menos de 10 metros lineales', '10 a 30 metros lineales', '30 a 100 metros lineales', 'Más de 100 metros lineales', 'No sé todavía']
export const PLAZOS = ['Lo antes posible', 'Este mes', 'En 1 a 3 meses', 'Solo estoy cotizando']

export const PREGUNTAS_PYME = [
  ['¿Emiten factura?', 'Sí. Emitimos factura electrónica a nombre de tu empresa y trabajamos con orden de compra.'],
  ['¿Hacen visita técnica?', 'Sí, sin costo en Santiago. Medimos, revisamos el uso y te enviamos la propuesta formal con el modelo 3D.'],
  ['¿Cuánto peso resiste cada nivel?', 'Depende del largo, la profundidad y la separación entre apoyos. Lo diseñamos según lo que vas a guardar y te lo indicamos en la propuesta.'],
  ['¿Pueden instalar fuera del horario de atención?', 'Coordinamos contigo el horario y, si hace falta, instalamos por etapas para no detener tu operación.'],
  ['¿Trabajan fuera de Santiago?', 'Sí. Para regiones cotizamos el despacho aparte y coordinamos la instalación.'],
  ['¿Qué pasa si después necesitamos ampliar?', 'Guardamos el diseño de tu proyecto, así las ampliaciones calzan con lo que ya tienes.'],
]
