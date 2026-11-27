# Excel "DON MAXI SPA 2025.xlsx"

Copia local en `datos-privados/DON MAXI SPA 2025.xlsx`, una carpeta que git ignora porque el repositorio es público. El original está en `Descargas`. Este documento describe solo la estructura y no incluye montos.

## Hojas

| Hoja | Qué contiene |
|---|---|
| `VENTAS 2026` | Hoja de ventas actual (A:AC). Es la que lee "Importar Excel" en Instalaciones. |
| `VENTAS <MES>` (ene–nov) | Ventas de cada mes de 2025. Desde agosto tienen más columnas. |
| `<MES> 2025` (ene–dic) | **Movimientos de la cuenta bancaria** (una sola cuenta). |
| `ANUAL` | Margen de cada mes (C = mes, D = valor que trae de N3 de cada hoja mensual). |

## Hojas bancarias `<MES> 2025`

- `B1`: saldo inicial del mes.
- Fila 2: encabezados. Desde la fila 3 vienen los movimientos:
  - A `FECHA`: casi nunca está completa (solo enero y marzo la tienen en todas las filas).
  - B `MOVIMIENTO`: la categoría.
  - C `TIPO`: `ABONO` o `CARGO`.
  - D `MONTO`.
  - E `SALDO`: fórmula acumulada que parte de B1.
  - F `DESCRIPCIÓN`: nota libre.
- Resumen a la derecha:
  - H: lista de categorías.
  - I `MONTO BRUTO`: SUMIFS de abonos menos cargos por categoría, o al revés en los gastos.
  - J `MONTO NETO`: I/1.19. En las categorías sin IVA se pone el monto bruto directamente.
  - L3 `INGRESOS` = suma de J de VENTA BOLETA, VENTA FACTURA y VENTA WEBPAY.
  - M3 `GASTOS` = suma de J del resto.
  - N3 `MARGEN` = L3 − M3.
- Por eso el margen es "neto de IVA" solo de forma aproximada: todo se divide por 1.19, tenga o no IVA, salvo las categorías que se pusieron a mano.

## Categorías usadas en 2025

- Ingresos: VENTA BOLETA, VENTA FACTURA, VENTA WEBPAY.
- Materiales y compras: SODIMAC, IMPERIAL, MERCADO LIBRE, OTRO FACTURADO, OTRO NO FACTURADO.
- Vehículo: BENCINA KARRY, MES KARRY, MES TAG.
- Fijos: MES BODEGA, MES CELULAR, PUBLICIDAD.
- Personas: SEMANA FELIPE, AYUDAS EXTRA, CONTADOR / IMPOSICIONES, RETIROS MAXI.
- Impuestos: PAGO IVA MES PASADO.
- Financieros: PRÉSTAMOS, CRÉDITOS, que pueden ser abono o cargo.
- Ajuste: MOVIMIENTOS MES PASADO.

## Lo que falta en estos libros

- Las comisiones de Mercado Pago y Webpay: hoy se anota lo que llega neto, como si fuera la venta.
- Los descuentos aplicados en cada trabajo.
- El costo exacto de los sueldos: líquido, imposiciones (AFP, salud, seguro de cesantía) y aportes del empleador.
- La fecha de cada movimiento.
- La separación entre lo que tiene IVA y lo que no.
