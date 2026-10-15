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
   - GOOGLE_SHEET_ID (hoja con la pestaña `Cotizaciones`) y PRECIOS_SHEET_ID
   - ADMIN_PASSWORD: contraseña del panel `/admin`, **mínimo 12 caracteres**. Sin ella nadie entra.
   - ADMIN_SESSION_SECRET: texto aleatorio de **32 caracteres o más** para firmar las sesiones
     (por ejemplo `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
     Cambiar esta variable o la contraseña cierra todas las sesiones abiertas.
   - VITE_REPISAS_3D_URL: dirección del configurador 3D (Vercel).
   - MP_ACCESS_TOKEN: Access Token **de producción** de Mercado Pago (ver "Pago en línea"). Sin él se sigue usando el link fijo.
   - MP_WEBHOOK_SECRET (recomendada): la "clave secreta" de las notificaciones (webhooks) de Mercado Pago.
   - SITE_URL (opcional): dirección pública del sitio para los links de pago. Si falta, se usa la que da Netlify.
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
- **Boletas** (se emiten a mano en el SII):
  - cada pago tiene "Anotar boleta" para guardar su N°;
  - Admin → Instalaciones muestra los **pagos sin boleta**, con su monto y fecha, para anotarlos ahí mismo.

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

## Dashboard de instalaciones

- **Admin → Instalaciones**: cuánto entra por mes según la fecha de cada instalación agendada (no cuenta las rechazadas).
  - vendido, cobrado y por cobrar, con el saldo de trabajos ya hechos en rojo;
  - realizado vs agendado, ticket promedio y la variación contra el mes anterior.
- **¿De dónde viene la plata?** tiene dos vistas:
  - **por servicio**: repisas, retiro y orden, retiro de basura, cajas y soportes;
  - **por tipo de trabajo**: solo repisas, con retiro y orden, o con otros servicios.
- Gráficos de los últimos 6 meses (cada barra abre ese mes) y de las semanas del mes.
- Tabla con filtros: tipo de trabajo y "con saldo".
  - Al hacer clic en una fila se abre la cotización.
  - Se puede descargar en CSV para Excel.
- Todo se puede ver **con IVA o neto**. Si un subtotal se editó a mano, la diferencia aparece como "Ajustes de precio" para que todo cuadre.
- Lógica y pruebas: `lib/resumen-instalaciones.mjs`. Prueba E2E local: `node scripts/local-dev/verify-instalaciones.mjs`.

## Horarios de visita

- En **Admin → Horarios** se define:
  - el **horario semanal**, que se repite cada semana (por ejemplo, domingo de 10:00 a 14:00);
  - las **fechas especiales**: abrir un sábado, cambiar el horario de un domingo o cerrar un día;
  - cuántas **semanas** hacia adelante ve el cliente (1 a 12).
- Se guarda en la pestaña **Horarios** de la planilla `GOOGLE_SHEET_ID`. La pestaña se crea sola la primera vez que se guarda.
- Mientras no exista la pestaña, se usa lo que estaba fijo antes: domingos de 08:00 a 20:00 (último inicio 19:30) y 4 semanas.
- La página pública muestra solo los días con horarios. El día de hoy ofrece solo horas que parten en una hora o más.
- `get-availability` y `create_event` validan cada hora contra el horario: una reserva fuera de él se rechaza aunque se arme a mano.
- Las visitas ya agendadas no se borran al cambiar el horario.
- Lógica y pruebas: `netlify/functions/lib/horarios.mjs`. Prueba E2E local: `node scripts/local-dev/verify-horarios.mjs`.

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
