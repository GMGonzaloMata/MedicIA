# Contrato: permisos y aislamiento

**Funcionalidad**: `010-gestion-usuarios-clinica`

## Permisos de la aplicación

Se deciden siempre en el servidor, con el contexto de acceso de la 002, en las pantallas, las acciones y los casos de uso. Ninguna regla depende de que la interfaz oculte una opción (FR-025).

- **Ver las listas de personal y de pacientes:** personal con membresía activa y rol de administrador, en su clínica activa.
- **Dar de alta un médico:** administrador.
- **Dar de alta un paciente:** administrador o médico. Si lo hace un médico, el paciente queda asignado a él.
- **Dar de alta personal con rol de administrador:** nadie, por esta vía.
- **Reenviar el correo de acceso:** administrador, o médico sobre un paciente que tiene asignado de forma vigente. El médico lo hace desde el detalle del paciente en `/patients/[patientId]` (006).
- **Asignar y quitar médicos, desactivar y reactivar personal, revocar y reactivar pacientes:** administrador. El médico no.
- **Ver a sus pacientes asignados:** médico, con la lista que ya existe (006).
- Un paciente, personal sin rol de administrador ni de médico, personal desactivado, un administrador de plataforma que no pertenece a la clínica y una cuenta sin sesión: no tienen actor y no ven ni cambian nada.

Un integrante con ambos roles (administrador y médico) tiene los permisos de ambos.

## Rechazos

- Un identificador de otra clínica, inexistente o que no corresponde al actor (membresía, paciente, asignación) da el mismo resultado: `NOT_FOUND`. No se distingue la causa.
- Sin permiso: `FORBIDDEN`, sin revelar si el objetivo existe.
- El alta da la misma respuesta exista o no una cuenta con ese correo en la plataforma.

## Aislamiento entre clínicas

- Toda consulta y toda escritura de esta funcionalidad lleva el `tenantId` del actor.
- `clinic_user_events` tiene claves foráneas compuestas con `tenant_id`: un evento no puede atribuirse ni apuntar a una membresía o paciente de otra clínica.
- Una persona dada de baja o de alta en la clínica A no cambia nada en la clínica B (SC-008).
- Prueba de integración obligatoria (constitución): ver, dar de alta, asignar, quitar, desactivar, reactivar, revocar y reenviar desde otra clínica son rechazados.

## Registro de actividad

- Quién hizo cada alta, asignación, baja, reactivación y reenvío, cuándo y sobre quién queda en `clinic_user_events` (FR-030), en la misma transacción que el cambio.
- NO DEBEN aparecer en los registros de la aplicación: contraseñas, códigos, documentos ni matrículas (FR-029).

## Variables de entorno

Sin variables nuevas: se reutilizan `INVITATION_MAILER`, `APP_BASE_URL` y las de SMTP o del correo simulado (009), y las de Cognito o el proveedor simulado (002).
