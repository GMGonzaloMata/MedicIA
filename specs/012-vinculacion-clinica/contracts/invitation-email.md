# Contrato: correo de invitación

Lo arma el módulo `tenants` (texto plano y HTML mínimo) y lo envía el puerto `InvitationMailer`.

## Contenido

- **Asunto:** `Te invitaron a <nombre de la clínica> en MedicIA`
- **Cuerpo:**
  1. Quién invita (el nombre de la clínica, no el de la persona que invitó) y con qué rol: «médico», «administrador» o «médico y administrador».
  2. El enlace `APP_BASE_URL/invitation/<token>`.
  3. «Este enlace vence en 7 días y se puede usar una sola vez.»
  4. «Si todavía no tenés cuenta, registrate con este mismo correo y volvé a abrir este enlace.»
  5. «Si no esperabas esta invitación, ignorá este mensaje.»
- Sin imágenes remotas ni seguimiento de aperturas.
- Sin ningún dato clínico.

## Reglas

- El destinatario es el correo de la invitación, ya normalizado.
- El token aparece **solo** en el cuerpo del correo y en el enlace. No se registra, no se guarda y no se devuelve a la pantalla del administrador.
- El nombre de la clínica se escapa antes de entrar en el HTML.
- Un fallo de envío no se reintenta automáticamente: queda la invitación creada y el administrador puede reenviar.

## Adaptadores

| `INVITATION_MAILER` | Comportamiento |
|---|---|
| `smtp` | Envía por SMTP con `nodemailer` usando `SMTP_*` e `INVITATION_FROM_ADDRESS`. Conexión segura con verificación del certificado. Un error se traduce a `MAIL_UNAVAILABLE`, sin mostrar el mensaje del servidor al usuario. |
| `fake` | Agrega `{ to, subject, text, html }` como una línea JSON a `FAKE_MAIL_OUTBOX_FILE`. Para pruebas E2E y desarrollo. Nunca sale a la red. |
