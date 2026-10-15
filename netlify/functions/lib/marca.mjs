// Datos comerciales de Don Maxi que aparecen en el PDF, en el correo y en /cotiza.
// Un solo lugar: si cambia la cuenta, el link de pago o la oferta, cambia en todos lados.
export const MARCA = { razonSocial: 'Don Maxi SPA', rut: '77.386.684-8', banco: 'Banco BCI', tipoCuenta: 'Corriente', numeroCuenta: '13702807', rating: '5.0', resenas: '231', linkPago: 'https://link.mercadopago.cl/repisasdonmaxi', galeriaUrl: 'www.donmaxi.cl/galeria' };
export const CONDICIONES = 'Puede abonar un 50% antes de la instalación, o pagar el total al finalizar el trabajo. Garantía de 5 años sobre estructura e instalación.';
// Descuento por pagar con transferencia: Mercado Pago cobra comision, la transferencia no.
// Lo muestran el PDF, /cotiza, el correo, WhatsApp y la pagina de reserva; se aplica al confirmar
// el primer pago por transferencia (si la cotizacion no tiene ya otro descuento).
export const OFERTA = { descuento: 10, medio: 'transferencia' };
export const TEXTO_OFERTA = `Paga por transferencia y obtén ${OFERTA.descuento}% de descuento`;
export const WHATSAPP = '+56951020367';

// Servicios adicionales: clave, nombre, precio neto de lista y descripcion para el PDF.
// Los usan el PDF, el cotizador y el panel para agendar la instalacion.
export const SERVICIOS = [
  ['retiro_orden', 'Retiro y orden de artículos', 40000, 'Retiramos todo lo que tengas en el espacio y lo reordenamos una vez instaladas las repisas. Si no se contrata, el área debe estar despejada antes de la instalación.'],
  ['retiro_basura', 'Retiro de basura', 30000, 'Nos llevamos muebles, cajas, escombros y todo lo que ya no necesites, para que no tengas que preocuparte de desecharlo.'],
  ['cajas', 'Cajas organizadoras', 15000, 'Cajas plásticas apilables para mantener tus artículos protegidos y bien distribuidos entre los niveles.'],
  ['bici', 'Soporte de bicicleta/ski', 20000, 'Soportes anclados al muro para que tus artículos deportivos ocupen menos espacio en el suelo.'],
];
