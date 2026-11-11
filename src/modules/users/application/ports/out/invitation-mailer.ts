import type { InvitationKind } from "../../../domain/invitation";

export interface InvitationEmail {
  // Correo ya normalizado.
  to: string;
  clinicName: string;
  kind: InvitationKind;
  // `<APP_BASE_URL>/invite/<token>`. Es el único lugar donde viaja el token.
  link: string;
  expiresAt: Date;
}

export interface InvitationMailer {
  // Termina cuando el servicio aceptó el mensaje. Lanza `MailDeliveryError` si no lo hizo, con un código genérico.
  send(email: InvitationEmail): Promise<void>;
}
