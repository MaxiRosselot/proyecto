---
name: emitir-boletas
description: Emitir las boletas pendientes (B*) de Repisas Don Maxi en el portal gratis e-Boleta del SII y registrarlas en el panel (sección DTE). Usar cuando Maxi pida "emite las boletas", "emite las de noviembre", "boletas pendientes", etc.
---

# Emitir boletas por e-Boleta SII

Se usa el navegador integrado con dos pestañas: el panel (https://repisasdonmaxi.cl/admin) y el
portal https://eboleta.sii.cl/emitir/. Los scripts están en `scripts/eboleta/`.

## Reglas
- **Maxi inicia sesión** en el panel y en el SII. Nunca escribir su clave.
- **Empresa correcta:** Maxi tiene otras empresas en el SII (Ultraligero). Antes de la prueba leer
  la barra superior del portal y confirmar `77.386.684-8 DON MAXI SPA`; si muestra otra, pedirle que
  la cambie (flecha junto al nombre). El script también lo revisa antes de cada boleta y se detiene
  si el PDF no sale con el RUT 77386684.
- El SII cierra la sesión a los pocos minutos: si `main` no existe o la URL es `clave.w.sii.cl`,
  pedirle que vuelva a entrar (y revisar de nuevo la empresa).
- **Confirmar antes de emitir:** mostrar la lista (N°, cliente, monto) y el total, y esperar su
  "sí". Cada boleta emitida es un documento real (se corrige con nota de crédito).
- Detalle: `Repisas de madera para bodega - Nombre` (máx. 80). Método: Transferencia Electrónica.
  Corregir nombres con errores de tipeo evidentes (preguntar si hay duda) también en el panel.
- Correo: si la venta tiene correo, se manda desde la pantalla de la boleta emitida (el receptor
  del formulario exige RUT, por eso va sin receptor).
- **No van por aquí:** facturas (F*) — necesitan RUT y razón social, van por el sistema de
  facturas del SII — ni las M/B* (parte por Mercado Pago): revisarlas con Maxi.
- La boleta sale con la fecha de hoy (el portal no deja elegirla).

## Pasos (pocas llamadas)
1. Pestaña del panel: pegar `scripts/eboleta/panel.js` y correr
   `JSON.stringify(await window.__dte.pendientes('AAAA-MM'))`. Mostrar a Maxi la lista y el total.
2. Abrir el portal con `preview_start { url: 'https://eboleta.sii.cl/' }`; Maxi inicia sesión.
3. Pestaña del portal: pegar `scripts/eboleta/eboleta-sii.js`. Prueba en seco con la primera
   (`{ dry: true }`) y revisar que `ok` sea true.
4. Con el "sí" de Maxi: `window.__emitirLote(<boletas del paso 1>); 'lanzado'`. Revisar
   `window.__log.join(' | ')` esperando ~40 s por llamada hasta `FIN`. Si se detiene en un error,
   ver la pantalla antes de reintentar (una venta con `ok` nunca se vuelve a emitir en esa pestaña).
5. Copiar `JSON.stringify(window.__res)` y en la pestaña del panel correr
   `await window.__dte.registrar(<ese JSON>)`. Quedan en B con folio, PDF y correo en DTE.
6. Revisar que los folios sean correlativos y que la suma calce con el total del paso 1.
   Anotar en Pendientes (p29) con `accion: 'nota'`.

## Datos del portal (por si cambia)
- Teclado de monto → EMITIR → (montos altos: alerta "Está a punto de emitir una boleta por $X" → SÍ)
  → formulario: sucursal, "Boleta afecta", método de pago, switches Receptor y Detalle, EMITIR.
- Al activar Detalle el campo trae "Monto Total"; apagar Receptor lo reinicia (por eso va antes).
- El resultado trae `DESCARGAR` con link S3 `boleta39_folio<N>_<fecha>.pdf` que vence en 2036, y
  campos para enviar por correo o WhatsApp.
