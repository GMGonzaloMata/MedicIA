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

// Aviso de que una persona fue dada de alta en una clínica (spec 010). No lleva documento, matrícula ni datos clínicos.
export interface AccessNoticeEmail {
  // Correo ya normalizado.
  to: string;
  clinicName: string;
  kind: InvitationKind;
  // `<APP_BASE_URL>/verify-email`: donde la persona nueva ingresa su correo y el código para elegir su contraseña.
  // Nulo si la cuenta ya existía.
  setPasswordUrl: string | null;
}

export interface InvitationMailer {
  // Termina cuando el servicio aceptó el mensaje. Lanza `MailDeliveryError` si no lo hizo, con un código genérico.
  send(email: InvitationEmail): Promise<void>;
  // Aviso del alta directa. Mismo contrato de error que `send`.
  sendAccessNotice(notice: AccessNoticeEmail): Promise<void>;
}
