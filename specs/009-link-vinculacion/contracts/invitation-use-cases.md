# Contrato: casos de uso de invitaciones

**Funcionalidad**: `009-link-vinculacion` | Módulo: `src/modules/users/` | Se obtienen con `getUsersModule()`

Todos los casos de uso reciben datos simples y devuelven datos simples: no importan `next/*`, no leen cookies y no redirigen. El `tenantId` nunca es un parámetro: sale del actor, que a su vez sale del contexto autenticado (`getAccessContext`, spec 002).

## Actor

```ts
// Quién invita. Lo arma src/app/_lib/invitation-actor.ts a partir del contexto de acceso.
// null si la persona no puede invitar (paciente, o personal sin rol de administrador ni de médico).
interface InvitationActor {
  tenantId: string;
  userId: string;
  membershipId: string;
  isClinicAdmin: boolean;
  isDoctor: boolean;
}
```

Permisos (lógica en `domain/invitation-access.ts`):
- `isClinicAdmin`: puede invitar `DOCTOR` y `PATIENT`.
- Solo `isDoctor`: puede invitar `PATIENT`.
- Quien tiene ambos roles tiene los dos permisos.
- `assignToCreator` = `kind === "PATIENT" && actor.isDoctor`.

## `createInvitation`

```ts
createInvitation(input: {
  actor: InvitationActor;
  kind: "DOCTOR" | "PATIENT";
  email: string;                       // se normaliza: minúsculas, sin espacios en los extremos
  documentType?: "DNI" | "PASSPORT" | "OTHER";   // obligatorio si kind = PATIENT
  documentNumber?: string;             // obligatorio si kind = PATIENT
  licenseNumber?: string;              // obligatorio si kind = DOCTOR
}): Promise<CreateInvitationResult>
```

Resultado:
- `{ status: "SENT"; invitation: InvitationSummary }`: guardada y enviada.
- `{ status: "SEND_FAILED"; invitation: InvitationSummary }`: guardada, el servicio de correo no la aceptó. `sentAt` vacío. La pantalla ofrece reintentar (FR-036).
- `{ status: "CONFLICT"; reason }` con `reason` entre:
  - `ALREADY_STAFF`: el correo ya pertenece al personal de esta clínica y se pidió un vínculo de paciente.
  - `ALREADY_PATIENT`: el correo ya es paciente de esta clínica y se pidió un vínculo de médico.
  - `DOCUMENT_IN_USE`: el documento ya pertenece a otro paciente de esta clínica con una cuenta distinta (FR-008).
  - `LICENSE_IN_USE`: la matrícula ya pertenece a otro integrante de esta clínica (FR-008).

Lanza `InvitationForbiddenError` si el actor no puede invitar ese tipo (FR-002, FR-003, FR-029). Lanza `InvitationInputError` si faltan o sobran campos para el tipo.

Comportamiento:
1. Valida permisos, campos del tipo y la forma del correo.
2. Comprueba conflictos **solo con datos de la clínica del actor** (research R6): nunca revela si el correo tiene cuenta en la plataforma.
3. Genera el token, calcula `expiresAt = ahora + 7 días` y, en una transacción, cierra los pendientes del mismo correo y clínica (`EXPIRED` si vencieron, `REVOKED/REPLACED` si no) e inserta el nuevo (FR-009).
4. Envía el correo (`InvitationMailer.send`). Si funciona, marca `sentAt`. Si falla, devuelve `SEND_FAILED`.
5. Nunca registra el token, el link, el documento ni la matrícula.

## `listInvitations`

```ts
listInvitations(input: { actor: InvitationActor }): Promise<InvitationSummary[]>
```

- Devuelve los links de la clínica del actor cuyo estado efectivo es pendiente (no vencidos), de más nuevo a más viejo, hasta 100.
- El administrador ve los de toda la clínica; quien solo es médico, solo los que generó (FR-022).
- Un link cuyo emisor perdió vigencia (membresía desactivada) o cuya clínica está suspendida no se lista como pendiente (FR-023).
- Lanza `InvitationForbiddenError` si el actor no puede invitar.

```ts
interface InvitationSummary {
  id: string;
  kind: "DOCTOR" | "PATIENT";
  email: string;
  expiresAt: Date;
  createdAt: Date;
  sentAt: Date | null;      // null = el envío falló
  createdByName: string;    // para que el administrador vea quién lo generó
}
```

No incluye el token, su hash, el documento ni la matrícula.

## `revokeInvitation`

```ts
revokeInvitation(input: { actor: InvitationActor; invitationId: string }): Promise<void>
```

- Revoca un link pendiente de la clínica del actor, con motivo `BY_SENDER`. Deja de servir de inmediato (FR-021).
- Puede revocar quien lo generó, y el administrador de la clínica cualquiera de ella (research R9).
- Lanza `InvitationNotFoundError` si el link no existe, es de otra clínica, ya no está pendiente o el actor no tiene permiso sobre él, sin distinguir los casos.

## `previewInvitation`

```ts
previewInvitation(input: {
  token: string;
  account: { id: string; email: string };
}): Promise<InvitationPreview>

type InvitationPreview =
  | { status: "VALID"; kind: "DOCTOR" | "PATIENT"; tenantName: string }
  | { status: "INVALID" };
```

