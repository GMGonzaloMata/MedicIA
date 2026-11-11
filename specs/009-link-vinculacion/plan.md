# Implementation Plan: Link de vinculación a una clínica

**Branch**: `009-link-vinculacion` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-link-vinculacion/spec.md`

## Summary

El administrador de una clínica (médicos y pacientes) y el médico (solo pacientes) invitan a una persona por correo. La plataforma guarda la invitación (tabla nueva `invitations`, con el hash del token y no el token), envía el link por SMTP (una cuenta de Gmail dedicada con contraseña de aplicación, por ahora) a través de un puerto `InvitationMailer` (adaptadores `smtp` y `fake`, elegidos por `INVITATION_MAILER`) y nunca lo muestra en pantalla. El link abre `/invite/<token>`, que guarda el token en una cookie corta y redirige a `/invitation`; así sobrevive al registro y al ingreso de la 002 sin quedar en la URL. Para vincularse, la persona debe tener sesión con el correo del link y volver a escribir el documento (paciente) o la matrícula (médico) que cargó quien invitó, con un máximo de 5 intentos. La aceptación es una transacción que reclama el link con una actualización condicional (un solo uso aunque haya dos intentos a la vez), bloquea la fila de la cuenta para hacer cumplir el vínculo único por clínica, y crea la membresía de médico o el registro de paciente y, si invitó un médico, la asignación. Todo vive en el módulo `users`; no hay módulo nuevo. No hay cambios de infraestructura. Decisiones y alternativas en [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript estricto sobre Node 24; Next.js 16.4.4 (App Router, Server Actions, Route Handlers, `proxy`), React 19.3.

**Primary Dependencies**: las existentes más una nueva, `nodemailer` (con sus tipos de desarrollo), en una versión exacta fijada al instalarla. `zod` ya instalado.

**Storage**: PostgreSQL con Prisma: tabla nueva `invitations`, tres enumerados nuevos, un índice único parcial y `CHECK` escritos a mano en la migración. Las tablas de membresías, pacientes y asignaciones no cambian.

**Testing**: Vitest (unidad e integración con la base local), Playwright (extremo a extremo con el correo simulado). Cobertura mínima del 80 % por archivo en `src/modules` y `src/infrastructure`.

**Target Platform**: navegador moderno en móvil, tablet y escritorio; servidor Node (EC2 en producción, proceso local en desarrollo).

**Project Type**: aplicación web (monolito modular hexagonal).

**Performance Goals**: generar una invitación y enviar el correo en menos de 3 s con el correo simulado (el real depende del servidor SMTP); aceptar en menos de 1 s; recorrido completo de una persona nueva en menos de 5 minutos desde que tiene el código de verificación (SC-001).

**Constraints**: el token y el link nunca se guardan ni se registran; la dirección base del link sale de `APP_BASE_URL`, no del encabezado de la solicitud; 7 días de vigencia; 5 intentos por link; el correo del link debe coincidir con el de la cuenta; ninguna GET cambia el estado de un link.

**Scale/Scope**: 1 tabla, 3 enumerados, 1 módulo existente ampliado (`users`), 5 casos de uso (generar, listar, revocar, previsualizar y aceptar), 2 puertos de salida nuevos con 3 adaptadores (repositorio de Prisma, correo `smtp` y `fake`), 1 Route Handler, 2 pantallas nuevas y cambios menores en 4 pantallas y acciones existentes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Apoyo clínico, no diagnóstico**: no aplica; la funcionalidad no produce ni muestra resultados de IA.
- **II. Aislamiento multi-tenant**: pasa. El `tenantId` sale del actor autenticado y nunca del formulario; toda consulta de `invitations` lleva la clínica; una clave foránea compuesta impide un link en una clínica distinta de la de su emisor; un link ajeno, de otra clínica o inexistente da el mismo resultado; aceptar valida clínica activa y emisor vigente. Prueba de integración de rechazo desde otra clínica para generar, listar, revocar y aceptar.
- **III. Hexagonal pragmática**: pasa. Casos de uso en `application`, reglas en `domain` (normalización, compatibilidad de vínculos, vigencia, permisos), puertos `InvitationRepository` e `InvitationMailer`, adaptadores en `infrastructure`. Las acciones de servidor y el Route Handler solo validan y delegan; las cookies y las redirecciones viven en `src/app/`. No se crea un módulo nuevo (R7). El dominio no importa Next.js, Prisma ni `nodemailer`.
- **IV. Trazabilidad de los análisis**: no aplica.
- **V. Extensibilidad**: no aplica.
- **VI. Datos clínicos**: pasa. Las invitaciones guardan solo correo, documento o matrícula y vínculo; el correo no incluye datos clínicos ni el documento ni la matrícula; el documento y la matrícula funcionan además como segunda comprobación contra un correo mal escrito (R4); ningún dato sensible, token ni link se registra.
- **VII. Interfaz**: pasa. Tokens de diseño, claro y oscuro, tres anchos, teclado, foco visible, estados con texto además de color (`contracts/invitation-ui.md`).
- **VIII. Código tipado**: pasa. Sin `any`; los datos de formularios, la cookie, el token y las variables de entorno se validan con zod al entrar; `invitationId` se valida como UUID.
- **Restricciones técnicas (stack aprobado)**: **requiere decisión del responsable.** el envío de correo por SMTP no figura en el stack de la constitución. No cambia ninguna tecnología aprobada, pero agrega una dependencia fuera de la lista (R1). Se propone una enmienda MINOR (1.6.1 → 1.7.0): agregar "Correo transaccional: servidor SMTP, consumido mediante un adaptador; en esta etapa, una cuenta de Gmail dedicada con contraseña de aplicación", y actualizar `memory/architecture.md` y `memory/project-structure.md`. Hasta que el responsable la apruebe, el plan se considera condicionado y la primera tarea es esa enmienda.
- **Infraestructura**: sin cambios; no hay recursos de AWS nuevos. El único secreto nuevo, la contraseña de aplicación de la cuenta de correo, vive en `.env.local` o en el entorno del servidor, fuera de git y de los registros.
- **Comandos reservados**: la migración de Prisma (`migrate`, `db`, `generate`) la ejecuta el responsable; las tareas lo indican y se detienen. El agente no hace `git commit`.
- **Next.js**: se relee la guía de `node_modules/next/dist/docs/` (Route Handlers, `cookies()`, Server Actions, `proxy`) antes de escribir el código (R13).

**Re-evaluación tras el diseño (Phase 1)**: sin cambios. El diseño no agrega capas ni abstracciones más allá de los dos puertos que la funcionalidad necesita. La única condición abierta es la enmienda por el servicio de correo.

## Project Structure

### Documentation (this feature)

```text
specs/009-link-vinculacion/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── invitation-use-cases.md
│   ├── invitation-mailer.md
│   ├── invitation-ui.md
│   └── permissions.md
├── checklists/requirements.md
└── tasks.md             # lo genera speckit-tasks
```

### Source Code (repository root)

```text
prisma/schema.prisma                         # + enumerados, model Invitation, relaciones inversas
prisma/migrations/<fecha>_add_invitations/   # SQL con el índice único parcial y los CHECK (a mano)

