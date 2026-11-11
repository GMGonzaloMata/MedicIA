# Contrato: envío del correo de invitación

**Funcionalidad**: `009-link-vinculacion` | Puerto en `src/modules/users/application/ports/out/invitation-mailer.ts`

## Puerto

```ts
interface InvitationEmail {
  to: string;                       // correo ya normalizado
  clinicName: string;
  kind: "DOCTOR" | "PATIENT";
  link: string;                     // <APP_BASE_URL>/invite/<token>
  expiresAt: Date;
}

interface InvitationMailer {
  // Devuelve cuando el servicio aceptó el mensaje. Lanza MailDeliveryError si no lo hizo.
  send(email: InvitationEmail): Promise<void>;
}
```

- `MailDeliveryError` es un error de dominio genérico: no lleva el cuerpo del mensaje, el link ni la respuesta del servicio. Solo un código (`UNAVAILABLE`, `REJECTED` o `NOT_CONFIGURED`).
- El caso de uso arma el `link` con `APP_BASE_URL` (variable validada) y el token. El adaptador no conoce el token por separado.
- El adaptador no reintenta: si falla, el caso de uso devuelve `SEND_FAILED` y la persona decide reintentar.

## Contenido del mensaje

Lo arma una función de aplicación pura (`render-invitation-email.ts`), probada sin red, que devuelve asunto, texto plano y HTML. Español rioplatense.

- Asunto: `Invitación a <clínica> en MedicIA`.
- Cuerpo: nombre de la clínica, si se lo invita como médico o como paciente, el link, la fecha de vencimiento, y una línea que indica que debe ingresar o crear su cuenta con ese mismo correo y que se le va a pedir su documento (paciente) o su matrícula (médico).
- Nunca incluye el documento, la matrícula, el nombre de quien invita ni datos clínicos (FR-034).
- El nombre de la clínica se escapa en el HTML. El link se escribe como texto y como enlace.
- Sin imágenes ni rastreo de aperturas.

## Adaptador real: SMTP

`src/modules/users/infrastructure/adapters/smtp-invitation-mailer.ts`, con la librería `nodemailer`. Es un adaptador SMTP genérico: Gmail es solo el servidor configurado (research R1).

- Envía un mensaje con texto plano y HTML, desde `INVITATION_FROM_ADDRESS`, por el servidor de `SMTP_HOST` y `SMTP_PORT`, autenticándose con `SMTP_USER` y `SMTP_PASSWORD`.
- Conexión siempre cifrada: puerto `465` con TLS implícito o `587` con `STARTTLS` obligatorio (no se acepta continuar en texto plano). Otra combinación se rechaza al armar el adaptador.
- Tiempos máximos de conexión, saludo y envío: 10 segundos cada uno. Sin reintentos.
- Traduce cualquier error de la librería a `MailDeliveryError` con un código genérico:
  - fallo de autenticación o configuración incompleta: `NOT_CONFIGURED`;
  - red, tiempo agotado o servicio no disponible: `UNAVAILABLE`;
  - destinatario rechazado por el servidor: `REJECTED`.
  La persona ve el mismo mensaje en todos los casos ("No pudimos enviar el correo"); el código solo sirve para el registro de errores y para que el responsable distinga una contraseña vencida de un fallo de red.
- No registra el destinatario, el asunto, el cuerpo, el link, la respuesta del servidor ni la contraseña; solo el nombre del error y el código. Los mensajes de error de la librería pueden incluir el destinatario o datos de la conexión, así que nunca se propagan ni se escriben.
- El transporte se crea una vez por proceso, al primer envío, y se guarda en `globalThis` como el resto de las composiciones (Next puede cargar el archivo más de una vez).

## Adaptador simulado

`src/modules/users/infrastructure/adapters/fake-invitation-mailer.ts`.

- Agrega una línea JSON al archivo de `FAKE_MAIL_OUTBOX_FILE` por cada correo: `{ to, subject, text, html, link, sentAt }`. Es lo que leen las pruebas de extremo a extremo y quien desarrolla para abrir el link.
- Un destinatario con el valor especial `fail@invitations.test` lanza `MailDeliveryError` (`UNAVAILABLE`), para probar el envío fallido.
- Nunca se usa en producción: `createInvitationMailer` rechaza `fake` cuando `NODE_ENV` es `production`.

## Fábrica

`src/modules/users/infrastructure/adapters/create-invitation-mailer.ts` lee `INVITATION_MAILER` (`smtp` o `fake`, sin valor por defecto) y valida con zod las variables de cada adaptador. Una variable ausente o inválida es un error al armar el adaptador, no un envío silencioso.

Variables:
- Siempre: `INVITATION_MAILER` y `APP_BASE_URL`.
- Con `smtp`: `SMTP_HOST`, `SMTP_PORT` (`465` o `587`), `SMTP_USER`, `SMTP_PASSWORD` e `INVITATION_FROM_ADDRESS`.
- Con `fake`: `FAKE_MAIL_OUTBOX_FILE`.
- `APP_BASE_URL` DEBE ser `https` en producción y nunca se toma de un encabezado de la solicitud.
- `SMTP_PASSWORD` es un secreto: vive en `.env.local` (fuera de git) o en el entorno del servidor. No se registra, no se incluye en mensajes de error y no llega nunca al navegador (no lleva el prefijo `NEXT_PUBLIC_`).
