import { LATERAL_EXTRA_NETO, lateralesExtraDe, precioRepisa } from './preciosRepisas.js'

// Las filas de la tabla a partir de los modulos del 3D. Una repisa que sigue igual (mismas medidas
// y niveles) mantiene el precio que tenia, aunque se haya editado a mano o la tabla haya cambiado:
// el 3D manda sus modulos cada vez que se abre una cotizacion, y eso no debe cambiar los precios.
// Si solo cambio la cantidad de laterales extra de la esquina, se suma o resta su valor.
export function filasDeModulos(modulos, anteriores, tabla) {
  const libres = [...anteriores]
  const igual = (r, m, medidas) => r.l === medidas.largoM && r.p === medidas.profM && r.a === medidas.altoM && r.n === m.levels && (r.modelId ?? undefined) === (m.modelId ?? undefined)
  return modulos.map((m, i) => {
    const metros = cm => Number((cm / 100).toFixed(6))
    const medidas = { largoM: metros(m.lengthCm), profM: metros(m.depthCm), altoM: metros(m.heightCm) }
    const extra = lateralesExtraDe(m)
    // Primero el mismo modulo (racks con su id); si no, una repisa guardada con las mismas medidas.
    let k = libres.findIndex(r => r.sourceModuleId && r.sourceModuleId === m.sourceModuleId)
    if (k < 0 && m.kind !== 'rack') k = libres.findIndex(r => (r.kind || 'shelf') === 'shelf' && igual(r, m, medidas))
    const previo = k >= 0 ? libres.splice(k, 1)[0] : null
    const mismo = previo && igual(previo, m, medidas) && Number(previo.v) > 0
    const lista = precioRepisa(medidas, tabla)
    return {
      id: m.sourceModuleId || `modulo-${i}`, sourceModuleId: m.sourceModuleId,
      kind: m.kind || 'shelf', modelId: m.modelId, label: m.label,
      l: medidas.largoM, p: medidas.profM, a: medidas.altoM, n: m.levels, u: m.units,
      v: mismo ? previo.v + (extra - lateralesExtraDe(previo)) * LATERAL_EXTRA_NETO : m.kind === 'rack' ? 0 : lista === null ? 0 : lista + extra * LATERAL_EXTRA_NETO,
      ...(extra ? { lateralesExtra: extra } : {}),
    }
  })
}

export const productoCotizacion = r => ({ largo: r.l, prof: r.p, alto: r.a, niveles: r.n, unidades: r.u, valor: r.v, kind: r.kind, modelId: r.modelId, label: r.label, sourceModuleId: r.sourceModuleId, ...(r.colgador ? { colgador: true } : {}), ...(r.lateralesExtra ? { lateralesExtra: r.lateralesExtra } : {}) })

// Inversa de productoCotizacion: una fila guardada vuelve a la tabla del cotizador al reabrir
// la cotizacion. Las mas antiguas guardaban l/p/a/n/u/v en vez de los nombres largos.
export const filaDesdeProducto = (g, i) => ({
  id: g.sourceModuleId || `guardada-${i}`, sourceModuleId: g.sourceModuleId,
  kind: g.kind || 'shelf', modelId: g.modelId, label: g.label,
  l: g.largo ?? g.l, p: g.prof ?? g.p, a: g.alto ?? g.a, n: g.niveles ?? g.n, u: g.unidades ?? g.u, v: g.valor ?? g.v,
  // Las cotizaciones web marcan las repisas con colgador; se conserva para que el PDF lo siga diciendo.
  ...(g.colgador ? { colgador: true } : {}),
  ...(g.lateralesExtra ? { lateralesExtra: g.lateralesExtra } : {}),
})