- `VALID` solo si el token existe, está pendiente, no venció, le quedan intentos, la clínica está activa, el emisor sigue vigente y el correo de la cuenta coincide con el del link (sin distinguir mayúsculas). En cualquier otro caso, `INVALID` (FR-024): no hay forma de saber cuál fue la causa.
- No modifica nada.

## `acceptInvitation`

```ts
acceptInvitation(input: {
  token: string;
  account: { id: string; email: string; fullName: string };
  proof: {
    documentType?: "DNI" | "PASSPORT" | "OTHER";  // paciente
    documentNumber?: string;                        // paciente
    licenseNumber?: string;                         // médico
    specialty?: string;                             // médico
  };
}): Promise<AcceptInvitationResult>
```

Resultado:
- `{ status: "ACCEPTED"; kind; tenantName; relationshipKind: "STAFF" | "PATIENT"; relationshipId: string; assignedToDoctor: boolean }`: vinculada. La acción de servidor activa el vínculo en la sesión con `selectActiveClinic` y redirige.
- `{ status: "ALREADY_MEMBER"; tenantName }`: ya pertenecía con ese tipo de vínculo; no se duplicó nada. El link se consume. Si era un link de paciente de un médico, igualmente se agrega la asignación si faltaba (spec, historia 3, escenarios 3 y 4).
- `{ status: "PROOF_MISMATCH"; attemptsLeft: number }`: el documento o la matrícula no coinciden. Si llegó a 0, el link quedó invalidado y la pantalla lo informa.
- `{ status: "CONFLICT"; reason }`:
  - `OTHER_RELATIONSHIP`: ya tiene en esa clínica el otro tipo de vínculo (FR-016).
  - `MEMBERSHIP_DEACTIVATED`: su membresía de personal está desactivada.
  - `ROLE_CHANGE_NOT_SUPPORTED`: ya es administrador de la clínica sin rol de médico y el link es de médico. No se cambia su membresía: sumar el rol de médico lo gestiona la clínica (funcionalidad 010).
  - `DOCUMENT_IN_USE`: el documento ya pertenece a otra cuenta de la clínica, o la cuenta ya tiene un registro con otro documento.
  - `LICENSE_IN_USE`: la matrícula ya pertenece a otro integrante.
- `{ status: "INVALID" }`: token inexistente, vencido, revocado, ya usado, de otra cuenta, de una clínica suspendida o de un emisor que perdió vigencia (FR-024).

Orden de las comprobaciones (importa para no filtrar información ni gastar intentos ajenos):
1. Forma del token → `INVALID`.
2. Buscar por hash y comprobar vigencia, clínica y emisor → `INVALID`.
3. Correo de la cuenta igual al del link → `INVALID`.
4. Validar los campos del tipo (`INVALID` de entrada si faltan; el formulario ya los exige).
5. Comparar el documento o la matrícula normalizados → `PROOF_MISMATCH` (cuenta el intento).
6. Transacción: bloquear la cuenta, reclamar el link (compare-and-swap) y aplicar el vínculo y la asignación; un conflicto de reglas revierte todo y devuelve `CONFLICT` sin consumir el link.

Garantías:
- Un solo éxito ante intentos simultáneos del mismo link (FR-020, SC-005).
- Ningún vínculo ni asignación duplicados.
- No modifica la cuenta ni su contraseña (FR-012).
- No registra el token, el documento ni la matrícula.

## Puertos de salida nuevos

```ts
// application/ports/out/invitation-repository.ts
interface InvitationRepository {
  createReplacing(input: NewInvitation, now: Date): Promise<InvitationRecord>;
  markSent(id: string, tenantId: string, now: Date): Promise<void>;
  listPending(input: { tenantId: string; createdByMembershipId?: string; now: Date; limit: number }): Promise<InvitationRecord[]>;
  findById(input: { tenantId: string; id: string }): Promise<InvitationRecord | null>;
  revoke(input: { tenantId: string; id: string; byUserId: string; now: Date }): Promise<boolean>;
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  registerFailedAttempt(input: { id: string; now: Date }): Promise<{ attemptsLeft: number }>;
  runAcceptance<T>(userId: string, work: (tx: AcceptanceTransaction) => Promise<T>): Promise<T>;
  findClinicFacts(input: { tenantId: string; email: string }): Promise<ClinicRelationshipFacts>;
}

// Lo único que ve el caso de uso dentro de la transacción de aceptación (ya con la cuenta bloqueada).
interface AcceptanceTransaction {
  claim(input: { id: string; now: Date; accountId: string }): Promise<boolean>;
  findRelationshipFacts(input: { tenantId: string; userId: string; documentType?: DocumentType; documentNumber?: string }): Promise<AcceptanceFacts>;
  createDoctorMembership(input: { tenantId: string; userId: string; licenseNumber: string; specialty: string }): Promise<{ membershipId: string }>;
  linkPatient(input: { tenantId: string; userId: string; fullName: string; documentType: DocumentType; documentNumber: string }): Promise<{ patientId: string }>;
  assignDoctorIfAbsent(input: { tenantId: string; membershipId: string; patientId: string; createdByUserId: string }): Promise<void>;
  isMembershipActiveDoctor(input: { tenantId: string; membershipId: string }): Promise<boolean>;
}
```

Las firmas son orientativas: la implementación puede ajustar nombres y tipos con tal de que los casos de uso no importen Prisma y los adaptadores no tomen decisiones de negocio. Los repositorios filtran siempre por `tenantId`.

```ts
// application/ports/out/invitation-mailer.ts  (ver invitation-mailer.md)
```
