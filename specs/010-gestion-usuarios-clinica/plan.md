# Implementation Plan: Gestión de usuarios de una clínica

**Branch**: `010-gestion-usuarios-clinica` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-gestion-usuarios-clinica/spec.md`

## Summary

El administrador de una clínica ve a su personal y a sus pacientes (por páginas), da de alta a médicos y pacientes sin link, asigna y quita médicos a pacientes existentes, y da de baja y reactiva vínculos. El médico da de alta a pacientes, que quedan asignados a él, y sigue viendo a sus pacientes en la lista de la 006. Todo vive en el módulo `users`; no hay módulo nuevo.

Decisiones centrales (detalle y alternativas en [research.md](research.md)):

- **Alta con cuenta nueva:** el puerto `IdentityProvider` suma `provisionAccount`, que crea la cuenta como un registro propio (misma vía que la 002: la persona verifica su correo con el código de Cognito y define su contraseña en `/verify-email`) y devuelve el `subject`. Con él se crea la cuenta propia y el vínculo en una sola transacción de base de datos. Una cuenta que ya existe se vincula sin tocar a Cognito.
- **Mismas reglas que la 009:** la lógica de «aplicar un vínculo» (compatibilidad, matrícula y documento únicos, reutilizar el paciente revocado, asignación) se extrae de `accept-invitation.ts` a una función compartida que usan tanto aceptar un link como el alta directa.
- **Baja inmediata sin mecanismo nuevo:** la sesión ya se resuelve en cada solicitud contra el estado del vínculo; desactivar o revocar corta el acceso en la siguiente acción. Solo se agrega la prueba que lo demuestra.
- **Último administrador:** la baja se hace en una transacción que bloquea la fila de la clínica y cuenta los demás administradores activos, así dos bajas simultáneas no dejan a la clínica sin ninguno.
- **Registro de gestión:** una tabla nueva `clinic_user_events` (único cambio de base de datos) con quién, cuándo y sobre quién de cada alta, asignación, baja y reactivación.
- **Correo:** el puerto `InvitationMailer` suma un método de aviso de alta; los adaptadores `smtp` y `fake` lo implementan.
- **Un único cambio de infraestructura:** el usuario de la aplicación necesita `cognito-idp:AdminGetUser` (hoy solo tiene `AdminSetUserPassword`) para leer el `subject` de una cuenta ya existente en Cognito que todavía no ingresó. Queda escrito en Terraform; lo aplica el responsable.
- **Administradores:** el alta directa no los crea (clarificado). No se construye nada nuevo: sigue el `seed` y, más adelante, la plataforma de administración global (R7).

## Technical Context

**Language/Version**: TypeScript estricto sobre Node 24; Next.js 16.4.4 (App Router, Server Actions), React 19.3.

**Primary Dependencies**: las existentes (`@aws-sdk/client-cognito-identity-provider` ya instalado, `nodemailer`, `zod`, Prisma). Ninguna nueva.

**Storage**: PostgreSQL con Prisma: tabla nueva `clinic_user_events`, un enumerado nuevo y un `CHECK` escrito a mano en la migración. Las tablas de membresías, pacientes, asignaciones e invitaciones no cambian de forma.

**Testing**: Vitest (unidad e integración con la base local), Playwright (extremo a extremo con el correo simulado y el proveedor de identidad simulado). Cobertura mínima del 80 % por archivo en `src/modules` y `src/infrastructure`.

**Target Platform**: navegador moderno en móvil, tablet y escritorio; servidor Node (EC2 en producción, proceso local en desarrollo).

**Project Type**: aplicación web (monolito modular hexagonal).

**Performance Goals**: primera página de cualquier lista en menos de 2 s con 500 personas (SC-007); alta en menos de 3 s con los servicios simulados.

**Constraints**: la clínica sale siempre del contexto autenticado; la respuesta del alta no revela si el correo tenía cuenta; ninguna contraseña, código, documento ni matrícula en los registros; el alta es todo o nada en la base de datos; la baja corta el acceso en la siguiente acción.

**Scale/Scope**: 1 tabla y 1 enumerado nuevos; 1 módulo ampliado (`users`); 8 casos de uso nuevos (listar personal, listar pacientes, listar médicos activos, dar de alta, reenviar acceso, asignar, quitar asignación y cambiar el estado de un vínculo, que cubre desactivar, reactivar, revocar y reactivar paciente); 1 puerto nuevo (`ClinicMemberRepository`) y 2 ampliados (`IdentityProvider`, `InvitationMailer`); 2 pantallas nuevas (`/users`, `/users/new`) y un enlace en el inicio.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Apoyo clínico, no diagnóstico**: no aplica; no se producen ni muestran resultados de IA.
- **II. Aislamiento multi-tenant**: pasa. Toda operación recibe un actor armado en `src/app/` desde el contexto de acceso; el `tenantId` nunca viene del cliente; los identificadores que sí vienen del cliente (membresía, paciente, asignación) se buscan siempre con `tenant_id` del actor, y uno ajeno da el mismo resultado que uno inexistente. El administrador de plataforma que no pertenece a la clínica no tiene actor. Pruebas de integración de rechazo desde otra clínica para listar, dar de alta, asignar, dar de baja y reactivar.
- **III. Hexagonal pragmática**: pasa. Casos de uso en `application`, reglas puras en `domain` (permisos, baja, último administrador, asignación), puerto `ClinicMemberRepository` con su adaptador de Prisma. No se crean abstracciones sin necesidad: el actor y los permisos de la 009 se reutilizan, y la lógica de vínculo se comparte en vez de duplicarse. Las acciones solo validan y delegan.
- **IV. Trazabilidad de los análisis / V. Extensibilidad**: no aplican.
- **VI. Datos clínicos**: pasa. Las listas muestran solo nombre, correo, documento y estado; el correo de aviso no lleva documento, matrícula ni datos clínicos; el registro de gestión no guarda documento, matrícula ni correo.
- **VII. Interfaz**: pasa. Tokens semánticos, modo claro y oscuro, móvil/tablet/escritorio, teclado y foco visibles, estados con texto además de color, confirmación en bajas y en quitar asignaciones (FR-031).
- **VIII. Código limpio**: pasa. Datos externos validados con `zod` en el borde; sin `any`.
- **Stack aprobado**: pasa. No cambia ninguna tecnología ni se necesita una enmienda: Cognito y SMTP ya están aprobados.
- **Restricciones**: `prisma migrate` y `generate` los ejecuta solo el responsable; `terraform apply` también.

**Re-evaluación posterior al diseño**: sin cambios. Ninguna violación que justificar.

## Project Structure

### Documentation (this feature)

```text
specs/010-gestion-usuarios-clinica/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── clinic-user-use-cases.md
│   ├── identity-and-mail.md
│   ├── clinic-user-ui.md
│   └── permissions.md
└── tasks.md             # lo genera speckit-tasks
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                                   # + enum ClinicUserAction, model ClinicUserEvent
└── migrations/<fecha>_add_clinic_user_events/      # el responsable la genera; CHECK a mano

