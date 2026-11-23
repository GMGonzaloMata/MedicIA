// El correo no se pudo entregar al servicio de envío. No guarda el mensaje del servidor: puede traer datos de la
// conexión o del destinatario, y nunca se le muestra a la persona ni se registra.
export class MailDeliveryError extends Error {
  constructor() {
    super("No se pudo enviar el correo.");
    this.name = "MailDeliveryError";
  }
}