src/modules/users/
├── domain/
│   ├── invitation.ts                        # tipos, estados, vigencia efectiva, constantes (7 días, 5 intentos)
│   ├── invitation-token.ts                  # generar, hashear y validar la forma del token
│   ├── invitation-proof.ts                  # normalización y comparación del documento y la matrícula
│   ├── relationship-compatibility.ts        # regla del vínculo único por clínica
│   ├── invitation-access.ts                 # actor y permisos de invitar, listar y revocar
│   └── invitation-errors.ts                 # InvitationForbiddenError, InvitationNotFoundError, MailDeliveryError…
├── application/
│   ├── ports/out/{invitation-repository,invitation-mailer}.ts
│   ├── use-cases/{create-invitation,list-invitations,revoke-invitation,preview-invitation,accept-invitation}.ts
│   ├── use-cases/render-invitation-email.ts # asunto, texto y HTML (función pura)
│   └── validation/invitation-form-schemas.ts
├── infrastructure/
│   ├── adapters/{smtp-invitation-mailer,fake-invitation-mailer,create-invitation-mailer}.ts
│   └── repositories/prisma-invitation-repository.ts
└── composition.ts                           # + las cinco operaciones

src/shared/constants/invitation-cookie.ts
src/shared/utils/route-access.ts             # + /invite público

