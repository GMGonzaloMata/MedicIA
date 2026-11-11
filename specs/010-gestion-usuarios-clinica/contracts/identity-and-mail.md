# Contrato: servicio de identidad y de correo

**Funcionalidad**: `010-gestion-usuarios-clinica`

Amplía los contratos de la 002 (`identity-provider.md`) y de la 009 (`invitation-mailer.md`). Lo que no se menciona no cambia.

## `IdentityProvider.provisionAccount`

```text
provisionAccount(input: { email: string; fullName: string }): Promise<{ subject: string; fullName: string }>
```

- El correo llega normalizado. No recibe contraseña: nadie la conoce (FR-008).
- Crea la cuenta como un registro propio, con una contraseña provisional que nadie conoce, y hace que el servicio envíe el código de verificación a la persona. La persona define su contraseña en `/verify-email` (002, R18).
- Si la cuenta ya existía en el servicio, no falla: reenvía el código si estaba sin verificar y devuelve el `subject` y el nombre que ya tenía. No cambia su contraseña ni su nombre.
- Devuelve solo el `subject` y el nombre. Nunca devuelve ni registra contraseñas, códigos ni tokens.
- Falla con `IdentityError("UNAVAILABLE")` ante cualquier error inesperado, registrando solo el nombre interno del error.

**Adaptador de Cognito.** `SignUp` (toma `UserSub` de la respuesta); ante `UsernameExistsException`: reenvío del código con los mismos errores absorbidos que `signUp`, y `AdminGetUser` para leer `sub` y `name`. Requiere el permiso `cognito-idp:AdminGetUser` sobre el grupo de usuarios (ver abajo). Valida con `zod` que `sub` y `name` existan.

**Adaptador simulado.** Crea la cuenta en memoria si no existe (igual que `signUp`) y devuelve `{ subject: fakeSubjectForEmail(email), fullName }`.

## `InvitationMailer.sendAccessNotice`

```text
sendAccessNotice(input: {
  to: string;               // correo normalizado
  clinicName: string;
  kind: "DOCTOR" | "PATIENT";
  setPasswordUrl: string | null;   // `<APP_BASE_URL>/verify-email`, o null si la cuenta ya existía
}): Promise<void>
```

- Lanza `MailDeliveryError` con un código genérico si el servicio no aceptó el mensaje, como `send`.
- El texto indica la clínica y el rol. Con `setPasswordUrl`, explica que el servicio de identidad le envió un código y que debe ingresarlo ahí con su correo para elegir su contraseña. Sin él, informa que ya puede elegir esa clínica al ingresar.
- NO incluye documento, matrícula, datos clínicos, ni el nombre de quien dio de alta.
- La dirección base sale de `APP_BASE_URL`, nunca de un encabezado de la solicitud.

**Adaptador `smtp`:** el mismo transporte cifrado que las invitaciones. **Adaptador `fake`:** agrega al archivo una línea de JSON `{ "type": "access-notice", to, clinicName, kind, setPasswordUrl }`; el correo `fail@invitations.test` siempre falla, igual que con las invitaciones.

## Infraestructura (Terraform, sin `apply`)

- `infra/modules/identity/main.tf`: la política del usuario de la aplicación pasa de `cognito-idp:AdminSetUserPassword` a esa acción más `cognito-idp:AdminGetUser`, ambas sobre el ARN del grupo.
- `infra/bootstrap/permissions-boundary.tf`: la sentencia `FijarContrasenaEnElGrupo` suma `cognito-idp:AdminGetUser`. Si el límite no la incluye, la política del usuario no tiene efecto.
- Se actualizan las pruebas `.tftest.hcl` que enumeran las acciones, y `infra/README.md` documenta el motivo.
- Es una acción de lectura de un solo usuario; no permite crear, borrar ni cambiar cuentas.
- Lo aplica el responsable: `terraform apply` en `infra/bootstrap` (límite) y en `infra/environments/dev` (política), en ese orden. Hasta entonces, el alta con una cuenta ya existente en Cognito pero sin fila propia falla con `UNAVAILABLE`; el resto del alta funciona.

## Registro de actividad

NO DEBEN aparecer en los registros de la aplicación: contraseñas, códigos de verificación, la dirección de `/verify-email` con datos de la persona, el documento ni la matrícula (FR-029). Una prueba unitaria, como la de la 009, comprueba que ningún caso de uso ni adaptador nuevo los escribe en la consola.
