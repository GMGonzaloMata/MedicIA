# Contrato: pantallas, rutas y acciones de invitaciones

**Funcionalidad**: `009-link-vinculacion`

Todo el texto está en español rioplatense. Las pantallas usan los tokens de diseño, funcionan en claro y oscuro y en móvil, tablet y escritorio, son operables por teclado y comunican los estados con texto además de color (FR-032). Los textos viven en `src/app/(dashboard)/_invitations/_lib/invitation-messages.ts`.

## Rutas

- `GET /invite/[token]`: Route Handler **público** (se agrega `/invite` a `PUBLIC_PATHS` en `src/shared/utils/route-access.ts`). Guarda la cookie de invitación y redirige a `/invitation`. No cambia ningún estado.
- `/invitation`: pantalla **protegida** (grupo `(dashboard)`). Acepta una cuenta con o sin clínica activa.
- `/invitations`: pantalla **protegida** para personal con rol de administrador o de médico: formulario para invitar y lista de pendientes.

## Cookie de invitación

- Nombre `medicia_invitation` (constante en `src/shared/constants/invitation-cookie.ts`). Valor: el token.
- `httpOnly`, `sameSite=lax`, `secure` en producción, `path=/`, vigencia de 2 horas.
- Funciones en `src/app/_lib/invitation-cookie.ts`: `setInvitationCookie`, `readInvitationToken` (devuelve el token solo si tiene la forma esperada), `clearInvitationCookie`, igual que `session-cookie.ts`.
- Solo se escribe desde el Route Handler o una Server Action, nunca durante el render.

## `GET /invite/[token]`

1. Si el token no tiene la forma esperada, no guarda nada.
2. Si la tiene, guarda la cookie.
3. Responde con una redirección a `/invitation`, con `Referrer-Policy: no-referrer` y `Cache-Control: no-store`.

El resultado visible es el mismo con un token válido o inventado.

## `/invitation` (aceptar)

Sin sesión, el `proxy` la redirige a `/sign-in?next=/invitation`. Con sesión:

1. Lee la cookie. Sin cookie o con una forma inválida: mensaje genérico ("Esta invitación no es válida o venció") con el botón "Ir al inicio".
2. Llama a `previewInvitation` con la cuenta de la sesión.
3. `INVALID`: el mismo mensaje genérico, más una nota "Si te invitaron a otro correo, cerrá sesión e ingresá con ese correo" y el botón "Cerrar sesión". No se revela la clínica ni el tipo (FR-024). Se borra la cookie solo cuando se cierra sesión o se acepta otra invitación.
4. `VALID` y `kind = PATIENT`: muestra "<Clínica> te invitó como paciente" y un formulario con tipo de documento (DNI, pasaporte u otro) y número.
5. `VALID` y `kind = DOCTOR`: muestra "<Clínica> te invitó como médico" y un formulario con matrícula y especialidad.
6. El texto explica por qué se pide el dato: "Lo pedimos para confirmar que la invitación es para vos."

## Acción `acceptInvitation`

`src/app/(dashboard)/_invitations/_actions/accept-invitation.ts`, `"use server"`.

1. Comprueba por su cuenta que haya sesión (`getAccessContext`): una acción se puede invocar con un POST directo. Sin sesión, redirige a `/sign-in`.
2. Lee el token de la cookie (no del formulario) y valida el resto con zod: tipo de documento del enumerado, número y matrícula con longitud entre 1 y 40, especialidad con longitud entre 2 y 100.
3. Llama a `acceptInvitation` con la cuenta de la sesión y nada más que esos datos.
4. Según el resultado:
  - `ACCEPTED`: borra la cookie, activa el vínculo nuevo con `selectActiveClinic` (`kind` y `relationshipId` del resultado), `revalidatePath("/", "layout")` y redirige a `/`. Si activar falla, redirige a `/select-clinic`, donde la clínica ya aparece.
  - `ALREADY_MEMBER`: borra la cookie, muestra "Ya pertenecés a <clínica>" con el botón "Ir al inicio".
  - `PROOF_MISMATCH`: vuelve al formulario con "Los datos no coinciden. Te quedan N intentos." Con 0: "La invitación se invalidó por demasiados intentos. Pedí una nueva a la clínica." y borra la cookie.
  - `CONFLICT`: mensaje claro por motivo, sin datos de terceros, y la indicación de comunicarse con la clínica.
  - `INVALID`: el mensaje genérico y se borra la cookie.
5. Cualquier error inesperado se registra solo con el nombre del error y se muestra "No pudimos completar la vinculación. Probá de nuevo."

## `/invitations` (invitar y ver pendientes)

Acceso: personal con rol de administrador o de médico; cualquier otro es redirigido al inicio (`/`), como hace `/patients` con quien no es médico. La pantalla usa `requireClinicContext` y el actor de `invitation-actor.ts`.

- **Formulario**:
  - El administrador elige el tipo (médico o paciente); el médico solo ve "Paciente".
  - Correo.
  - Paciente: tipo de documento y número. Médico: matrícula.
  - Botón "Enviar invitación".
- **Resultado**: confirmación "Enviamos la invitación a <correo>" o, si el correo falló, "No pudimos enviar el correo" con el botón "Reintentar" (vuelve a generar con los mismos datos, lo que reemplaza a la anterior). El link nunca se muestra (FR-035).
- **Lista de pendientes**: correo, tipo, vencimiento, quién la generó (solo se muestra al administrador) y estado ("Enviada" o "Envío fallido"). Cada fila tiene "Revocar" con confirmación. Sin pendientes: estado vacío con texto.
- Los conflictos se muestran junto al formulario: "Ese correo ya es personal de la clínica", "Ese documento ya está registrado con otra cuenta", etc.

## Acciones `createInvitation` y `revokeInvitation`

`src/app/(dashboard)/_invitations/_actions/`. Cada una:
- Comprueba la sesión y arma el actor por su cuenta (`requireClinicContextForAction`); sin permiso devuelve un rechazo, no una excepción.
- Valida con zod (correo, tipo, documento o matrícula; `invitationId` como UUID).
- No recibe ni acepta `tenantId`.
- Llama al caso de uso y traduce el resultado a un estado de formulario con `revalidatePath("/invitations")`.

## Cambios en pantallas existentes

- **`signIn` (acción)**: antes de decidir el destino, si `readInvitationToken()` devuelve un token, redirige a `/invitation`, aunque la persona no tenga clínica o deba elegir entre varias (research R5).
- **Pantallas de ingreso y registro**: si hay invitación pendiente en la cookie, un aviso "Ingresá o creá tu cuenta con el correo al que llegó la invitación".
- **`/no-access`**: si hay invitación pendiente, un botón "Continuar con la invitación". El texto del estado vacío de la 002 se mantiene (FR-033).
- **Inicio**: un enlace "Invitaciones" para el personal con rol de administrador o de médico.
- **`route-access.ts`**: `/invite` pasa a ser público.

## Accesibilidad y diseño

- Todos los campos con etiqueta visible, errores asociados al campo y anunciados, foco visible, orden de tabulación natural.
- Estados de la lista con texto ("Enviada", "Envío fallido"), no solo color.
- La confirmación de revocar es un diálogo accesible o una segunda acción en la misma fila, operable por teclado.
- Componentes en `src/app/(dashboard)/_invitations/_components/`, reutilizando los de formularios y botones existentes (`@/components/form/`).
