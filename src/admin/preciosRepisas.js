// Tabla de precios de repisas.
//
// Fuente: repisas-tabla-precios.xlsx entregada por el cliente (Felipe), hoja "Tabla de precios".
// Costos base, margen de 130% y redondeo a $10.000 estan en la hoja "Supuestos" de ese archivo.
//
// alto  : alto total de la repisa en cm (200 -> 4 niveles, 250 -> 5, 300 -> 6).
// prof  : fondo UTIL en cm, o sea el ancho del terciado. La profundidad total que usa el
//         configurador 3D y esta pantalla es este valor + 8 cm (un pilar 2x2 de 4 cm por lado):
//         28 -> 20, 38 -> 30, 48 -> 40, 68 -> 60.
// desde / hasta : rango de largo en cm, inclusivo por ambos extremos.
// precio: valor neto en CLP de UNA repisa de ese rango.
//
// Esta copia es solo el respaldo: la tabla viva la sirve /.netlify/functions/get-precios desde
// la planilla del cliente. Si esa llamada falla, la cotizacion sigue funcionando con estos
// valores (recalculados el 26-11-2026 con los COSTOS de abajo) en vez de quedarse sin precios.
export const TABLA_PRECIOS = [
  { alto: 200, prof: 20, desde: 50, hasta: 92, precio: 40000 },
  { alto: 200, prof: 20, desde: 93, hasta: 121, precio: 50000 },
  { alto: 200, prof: 20, desde: 122, hasta: 138, precio: 60000 },
  { alto: 200, prof: 20, desde: 139, hasta: 193, precio: 70000 },
  { alto: 200, prof: 20, desde: 194, hasta: 243, precio: 80000 },
  { alto: 200, prof: 30, desde: 50, hasta: 54, precio: 40000 },
  { alto: 200, prof: 30, desde: 55, hasta: 106, precio: 50000 },
  { alto: 200, prof: 30, desde: 107, hasta: 121, precio: 60000 },
  { alto: 200, prof: 30, desde: 122, hasta: 133, precio: 70000 },
  { alto: 200, prof: 30, desde: 134, hasta: 185, precio: 80000 },
  { alto: 200, prof: 30, desde: 186, hasta: 193, precio: 90000 },
  { alto: 200, prof: 30, desde: 194, hasta: 243, precio: 100000 },
  { alto: 200, prof: 40, desde: 50, hasta: 74, precio: 50000 },
  { alto: 200, prof: 40, desde: 75, hasta: 113, precio: 60000 },
  { alto: 200, prof: 40, desde: 114, hasta: 121, precio: 70000 },
  { alto: 200, prof: 40, desde: 122, hasta: 130, precio: 80000 },
  { alto: 200, prof: 40, desde: 131, hasta: 169, precio: 90000 },
  { alto: 200, prof: 40, desde: 170, hasta: 193, precio: 100000 },
  { alto: 200, prof: 40, desde: 194, hasta: 243, precio: 110000 },
  { alto: 200, prof: 60, desde: 50, hasta: 68, precio: 60000 },
  { alto: 200, prof: 60, desde: 69, hasta: 94, precio: 70000 },
  { alto: 200, prof: 60, desde: 95, hasta: 119, precio: 80000 },
  { alto: 200, prof: 60, desde: 120, hasta: 121, precio: 90000 },
  { alto: 200, prof: 60, desde: 122, hasta: 128, precio: 100000 },
  { alto: 200, prof: 60, desde: 129, hasta: 153, precio: 110000 },
  { alto: 200, prof: 60, desde: 154, hasta: 179, precio: 120000 },
  { alto: 200, prof: 60, desde: 180, hasta: 193, precio: 130000 },
  { alto: 200, prof: 60, desde: 194, hasta: 243, precio: 150000 },
  { alto: 250, prof: 20, desde: 50, hasta: 105, precio: 50000 },
  { alto: 250, prof: 20, desde: 106, hasta: 121, precio: 60000 },
  { alto: 250, prof: 20, desde: 122, hasta: 127, precio: 70000 },
  { alto: 250, prof: 20, desde: 128, hasta: 189, precio: 80000 },
  { alto: 250, prof: 20, desde: 190, hasta: 243, precio: 90000 },
  { alto: 250, prof: 30, desde: 50, hasta: 62, precio: 50000 },
  { alto: 250, prof: 30, desde: 63, hasta: 104, precio: 60000 },
  { alto: 250, prof: 30, desde: 105, hasta: 121, precio: 70000 },
  { alto: 250, prof: 30, desde: 122, hasta: 156, precio: 90000 },
  { alto: 250, prof: 30, desde: 157, hasta: 193, precio: 100000 },
  { alto: 250, prof: 30, desde: 194, hasta: 243, precio: 120000 },
  { alto: 250, prof: 40, desde: 50, hasta: 72, precio: 60000 },
  { alto: 250, prof: 40, desde: 73, hasta: 103, precio: 70000 },
  { alto: 250, prof: 40, desde: 104, hasta: 121, precio: 80000 },
  { alto: 250, prof: 40, desde: 122, hasta: 140, precio: 100000 },
  { alto: 250, prof: 40, desde: 141, hasta: 171, precio: 110000 },
  { alto: 250, prof: 40, desde: 172, hasta: 193, precio: 120000 },
  { alto: 250, prof: 40, desde: 194, hasta: 243, precio: 140000 },
  { alto: 250, prof: 60, desde: 50, hasta: 62, precio: 70000 },
  { alto: 250, prof: 60, desde: 63, hasta: 82, precio: 80000 },
  { alto: 250, prof: 60, desde: 83, hasta: 103, precio: 90000 },
  { alto: 250, prof: 60, desde: 104, hasta: 121, precio: 100000 },
  { alto: 250, prof: 60, desde: 122, hasta: 124, precio: 120000 },
  { alto: 250, prof: 60, desde: 125, hasta: 144, precio: 130000 },
  { alto: 250, prof: 60, desde: 145, hasta: 165, precio: 140000 },
  { alto: 250, prof: 60, desde: 166, hasta: 186, precio: 150000 },
  { alto: 250, prof: 60, desde: 187, hasta: 193, precio: 160000 },
  { alto: 250, prof: 60, desde: 194, hasta: 243, precio: 180000 },
  { alto: 300, prof: 20, desde: 50, hasta: 62, precio: 50000 },
  { alto: 300, prof: 20, desde: 63, hasta: 113, precio: 60000 },
  { alto: 300, prof: 20, desde: 114, hasta: 121, precio: 70000 },
  { alto: 300, prof: 20, desde: 122, hasta: 170, precio: 90000 },
  { alto: 300, prof: 20, desde: 171, hasta: 193, precio: 100000 },
  { alto: 300, prof: 20, desde: 194, hasta: 243, precio: 110000 },
  { alto: 300, prof: 30, desde: 50, hasta: 68, precio: 60000 },
  { alto: 300, prof: 30, desde: 69, hasta: 103, precio: 70000 },
  { alto: 300, prof: 30, desde: 104, hasta: 121, precio: 80000 },
  { alto: 300, prof: 30, desde: 122, hasta: 137, precio: 100000 },
  { alto: 300, prof: 30, desde: 138, hasta: 172, precio: 110000 },
  { alto: 300, prof: 30, desde: 173, hasta: 193, precio: 120000 },
  { alto: 300, prof: 30, desde: 194, hasta: 243, precio: 140000 },
  { alto: 300, prof: 40, desde: 50, hasta: 71, precio: 70000 },
  { alto: 300, prof: 40, desde: 72, hasta: 97, precio: 80000 },
  { alto: 300, prof: 40, desde: 98, hasta: 121, precio: 90000 },
  { alto: 300, prof: 40, desde: 122, hasta: 146, precio: 120000 },
  { alto: 300, prof: 40, desde: 147, hasta: 172, precio: 130000 },
  { alto: 300, prof: 40, desde: 173, hasta: 193, precio: 140000 },
  { alto: 300, prof: 40, desde: 194, hasta: 243, precio: 160000 },
  { alto: 300, prof: 60, desde: 50, hasta: 57, precio: 80000 },
  { alto: 300, prof: 60, desde: 58, hasta: 75, precio: 90000 },
  { alto: 300, prof: 60, desde: 76, hasta: 92, precio: 100000 },
  { alto: 300, prof: 60, desde: 93, hasta: 109, precio: 110000 },
  { alto: 300, prof: 60, desde: 110, hasta: 121, precio: 120000 },
  { alto: 300, prof: 60, desde: 122, hasta: 138, precio: 150000 },
  { alto: 300, prof: 60, desde: 139, hasta: 156, precio: 160000 },
  { alto: 300, prof: 60, desde: 157, hasta: 173, precio: 170000 },
  { alto: 300, prof: 60, desde: 174, hasta: 190, precio: 180000 },
  { alto: 300, prof: 60, desde: 191, hasta: 193, precio: 190000 },
  { alto: 300, prof: 60, desde: 194, hasta: 243, precio: 220000 },
]