src/app/invite/[token]/route.ts              # guarda la cookie y redirige
src/app/_lib/{invitation-cookie,invitation-actor}.ts
src/app/(auth)/_actions/sign-in.ts           # + redirige a /invitation si hay una pendiente
src/app/(auth)/{sign-in,sign-up}/page.tsx    # + aviso de la invitación (dentro de <Suspense>)
src/app/(auth)/_components/invitation-notice.tsx
src/app/(dashboard)/no-access/page.tsx       # + continuar con la invitación
src/app/(dashboard)/page.tsx                 # + enlace «Invitaciones»
src/app/(dashboard)/invitation/page.tsx      # aceptar
src/app/(dashboard)/invitations/page.tsx     # invitar y ver pendientes
src/app/(dashboard)/_invitations/
├── _actions/{create-invitation,revoke-invitation,accept-invitation}.ts
├── _components/{invite-form,pending-invitations,accept-invitation-form}.tsx
└── _lib/invitation-messages.ts

tests/
├── unit/modules/users/{domain,application,infrastructure}/…   # incluye no-invitation-data-in-logs
├── unit/app/invitations/…                   # acciones, cookie, actor, mensajes
├── unit/shared/utils/route-access.test.ts   # + /invite
├── integration/invitations/{invitation-repository,accept-concurrency,relationship-rule,invitation-access,schema-constraints}.test.ts
├── support/in-memory/{in-memory-invitation-repository,fake-invitation-mailer}.ts
└── e2e/invitations.spec.ts

memory/{architecture,project-structure}.md   # actualizar al implementar
.specify/memory/constitution.md              # enmienda 1.7.0 (con aprobación del responsable)
```

**Structure Decision**: las invitaciones se agregan al módulo `users` porque escriben en las tablas que ese módulo ya define (membresía, paciente, asignación) y porque el responsable lo pidió así; un módulo aparte exigiría una composición cruzada sin ganar nada (R7). La pantalla de aceptar y la de invitar viven en el grupo `(dashboard)`, junto a `no-access` y `select-clinic`, y sus acciones y componentes en `_invitations/`, como `_studies/`. El Route Handler `/invite/[token]` queda fuera de `(dashboard)` porque debe ser público y no usa el layout con el encabezado de clínica.

## Complexity Tracking

Una decisión que requiere aprobación del responsable, no una violación consumada:

- **Servicio de correo fuera del stack aprobado (SMTP con una cuenta de Gmail dedicada).** Por qué hace falta: la funcionalidad exige que la plataforma envíe un correo con un link propio, y Cognito solo envía sus mensajes de verificación y recuperación con plantillas fijas (R1). Alternativa más simple descartada: mostrar el link a quien invita para que lo reenvíe; el responsable decidió en la clarificación que el envío sea automático. Alternativa descartada por ahora: Amazon SES, que es lo correcto para producción pero exige modo de prueba con destinatarios verificados, un módulo de Terraform y un dominio (R1); queda como el siguiente adaptador cuando haya una clínica real. Si no se aprueba la enmienda, hay que volver a decidir el medio de envío antes de implementar.
