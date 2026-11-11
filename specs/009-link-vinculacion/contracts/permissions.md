# Contrato: permisos y aislamiento

**Funcionalidad**: `009-link-vinculacion`

## Permisos de la aplicación

Se decide siempre en el servidor, con el contexto de acceso de la spec 002. Ninguna regla depende de que la interfaz oculte una opción (FR-027).

- Generar un link de médico: personal con membresía activa y rol de administrador, en su clínica activa.
- Generar un link de paciente: personal con membresía activa y rol de administrador o de médico, en su clínica activa.
- Ver pendientes: el administrador, los de toda su clínica; quien solo es médico, los que generó.
- Revocar: quien generó el link o un administrador de la clínica.
- Previsualizar y aceptar: cualquier cuenta con sesión, solo si su correo verificado coincide con el del link. No hace falta una clínica activa.
- Paciente, personal sin los roles anteriores, administrador de plataforma que no pertenece a la clínica y cuentas sin sesión: no generan, no listan, no revocan.

Rechazos:
- Una operación sobre un link de otra clínica, inexistente o que no corresponde al actor da el mismo resultado que un link inexistente (`InvitationNotFoundError`).
- Aceptar un link inválido por cualquier motivo da el mismo resultado (`INVALID`).

## Aislamiento entre clínicas

- Toda consulta de `invitations` lleva `tenantId`, salvo `findByTokenHash`, que busca por el hash (único y secreto) y a continuación valida todo contra la clínica del link, no contra ninguna enviada por el cliente.
- Una clave foránea compuesta impide que un link quede en una clínica distinta de la de su emisor.
- Prueba de integración obligatoria (constitución): generar, listar, revocar y aceptar desde otra clínica son rechazados; un link de la clínica A no vincula a nadie a la clínica B.

## Registro de actividad

- DEBE conservarse quién generó cada link, cuándo, a qué correo, con qué vínculo y qué resultado tuvo (FR-031): lo cubren `created_by_user_id`, `created_at`, `email`, `kind`, `status`, `end_reason`, `accepted_at` y `accepted_by_user_id` de la tabla.
- NO DEBEN aparecer en los registros de la aplicación: el token, el link, el documento, la matrícula, el cuerpo del correo ni la respuesta del servicio de correo (FR-030). Una prueba unitaria, como la de la 008, verifica que ningún caso de uso ni adaptador escriba esos valores en la consola.

## Infraestructura (Terraform)

Sin cambios. El envío usa un servidor SMTP externo y una contraseña de aplicación, no un servicio de AWS: no hay módulo nuevo, ni permisos de IAM, ni cambios en la política límite ni en la del operador. Cuando se migre a Amazon SES (research R1, riesgos residuales) ese cambio traerá un módulo, un permiso `ses:SendEmail` acotado y sentencias en el límite de permisos, como la 008 hizo con `InvocarModelo`.

## Variables de entorno de la aplicación

- Siempre: `INVITATION_MAILER` (`smtp` o `fake`) y `APP_BASE_URL`.
- Con `smtp`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `INVITATION_FROM_ADDRESS`.
- Con `fake`: `FAKE_MAIL_OUTBOX_FILE`.
- `SMTP_PASSWORD` es el único secreto nuevo: la contraseña de aplicación de la cuenta de Gmail dedicada. Se guarda fuera de git, no se registra y no llega al navegador. Quien tenga acceso al entorno del servidor puede enviar correos como esa cuenta; por eso la cuenta es solo del proyecto, con verificación en dos pasos, y la contraseña se revoca desde Google si se filtra.
