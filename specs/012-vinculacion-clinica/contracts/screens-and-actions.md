# Contrato: pantallas y acciones

Las pantallas y las acciones viven en `src/app/`. No tienen lógica de negocio: validan la forma de los datos con zod, resuelven quién es la persona desde la sesión y delegan en `getTenantsModule()`. Toda acción llama por su cuenta a `requireClinicContextForAction()` (o a `getAccessContext()` cuando la persona aún no tiene clínica), porque se puede invocar con un POST directo y el `proxy` no la protege.

## Pantallas

| Ruta | Quién | Contenido |
|---|---|---|
| `/clinic/staff` | administrador de la clínica activa | Miembros con rol y estado; formulario para invitar (correo y roles); invitaciones pendientes con reenviar y revocar; desactivar y reactivar |
| `/clinic/patients` | administrador de la clínica activa | Alta de paciente (tipo y número de documento; el nombre se completa al vincular la cuenta); lista con estado y médico asignado; generar código nuevo; asignar y terminar asignación |
| `/invitation/[token]` | cualquier persona con sesión | Muestra a qué clínica y con qué rol la invitan, y el botón «Aceptar». Sin sesión, el `proxy` redirige a `/sign-in?next=…` |
| `/link-patient` | cualquier persona con sesión | Formulario: tipo y número de documento y código |
| `/studies` (existente) | paciente | Se suma el aviso «Tu médico ya no está disponible» cuando corresponde |

- `/clinic/*` rechaza a quien no es administrador con la misma pantalla de «sin acceso» que ya existe, sin revelar que la ruta existe para otros roles.
- Todas las rutas nuevas son protegidas por defecto (`isProtectedPath` solo exceptúa las de `(auth)`). No se agregan a las públicas.
- `/invitation/[token]` y `/link-patient` funcionan con el contexto `no-clinic` (persona sin clínica): usan `getAccessContext()` y aceptan `ready` y `no-clinic`.
- Navegación: el panel «Perfil administrativo» de `/` y el encabezado suman «Personal» y «Pacientes de la clínica» para administradores. La pantalla `/no-access` suma un enlace a `/link-patient` y la aclaración de que, si recibió una invitación, abra el enlace del correo.
- Interfaz: tokens semánticos, modo claro y oscuro, móvil, tablet y escritorio, teclado y foco visibles, estados que no dependen solo del color (`memory/design.md`). Se reutilizan `src/components/form/*`.

## Acciones (`"use server"`)

Archivos en `src/app/(dashboard)/clinic/_actions/` y en `invitation/` y `link-patient/`.

| Acción | Caso de uso | Éxito | Fallo |
|---|---|---|---|
| `inviteStaffAction` | `inviteStaff` | `{ ok: true }` y se refresca la lista | `{ ok: false, code, message }` |
| `revokeInvitationAction`, `resendInvitationAction` | homónimos | `{ ok: true }` | ídem |
| `deactivateMemberAction`, `reactivateMemberAction` | homónimos | `{ ok: true }` | ídem |
| `registerPatientAction` | `registerPatient` | `{ ok: true, linkCode }` **solo en esta respuesta** | ídem |
| `regenerateLinkCodeAction` | `regeneratePatientLinkCode` | `{ ok: true, linkCode }` | ídem |
| `assignPatientAction`, `endAssignmentAction` | homónimos | `{ ok: true }` | ídem |
| `acceptInvitationAction` | `acceptStaffInvitation` + `users.selectActiveClinic` | redirige a `/` con la clínica nueva activa | `INVALID_INVITATION` con mensaje único |
| `linkPatientAction` | `linkPatientAccount` + `users.selectActiveClinic` | redirige a `/` con la clínica nueva activa | `LINK_FAILED` con mensaje único, o `TOO_MANY_ATTEMPTS` |

- El `linkCode` se devuelve al navegador una vez y se muestra en pantalla con un aviso de que no se podrá ver de nuevo. No se coloca en la URL, en una cookie ni en el estado que sobrevive al refresco.
- Los identificadores (`invitationId`, `membershipId`, `patientId`, `assignmentId`) se validan como UUID. Un valor mal formado o ajeno devuelve `NOT_FOUND`.
- Los mensajes de pantalla viven en `src/app/(dashboard)/clinic/_lib/clinic-messages.ts`, en español rioplatense y sin lenguaje técnico, e indican el siguiente paso.
- Registro de errores: solo `[clínica] error inesperado: <NombreDelError>`; nunca datos de la persona.

## Variables de entorno

| Variable | Uso |
|---|---|
| `INVITATION_MAILER` | `smtp` o `fake`; sin valor por defecto (falla si falta, como `MODEL_INFERENCE`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | conexión del adaptador `smtp` |
| `INVITATION_FROM_ADDRESS` | remitente de las invitaciones |
| `FAKE_MAIL_OUTBOX_FILE` | archivo donde el adaptador `fake` escribe cada correo (una línea JSON) |
| `APP_BASE_URL` | origen con el que se arma el enlace de la invitación (nueva) |

`SMTP_PASSWORD` y el resto de las credenciales viven en el entorno del servidor (en la demo, en el secreto de la aplicación en Secrets Manager), nunca en el repositorio ni en Terraform.