infra/
├── modules/identity/main.tf                        # + cognito-idp:AdminGetUser en la política del usuario de la aplicación
├── bootstrap/permissions-boundary.tf               # + la misma acción en el límite
└── (pruebas .tftest.hcl existentes: se ajustan)

src/modules/users/
├── domain/
│   ├── clinic-user-rules.ts                        # baja: no a uno mismo, no al último administrador; reglas de asignación
│   └── clinic-user-events.ts                       # acciones del registro de gestión
├── application/
│   ├── ports/out/
│   │   ├── clinic-member-repository.ts             # listas, estados, asignaciones, transacciones, eventos
│   │   ├── identity-provider.ts                    # + provisionAccount
│   │   ├── invitation-mailer.ts                    # + sendAccessNotice
│   │   └── user-repository.ts                      # + findByEmail
│   ├── use-cases/
│   │   ├── apply-relationship.ts                   # extraído de accept-invitation.ts, compartido
│   │   ├── enroll-member.ts
│   │   ├── resend-access.ts
│   │   ├── list-clinic-staff.ts
│   │   ├── list-clinic-patients.ts
│   │   ├── list-active-doctors.ts
│   │   ├── assign-doctor.ts
│   │   ├── unassign-doctor.ts
│   │   ├── change-member-status.ts                 # desactivar/reactivar personal, revocar/reactivar paciente
│   │   └── render-access-notice.ts
│   └── validation/clinic-user-form-schemas.ts
├── infrastructure/
│   ├── repositories/
│   │   ├── prisma-clinic-member-repository.ts
│   │   └── relationship-transaction.ts             # constructor de la transacción, extraído del repositorio de invitaciones
│   └── adapters/                                   # smtp y fake: + sendAccessNotice; in-memory identity: + provisionAccount
└── composition.ts                                  # + los casos de uso nuevos

src/infrastructure/aws/cognito/cognito-identity-provider.ts   # + provisionAccount (SignUp y AdminGetUser)

src/app/(dashboard)/
├── users/page.tsx                                  # listas con pestañas y paginación
├── users/new/page.tsx                              # alta
├── _users/_actions/                                # enroll, resend, assign, unassign, change-status
├── _users/_components/                             # tablas, formulario de alta, diálogos de confirmación
├── _users/_lib/user-messages.ts
└── page.tsx                                        # + enlace «Usuarios»

tests/
├── unit/modules/users/application/                 # un archivo por caso de uso
├── unit/modules/users/domain/clinic-user-rules.test.ts
├── unit/app/users/                                 # acciones y componentes
├── integration/clinic-users/                       # rechazo desde otra clínica, concurrencia, baja con sesión, último administrador
├── e2e/clinic-users.spec.ts
└── support/                                        # escenario de clínica con personal y pacientes
```

**Structure Decision**: se amplía el módulo `users` existente, igual que la 009. La lógica de vínculo compartida se extrae de `accept-invitation.ts` en lugar de duplicarse. Las pantallas viven bajo `src/app/(dashboard)/users` y los componentes y acciones privados en `_users`, como `_invitations`.

## Complexity Tracking

Sin violaciones de la constitución. La única complejidad añadida a conciencia es el puerto `ClinicMemberRepository`, que agrupa lecturas y escrituras que no caben en `InvitationRepository`; se justifica en R2.