// Un pilar 2x2 de 4 cm a cada lado: la profundidad total de la repisa trae 8 cm mas que el
// terciado. Mismo criterio que usefulBoardDepthCm() en el configurador 3D.
const PILAR_CM = 4

// Precio neto de UNA repisa, o null si esa combinacion no esta en la tabla.
// Medidas en metros, como las guarda la cotizacion.
// Lateral que se agrega en la esquina de una L (el configurador 3D lo pone solo cuando, al pegar
// el lateral del medio a la otra repisa, quedan mas de 120 cm hasta el siguiente). Neto, por lateral.
export const LATERAL_EXTRA_NETO = 10000
export const MAX_LATERALES_EXTRA = 4
export const lateralesExtraDe = r => Math.min(MAX_LATERALES_EXTRA, Math.max(0, Math.round(Number(r?.lateralesExtra) || 0)))

// Precio por material, con los supuestos de la hoja "Supuestos" de repisas-tabla-precios.xlsx
// (reproduce exacto las filas de la tabla). Sirve para cualquier alto y cantidad de niveles
// (repisas cada 30/40/60 o a medida en el 3D):
//   · laterales: 2 si el largo es hasta 121 cm, 3 si es mas;
//   · cada lateral: 2 postes del alto + un travesano del fondo util por nivel, en palo 2x2;
//   · cada nivel: una tira de terciado del fondo util (las que salen de una plancha de 122);
//     si sobran 50 cm o mas se cobra proporcional al largo, si no la tira completa;
//   · fijaciones: 2 tirafondos + 2 tornillos por nivel y lateral; mano de obra por lateral;
//   · precio = costo × (1 + margen), redondeado hacia arriba a $10.000.
// Costos netos actualizados el 26-11-2026 (Maxi): palo $2.344, plancha $19.530, mano de obra
// $1.725 por lateral (con la boleta de honorarios incluida) y margen 140%.
export const COSTOS = {
  paloPorCm: 2344 / 320,          // palo 2x2 de 320 cm a $2.344
  plancha: 19530, planchaAnchoCm: 122, planchaLargoCm: 243,
  tirafondo: 69.9, tornillo: 6.78, manoDeObraLateral: 1725,
  margen: 1.4, redondeo: 10000, remanenteMinCm: 50,
}
export function costoRepisa({ largoCm, fondoUtilCm, altoCm, niveles }, k = COSTOS) {
  if (!(largoCm >= 50 && largoCm <= k.planchaLargoCm) || !(fondoUtilCm > 0 && fondoUtilCm <= k.planchaAnchoCm) || !(altoCm > 0) || !(niveles >= 1)) return null
  const laterales = largoCm <= 121 ? 2 : 3
  const palos = laterales * (2 * altoCm + niveles * fondoUtilCm) * k.paloPorCm
  const tira = k.plancha / Math.floor(k.planchaAnchoCm / fondoUtilCm)
  const terciado = niveles * tira * (k.planchaLargoCm - largoCm >= k.remanenteMinCm ? largoCm / k.planchaLargoCm : 1)
  const fijaciones = niveles * laterales * (2 * k.tirafondo + 2 * k.tornillo)
  return palos + terciado + fijaciones + laterales * k.manoDeObraLateral
}
export function precioPorMaterial({ largoM, profM, altoM, niveles }, k = COSTOS) {
  const costo = costoRepisa({ largoCm: Math.round(largoM * 100), fondoUtilCm: Math.round(profM * 100) - PILAR_CM * 2, altoCm: Math.round(altoM * 100), niveles: Math.round(Number(niveles)) }, k)
  return costo === null ? null : Math.ceil(costo * (1 + k.margen) / k.redondeo - 1e-9) * k.redondeo
}

