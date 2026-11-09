# Contrato: contexto de acceso

**Plan**: [../plan.md](../plan.md) | **Decisiones**: [../research.md](../research.md) (R5, R6)

Es lo que las funcionalidades siguientes (invitaciones, estudios, análisis) usan para saber quién es la persona y en qué clínica trabaja. Es el único origen válido del `tenantId` (constitución, principio II).

## Cómo se obtiene

`getAccessContext()` en `src/app/_lib/access.ts` (solo servidor). Lee la cookie de sesión, ejecuta el caso de uso `getAccessContext` del módulo `users` y devuelve la unión de abajo. Se memoiza con `cache` de React dentro de un mismo render; no se cachea entre solicitudes (R6).

Dos ayudantes sobre ella, también en `src/app/_lib/access.ts`:
- **`requireClinicContext()`**: devuelve el contexto `ready`. Si es `anonymous`, redirige a `/sign-in`; si es `no-clinic`, a `/select-clinic` (o `/no-access` si no hay clínicas). Para pantallas.
- **`requireClinicContextForAction()`**: igual, pero en vez de redirigir devuelve un error de autorización que la acción convierte en respuesta. Para Server Actions y Route Handlers.

## Forma del resultado

- **`{ status: "anonymous" }`**: sin cookie, o la sesión no existe, está revocada, venció por inactividad o por tiempo absoluto, o fue invalidada por un cambio de contraseña.
- **`{ status: "no-clinic", user }`**: sesión vigente sin clínica activa vigente. Puede ser que nunca eligiera una o que la elegida dejó de estar vigente.
- **`{ status: "ready", user, clinic }`**: sesión vigente con clínica activa vigente.

Donde:
- **`user`**: `{ id, email, fullName, isPlatformAdmin }`. Nada más de la cuenta.
- **`clinic`**: `{ tenantId, tenantName, relationship }`.
- **`relationship`** es una de dos:
  - `{ kind: "STAFF", membershipId, isClinicAdmin, isDoctor }`.
  - `{ kind: "PATIENT", patientId }`.

## Reglas para quien lo use

- El `tenantId` de una operación sale siempre de `clinic.tenantId`. Un `tenantId` que llegue en una URL, un formulario o un cuerpo se ignora.
- Los permisos dependen de `relationship.kind` y de sus roles, nunca de que la persona tenga otros vínculos en otras clínicas.
- Toda Server Action y Route Handler llama a `getAccessContext` por su cuenta. No basta con que la pantalla que lo invoca lo haya hecho.
- Un Client Component recibe solo los campos que muestra (nombre de la clínica, tipo de vínculo), no el objeto completo.
- Esta funcionalidad no define permisos por rol. Cada funcionalidad decide qué puede hacer cada `relationship`.

## Revalidación

En cada llamada se vuelve a comprobar que la sesión esté vigente y que el vínculo activo siga vigente: membresía `ACTIVE` o paciente `LINKED`, y clínica `ACTIVE`. Un cambio de estado tiene efecto en la solicitud siguiente (FR-025).
