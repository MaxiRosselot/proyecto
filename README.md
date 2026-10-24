# Agendador — Repisas Don Maxi

Agenda visitas en los días y horarios que se habilitan desde el panel (**Admin → Horarios**), con inicios cada **30 min**.  
La visita dura **15 min**. Se verifica disponibilidad real con Google Calendar.

## Requisitos
- Node 18+
- Cuenta Netlify
- Credenciales Google Calendar (OAuth2 con refresh token)

## Configuración
1. `npm i`
2. Configura variables de entorno en Netlify:
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - GOOGLE_REFRESH_TOKEN
   - CALENDAR_ID
   - DEFAULT_EVENT_DURATION_MIN=15
   - NOTIFY_EMAIL=repisas@donmaxi.cl
   - GOOGLE_SHEET_ID: la planilla principal, con las pestañas `Cotizaciones`, `Visitas`, `Horarios` y `precios`
     (la tabla de precios: columnas Alto, Profundidad, Largo desde, Largo hasta y Precio, en cualquier orden).
     `PRECIOS_SHEET_ID` ya no se usa.
   - ADMIN_PASSWORD: contraseña del panel `/admin`, **mínimo 12 caracteres**. Sin ella nadie entra.
   - ADMIN_SESSION_SECRET: texto aleatorio de **32 caracteres o más** para firmar las sesiones
     (por ejemplo `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
     Cambiar esta variable o la contraseña cierra todas las sesiones abiertas.
   - VITE_REPISAS_3D_URL: dirección del configurador 3D (Vercel).
   - MP_ACCESS_TOKEN: Access Token **de producción** de Mercado Pago (ver "Pago en línea"). Sin él se sigue usando el link fijo.
   - MP_WEBHOOK_SECRET (recomendada): la "clave secreta" de las notificaciones (webhooks) de Mercado Pago.
   - SITE_URL (opcional): dirección pública del sitio para los links de pago. Si falta, se usa la que da Netlify.
   - VITE_GOOGLE_MAPS_KEY (opcional): clave de Google Maps para autocompletar y validar la dirección en `/visita`
     (APIs "Maps JavaScript API" y "Places API (New)", restringida a los dominios del sitio). Sin ella, la dirección
     se escribe a mano con la comuna de una lista.
   - GOOGLE_MAPS_SERVER_KEY (opcional): otra clave, solo con "Geocoding API", para ubicar en el mapa las visitas
     escritas a mano al armar la ruta del día. Sin ella, esas visitas se ordenan por comuna.
3. Sube `logo.png` y `og-cover.png` a `/public`.

## Cotizador para clientes (/cotiza)

- El cliente ingresa las medidas de su bodega (A, B/E, C, D y alto) y elige:
  - dónde van las repisas: solo fondo, fondo + izquierda, fondo + derecha o fondo + ambos lados;
  - la profundidad y el alto;
  - colgador sí/no en cada módulo.
- Ve el precio con IVA de cada módulo y el total. Funciona en celular.
- El 3D es el configurador de Repisas 3D en modo cliente (`/embed?mode=cliente`, rama `feat/manual-build-mode` del otro repo), incrustado con `VITE_REPISAS_3D_URL`.
- `cotizacion-web` (pública):
  - con `GET` entrega la tabla de precios;
  - con `POST` recalcula los precios con la planilla (no confía en el navegador), asigna el número, arma el PDF, lo sube a Drive y lo guarda en Cotizaciones como "por confirmar", con nota "Cotización web" y su modelo 3D;
  - envía el PDF al cliente y una copia a `NOTIFY_EMAIL` (o repisas@donmaxi.cl).
- Protección: campo trampa para robots y máximo 3 cotizaciones por correo cada 2 horas.
- Si falla el correo, la cotización queda guardada igual.
- Lógica y pruebas: `netlify/functions/lib/cotizacion-web.mjs`. Prueba E2E local: `node scripts/local-dev/verify-cotiza.mjs`.
  En local los correos quedan como `.eml` en `scripts/local-dev/correos/`.

## Agendar la instalación

- En **Admin → Cotizaciones**, cada cotización tiene **Agendar instalación** (reemplaza a "Confirmada": agendar es confirmar).
- El panel permite sumar **servicios adicionales con precio editable**, para cuando el cliente los pide después de recibir la cotización. El total se recalcula con IVA.
- La instalación puede ser **cualquier día**, con hora de inicio y de término.
- Crea el evento **"Instalación - Nombre"** en el calendario `CALENDAR_ID` (repisas@donmaxi.cl), con dirección y detalle, e **invita al cliente** si hay correo.
- Sin correo, se agenda igual y después se usa **Invitar por correo**.
- La cotización queda **confirmada**, con los adicionales y el total al día, y la instalación en la columna **R** de `Cotizaciones`.
- **Reagendar** mueve el mismo evento.
- **Avisar por WhatsApp** abre el chat del cliente con el mensaje listo: día, hora, duración y el aviso de hasta 1 hora de retraso.
- Lógica y pruebas: `netlify/functions/lib/instalaciones.mjs`. Prueba E2E local: `node scripts/local-dev/verify-instalacion.mjs`.

## Calendario, pagos y recordatorios

- **Admin → Calendario** muestra el calendario del negocio en tres vistas: **semana**, **mes** y **agenda** (la de celular). Incluye instalaciones, visitas y el resto de los eventos. Al hacer clic en un evento se abre su detalle: mapa, teléfono, saldo, WhatsApp y la cotización.
- **Recordatorios de mañana** (arriba del calendario): cada uno con su WhatsApp listo.
- Cron diario a las 10:00 (`send-reminders`):
  - manda el recordatorio por correo a cada cliente con instalación o visita al día siguiente;
  - te manda un resumen a `NOTIFY_EMAIL` con los links de WhatsApp y el saldo a cobrar.
- Al agendar se avisa si el horario **se cruza** con otro evento de ese día.
- **Pagos** (columna **S** de `Cotizaciones`):
  - abonos con monto, medio, fecha y nota;
  - atajos "Abono 50%" y "Saldo completo";
  - etiqueta "Abono %" o "Pagada" en la tarjeta.
- **Regenerar PDF**: rehace el PDF con el 3D y el total actual, lo sube a Drive y actualiza el link. Se sugiere solo cuando al agendar cambia el total.
- Lógica y pruebas: `lib/calendario.mjs`, `lib/pagos.mjs`, `lib/recordatorios.mjs`, `lib/mensajes.mjs`. Prueba E2E local: `node scripts/local-dev/verify-calendario.mjs`.

## El cliente agenda y paga (link de la cotización), descuentos y boletas

- Cada cotización tiene **su propio link**: `https://<sitio>/reserva?c=<N°>&t=<firma>`.
  - Va en el PDF ("Agendar y pagar"), en el correo y la pantalla final de /cotiza, en "WhatsApp al cliente" y en **Enviar al cliente → Copiar link**.
  - La firma impide abrir cotizaciones ajenas cambiando el número. Los links antiguos `/pagar?...` llevan a la reserva.
- En `/reserva` el cliente:
  1. **elige el día**: lunes a viernes, bloques de **10:00 a 13:00** y **13:00 a 16:00**, desde mañana y por 4 semanas. Un bloque se ocupa si se cruza con una instalación del calendario o con otra reserva vigente;
  2. **elige cómo paga**: **transferencia, con 10% de descuento**, o Mercado Pago; y si paga el **total** o **abona el 50%**.
  Si ya tiene instalación agendada, solo paga el saldo.
- **Transferencia**:
  - ve los datos de la cuenta y el monto, y aprieta **"Ya hice la transferencia"**;
  - el bloque queda reservado y te llega un correo "💸 Transferencia por verificar";
  - en **Cotizaciones → Transferencias por verificar** confirmas cuando la veas en la cuenta. Eso registra el pago, aplica el 10%, agenda la instalación con invitación de Calendar y le manda al cliente el correo "¡Tu instalación está confirmada!";
  - después, "Avisar por WhatsApp" le manda la confirmación (incluye el pago recibido);
  - si no llegó, "No ha llegado" libera el bloque y el cliente puede reintentar.
- **Mercado Pago**:
  - el bloque queda reservado 30 minutos mientras paga;
  - cuando se aprueba, `mp-webhook` registra el pago, agenda la instalación sola y le confirma por correo;
  - te manda un correo "💰 Pago recibido". Es idempotente: un aviso repetido no duplica el pago.
- Sin `MP_ACCESS_TOKEN`, el link funciona igual, pero solo con transferencia.
- La reserva vive en la columna **T** (`Reserva (JSON)`) de `Cotizaciones`.
- **Descuento**: campo "Descuento (%)" en Cotizar y al agendar la instalación, con el atajo "Transferencia · 10%".
  - Se guarda en `Adicionales (JSON)` como `descuento_pct` y aparece en el PDF, los totales y el dashboard ("Descuentos").
  - Si editas el nombre de un servicio en Cotizar, ese nombre sale en la tabla del PDF (`nombre_<servicio>`).
- **Boletas y facturas** (se emiten a mano en el SII): se llevan con el código de documento de cada venta (B, B\*, F, F\*, M…) en la planilla de **Instalaciones**. Estadísticas avisa los que están por emitir.

**Configurar Mercado Pago (una vez):**
1. En https://www.mercadopago.cl/developers/panel crea una aplicación, del tipo **Checkout Pro** / pagos online.
2. En **Credenciales de producción**, copia el **Access Token** (`APP_USR-...`) y ponlo en Netlify como `MP_ACCESS_TOKEN`. Nunca lo pegues en un chat ni en el código.
3. En la aplicación, en **Webhooks**:
   - URL de producción: `https://<sitio>/.netlify/functions/mp-webhook`;
   - evento: **Pagos**;
   - copia la **clave secreta** a `MP_WEBHOOK_SECRET`.
4. Haz el deploy. Desde ahí, los PDF nuevos llevan el link propio. Los PDF anteriores siguen con el link fijo, que funciona igual pero no registra el pago solo.

Los bloques y semanas se cambian en `AGENDA_INSTALACIONES` (`lib/reservas.mjs`).

Lógica y pruebas: `lib/reservas.mjs`, `lib/reserva-cliente.mjs`, `lib/mercadopago.mjs`, `lib/totales.mjs`. Pruebas E2E locales, con un Mercado Pago simulado: `node scripts/local-dev/verify-reserva.mjs` y `verify-pagos.mjs`.

**Cotizaciones**: cada tarjeta parte con el **siguiente paso**: enviar, verificar la transferencia, agendar o cobrar el saldo. Debajo están **Cliente y montos**, **Documento**, **Enviar al cliente**, **Instalación** y **Pagos**. Cambiar el estado y eliminar quedan en "Más acciones".

## App del panel en el iPhone

El panel se instala como app, sin App Store:
1. Abre `https://<sitio>/admin` en **Safari**.
2. Toca **Compartir → Agregar a inicio**.
3. Queda el ícono "Don Maxi", que abre el panel a pantalla completa.

- Solo `/admin` declara el manifest (`public/admin.webmanifest`) y el ícono. La página pública sigue siendo web normal.
- Los íconos (`public/app/`) se generan desde `public/logo.png` con `node scripts/generar-iconos.mjs`.
- Prueba local: `node scripts/local-dev/verify-app.mjs`.

## Instalaciones: la planilla de ventas (central)

**Admin → Instalaciones** es la planilla de siempre (el Excel de ventas) dentro del panel. Hay una fila por venta, ordenada por fecha, con las mismas columnas:

| Columna | En el panel |
|---|---|
| Nota | Nota interna (pendientes, fabricar con anticipación…). Se escribe en la celda. |
| ✕ | El cliente canceló: la venta pasa a rechazada ("Canceló") y se borra su evento. |
| Cliente | Casilla **Instalada** (la fila se pinta). Al hacer clic en el nombre se abre el detalle. |
| Fecha, inicio, fin | Editables. **El evento del calendario se mueve solo** (o se crea, si no tenía). |
| Doc. | B, B\*, F, F\*, M, M/B, M/B\*, M/F, M/F\*. Los \* son documentos por emitir. Si está vacío, se sugiere según cómo pagó ("B\*?"). Las ventas de 2025 pueden traer W (Webpay). |
| Pagado | Sí / 50% / No. Al tocarlo: "Pagó el 50%" / "Pagó el total" con el medio, o ver los pagos. |
| Repisas, retiro y orden, retiro de basura, cajas, soporte, despacho | Montos netos editables en la celda. Si son varias líneas (dos repisas, 3 cajas), se editan en el detalle. El **despacho** es un extra de la instalación: no está en el catálogo. |
| Neto, bruto | Calculados. Cambiar montos actualiza el total; el PDF ya enviado no se regenera solo. |

- Arriba: período (**Semana / Mes / Todo**), **+ Nueva instalación** (nombre, día y horas; los montos se completan después) e **Importar Excel**.
- Filtros: **Por cobrar** (instaladas con saldo, con 💬 para cobrar por WhatsApp con el detalle), **Documentos por emitir**, **Con notas**, **Por instalar** y **Sin fecha**. Estos cuatro primeros miran todo el historial.
- Abajo van los totales de lo que se ve, como la suma del Excel. En el celular cada fila es una tarjeta.
- La fila vive en la columna R (`Instalación (JSON)`): `instalada`, `nota`, `documento`, el evento y, si vino del Excel, `origen: 'excel'` y su huella.

**Importar el Excel** (Instalaciones → Importar Excel):
- Lee el .xlsx en el navegador (SheetJS, un par de segundos) y muestra antes qué va a pasar: cuántas ventas son nuevas, cuántas ya estaban, cuántas no tienen fecha y el neto.
- **Encuentra las columnas por su nombre** (NOMBRE, FECHA, HORA INICIO, B/F/W, PAGADO, REPISAS, RETIRO, SOPORTE, ESCOMBROS, DESPACHO, RACKS, NETO TOTAL, MONTO BRUTO…), así que da lo mismo si cambian de lugar entre meses. Las hojas sin esas columnas, como las del banco, se ignoran.
- Nombre pintado = instalada. La columna DÍA trae notas (los días de la semana se descartan). "SI" en PAGADO registra el pago completo.
- Las ventas importadas reciben **números bajo el 1421**, así que no cambian la numeración de las cotizaciones nuevas. **Importar de nuevo no duplica**: cada venta guarda su huella del Excel, y a las que ya estaban en el panel se les completa el documento, la nota o la marca de instalada.
- Las próximas instalaciones se **enlazan con su evento del calendario** (el que creaba el script de la planilla), si lo encuentra por nombre y día. No se crean eventos al importar, para no duplicar.
- Lógica y pruebas: `lib/leer-ventas.mjs`, `lib/importar-ventas.mjs`, `lib/planilla.mjs`, `lib/documentos.mjs`. Prueba E2E local con un Excel de ejemplo (`scripts/local-dev/fixtures/ventas-ejemplo.xlsx`): `node scripts/local-dev/verify-planilla.mjs`.

## Estadísticas

- **Admin → Estadísticas**: cuánto entra por mes según la fecha de cada instalación agendada (no cuenta las rechazadas). Las instaladas son las marcadas en la planilla.
  - vendido, cobrado y por cobrar, con el saldo de trabajos ya hechos en rojo;
  - realizado vs agendado, ticket promedio y la variación contra el mes anterior.
- **¿De dónde viene la plata?** tiene dos vistas:
  - **por servicio**: repisas, retiro y orden, retiro de basura, cajas, soportes y despacho;
  - **por tipo de trabajo**: solo repisas, con retiro y orden, o con otros servicios.
- Gráficos de los últimos 6 meses (cada barra abre ese mes) y de las semanas del mes.
- Tabla con filtros: tipo de trabajo y "con saldo".
  - Al hacer clic en una fila se abre la cotización.
  - Se puede descargar en CSV para Excel.
- Arriba avisa los **documentos por emitir** (B\*, F\*…).
- Todo se puede ver **con IVA o neto**. Si un subtotal se editó a mano, la diferencia aparece como "Ajustes de precio" para que todo cuadre.
- Lógica y pruebas: `lib/resumen-instalaciones.mjs`. Prueba E2E local: `node scripts/local-dev/verify-instalaciones.mjs`.

## Horarios de visita y ruta del día

- El cliente, en `/visita`: **dirección** (autocompletada y validada con Google si está `VITE_GOOGLE_MAPS_KEY`)
  → **día** → **rango** de 3 horas (8–11, 11–14, 14–17 o 17–20) → datos. La hora exacta no la elige.
- En **Admin → Horarios** se define:
  - el **horario semanal**, que se repite cada semana (por ejemplo, sábado y domingo de 08:00 a 20:00);
  - las **fechas especiales**: abrir un día, cambiar su horario o cerrarlo;
  - cuántas **semanas** hacia adelante ve el cliente (1 a 12);
  - el **cupo**: cuántas visitas caben en cada rango (por defecto 6). Un rango lleno ya no se ofrece.
- Se ofrecen los rangos que caen al menos 1 hora dentro de lo abierto ese día. Hoy, solo si queda al menos
  1 hora del rango después de una hora de anticipación.
- Se guarda en la pestaña **Horarios** de la planilla `GOOGLE_SHEET_ID` (fila `cupo` incluida).
- La visita queda en el calendario durando todo el rango, con el rango, la comuna y las coordenadas.
- **Ruta del día** (bot de Telegram → 🗺 Ruta de visitas, o `/ruta`): ordena las visitas del día rango por rango, eligiendo
  dentro de cada uno el orden con menos manejo, y calcula la hora de llegada a cada una. La ruta parte en la primera visita.
  Trae el link de Google Maps con la ruta, un botón de WhatsApp por cliente con su hora y
  **📌 Fijar horas en el calendario**. Ese botón deja cada evento en su hora exacta (15 min), sin avisar al cliente por correo.
  Los recordatorios del día anterior dicen la hora exacta si ya está fijada, o el rango si no.
- `visitas-rangos` (público) entrega los días y rangos con cupo; `create_event` vuelve a revisar el rango y el cupo.
- Lógica y pruebas: `lib/horarios.mjs`, `lib/visitas.mjs` y `lib/ruta-visitas.mjs`. E2E local:
  `verify-horarios.mjs`, `verify-copiar-visitas.mjs` y `verify-bot.mjs`.

## Panel admin y cotizaciones

- La contraseña solo vive en el servidor. `admin-login` la valida y entrega un token que vence
  en 12 horas; las demás funciones rechazan cualquier llamada sin ese token.
- El número de cotización lo asigna el servidor (el mayor de la hoja + 1, partiendo en 1421).
  Una cotización existente nunca se sobrescribe. Si dos personas generan a la vez, la segunda
  recibe el siguiente número libre y el PDF se rehace con ese número.
- Cada cotización guarda su proyecto 3D en la columna **Q (Proyecto 3D)** de `Cotizaciones`.
  El encabezado se agrega solo la primera vez. Si el proyecto no cabe en una celda (50.000
  caracteres), se guarda comprimido. Después de escribir, la fila se relee y se verifica.
- En **Cotizaciones**, *Abrir en cotizador* recupera la cotización con su modelo. Al volver a
  generarla se actualiza la misma, sin cambiar su número, su estado ni su fecha de creación.
- La lista se ordena por fecha de creación, con las más nuevas arriba.
- Lógica y pruebas: `netlify/functions/lib/cotizaciones.mjs` y `lib/admin-auth.mjs`.
  Prueba E2E local: `node scripts/local-dev/verify-cotizaciones.mjs`.

## Desarrollo