// Precio de UNA repisa: el de la tabla si esas medidas estan (la tabla manda: puede tener precios
// editados a mano); si no, por material con sus niveles. null si ni asi se puede (largo fuera de
// 50–243 cm, o sin niveles).
export function precioRepisa({ largoM, profM, altoM, niveles }, tabla = TABLA_PRECIOS) {
  const fila = filaPrecioRepisa({ largoM, profM, altoM }, tabla)
  if (fila) return fila.precio
  return niveles ? precioPorMaterial({ largoM, profM, altoM, niveles }) : null
}

export function filaPrecioRepisa({ largoM, profM, altoM }, tabla = TABLA_PRECIOS) {
  const largo = Math.round(largoM * 100)
  const prof = Math.round(profM * 100) - PILAR_CM * 2
  const alto = Math.round(altoM * 100)
  const fila = tabla.find(f =>
    f.alto === alto && f.prof === prof && largo >= f.desde && largo <= f.hasta)
  return fila || null
}

// Trae la tabla viva desde la planilla del cliente. Si algo falla devuelve el respaldo, para
// que no se pueda quedar sin cotizar por un problema de red o de permisos en Google.
// Devuelve { tabla, respaldo }: respaldo en true avisa que la planilla no respondio y se esta
// cotizando con la copia del bundle. Que eso sea visible importa: si no, los precios quedan
// congelados en la foto del ultimo despliegue y nadie se entera.
export async function cargarTablaPrecios(apiFetch) {
  try {
    const res = await apiFetch('/.netlify/functions/get-precios')
    if (res?.ok && res.tabla?.length) return { tabla: res.tabla, respaldo: false }
    console.warn('get-precios sin datos, se usa el respaldo:', res?.error)
  } catch (e) {
    console.warn('get-precios fallo, se usa el respaldo:', e.message)
  }
  return { tabla: TABLA_PRECIOS, respaldo: true }
}
