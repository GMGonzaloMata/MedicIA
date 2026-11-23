export interface InvitationMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Envía el correo de una invitación. Si el servicio no lo acepta, lanza `MailDeliveryError`.
export interface InvitationMailer {
  send(message: InvitationMessage): Promise<void>;
}
