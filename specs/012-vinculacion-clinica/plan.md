# Implementation Plan: Vinculación de personal y pacientes a una clínica

**Branch**: `feat/vinculacion-clinica` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-vinculacion-clinica/spec.md`

## Summary

Hoy el modelo de datos tiene clínicas, personal, pacientes y asignaciones, pero ninguna forma de crearlos desde la aplicación: solo el script de siembra. Este plan agrega un módulo `tenants` con la administración de la clínica y las dos vías de vinculación:

- **Personal:** el administrador invita por correo; la persona acepta con su cuenta (token de un solo uso, 7 días, atado a su correo verificado).
- **Pacientes:** el administrador los registra y recibe un código de un solo uso que se lo entrega al paciente; el paciente se vincula con documento y código (5 intentos por código y límite por cuenta).
- **Operación:** asignar pacientes a médicos, desactivar y reactivar miembros, terminar asignaciones, sin borrar historial, y dejar siempre un administrador activo.

La creación de la clínica queda fuera de alcance (la hace el equipo de la plataforma). Se agregan tres tablas y dos columnas, un puerto de correo con adaptadores SMTP y simulado, cuatro pantallas y sus acciones. El efecto inmediato de desactivar un miembro ya existe: la sesión revalida el estado de la membresía en cada solicitud.

## Technical Context

**Language/Version**: TypeScript en modo `strict` sobre Node.js; Next.js 16.4.5 y React 19.3.0 (App Router, Server Actions)

**Primary Dependencies**: Prisma 7 con `@prisma/adapter-pg`, zod 4, `node:crypto` para tokens y códigos. **Nueva:** `nodemailer` (con `@types/nodemailer`) para el adaptador SMTP, que requiere una enmienda de la constitución (ver Complexity Tracking).

**Storage**: PostgreSQL (RDS). Tres tablas nuevas (`staff_invitations`, `patient_link_codes`, `patient_link_attempts`) y dos columnas en `staff_memberships`. Detalle en [data-model.md](data-model.md).

**Testing**: Vitest (`tests/unit/`, `tests/integration/` con la base de `docker-compose.yml`) y Playwright (`tests/e2e/`) con el correo simulado.

**Target Platform**: aplicación web en Node.js sobre Amazon EC2, con navegadores en móvil, tablet y escritorio.

**Project Type**: aplicación web full-stack (monolito modular).

**Performance Goals**: las operaciones de administración responden en menos de 1 s en la demo (consultas con índices por clínica). Las metas de uso están en SC-001 y SC-002 de la spec.

**Constraints**: aislamiento entre clínicas sin excepciones salvo las dos lecturas sin clínica previa justificadas abajo; ningún dato personal en registros; el envío del correo no debe bloquear la creación de la invitación; los comandos de Prisma los ejecuta el responsable.

**Scale/Scope**: decenas de miembros y miles de pacientes por clínica; unas pocas invitaciones y códigos por día.

## Constitution Check

*GATE: debe pasar antes de la investigación (Fase 0) y revisarse tras el diseño (Fase 1).*

| Principio / regla | Evaluación |
|---|---|
| I. Apoyo clínico, no diagnóstico | **Pasa.** No hay resultados clínicos ni textos de hallazgos. Las pantallas no usan lenguaje diagnóstico. |
| II. Aislamiento multi-tenant | **Pasa con dos lecturas justificadas.** Toda operación de administración toma la clínica del contexto autenticado y restringe cada consulta por `tenant_id`. Las dos excepciones —buscar una invitación por `token_hash` y buscar a un paciente por documento y código— ocurren cuando la persona aún no pertenece a ninguna clínica; la clínica sale del registro encontrado, nunca del cliente, y todo fallo devuelve una respuesta uniforme. Se verifica con una prueba de integración de rechazo entre clínicas **por cada** operación. |
| III. Arquitectura hexagonal pragmática | **Pasa.** Módulo `tenants` con dominio, aplicación (casos de uso y puertos), infraestructura (repositorios de Prisma y adaptadores de correo) y `composition.ts`. Las acciones solo validan, resuelven el actor y delegan. Se evita crear un módulo más: `users` no cambia. |
| IV y V. Trazabilidad y extensibilidad de análisis | **No aplica.** No toca análisis ni modelos. |
| VI. Datos clínicos | **Pasa.** El padrón de pacientes guarda solo el documento (el nombre lo completa el paciente al vincular); ningún dato clínico. Se respeta la regla de que un administrador que no es médico no accede a los estudios. |
| VII. Interfaz consistente | **Pasa por diseño.** Tokens semánticos, modo claro y oscuro, responsiva, accesible por teclado. Se verifica en las tareas de interfaz. |
| VIII. Código tipado y verificable | **Pasa.** `strict`, sin `any`, datos de formularios y de entorno validados con zod. |
| Stack aprobado | **VIOLACIÓN justificada (bloqueante).** Enviar correos exige un servicio que el stack no incluye. Ver Complexity Tracking. No se implementa el adaptador real hasta que el responsable apruebe la enmienda. El puerto y el adaptador simulado no la necesitan. |
| Pruebas | **Pasa.** Tarea compleja: cobertura de líneas ≥ 80 % en el código nuevo; integración de rechazo entre clínicas por operación; E2E de los flujos. Todas en `tests/`. |
| Comandos reservados | **Pasa.** Migración, `git commit` y Terraform los ejecuta el responsable. Esta funcionalidad no necesita Terraform. |

**Re-evaluación tras el diseño (Fase 1):** sin cambios. El diseño no suma excepciones nuevas: las dos lecturas sin clínica previa quedaron acotadas y documentadas (research D3 y D4), y el efecto inmediato de la desactivación reutiliza lo que ya hace `resolveCurrentSession`.

## Project Structure

### Documentation (this feature)

```text
specs/012-vinculacion-clinica/
├── plan.md              # Este archivo
├── research.md          # Decisiones técnicas (Fase 0)
├── data-model.md        # Tablas, columnas, estados y relaciones (Fase 1)
├── quickstart.md        # Recorridos de validación (Fase 1)
├── contracts/
│   ├── use-cases.md             # Casos de uso del módulo tenants
│   ├── screens-and-actions.md   # Pantallas, acciones y variables de entorno
│   └── invitation-email.md      # Contenido y reglas del correo
├── checklists/
│   └── requirements.md          # Calidad de la especificación
└── tasks.md             # Lo genera speckit-tasks (no se crea acá)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                         # + StaffInvitation, PatientLinkCode, PatientLinkAttempt, columnas de StaffMembership
└── migrations/<fecha>_clinic_linking/    # la genera y aplica el responsable

src/
├── modules/tenants/
│   ├── domain/                           # roles, correo y documento normalizados, invitación, código, actor administrador
│   ├── application/
│   │   ├── use-cases/                    # invite-staff, list-staff, revoke/resend-invitation, deactivate/reactivate-member,
│   │   │                                 # accept-staff-invitation, register-patient, list-clinic-patients,
│   │   │                                 # regenerate-patient-link-code, assign-patient, end-assignment,
│   │   │                                 # link-patient-account, get-attending-doctor-availability
│   │   └── ports/out/                    # staff-, invitation-, patient-registry-, assignment-, link-attempt-repository, invitation-mailer, secret-generator
│   ├── infrastructure/
│   │   ├── repositories/                 # implementaciones con Prisma
│   │   └── adapters/                     # smtp-invitation-mailer, fake-invitation-mailer, create-invitation-mailer, node-secret-generator
│   └── composition.ts
├── app/
│   ├── _lib/clinic-admin-actor.ts        # contexto de acceso -> actor administrador (null si no es administrador)
│   └── (dashboard)/
│       ├── clinic/
│       │   ├── staff/page.tsx            # personal e invitaciones
│       │   ├── patients/page.tsx         # padrón de pacientes y asignaciones
│       │   ├── _actions/                 # acciones de administración
│       │   ├── _components/
│       │   └── _lib/clinic-messages.ts   # textos de pantalla
│       ├── invitation/[token]/page.tsx   # aceptar una invitación
│       ├── link-patient/page.tsx         # vincular un paciente
│       ├── studies/page.tsx              # + aviso de médico no disponible
│       ├── no-access/page.tsx            # + enlace a vincular paciente
│       └── _components/clinic-header.tsx # + navegación del administrador
└── shared/constants/                     # sin cambios (las rutas nuevas son protegidas por defecto)

tests/
├── unit/modules/tenants/                 # dominio y casos de uso con repositorios en memoria
├── unit/app/                             # actor administrador y mensajes
├── integration/tenants/                  # repositorios, unicidad, último administrador, límites y rechazo entre clínicas
├── e2e/clinic-linking.spec.ts            # invitar, aceptar, registrar y vincular paciente, asignar, desactivar
└── support/in-memory/                    # repositorios y correo en memoria
```

**Structure Decision**: aplicación web full-stack ya existente; un módulo de negocio nuevo (`tenants`, que ya figuraba en `memory/project-structure.md`) más pantallas bajo `src/app/(dashboard)/`. No se crean proyectos ni capas adicionales. `memory/architecture.md` y `memory/project-structure.md` se actualizan al implementar (sección del módulo, variables de entorno, rutas y la dependencia de correo).

## Complexity Tracking

| Violación | Por qué se necesita | Alternativa más simple descartada porque |
|---|---|---|
| **Enmienda del stack aprobado:** sumar «correo transaccional por SMTP, detrás de un puerto» y la dependencia `nodemailer` (constitución 1.6.1 → 1.7.0, MINOR) | La invitación del personal es por correo (decisión del responsable). El stack aprobado no incluye ningún servicio de envío; Cognito solo manda sus propios mensajes de verificación. El responsable ya tiene una cuenta SMTP configurada. | Mostrar el enlace al administrador para que lo envíe por su cuenta cambia lo decidido. Amazon SES exige infraestructura, un remitente verificado y salir del modo de prueba, innecesarios para la demo. El puerto permite pasar a SES después sin tocar el negocio. **Requiere aprobación del responsable**; no se modifica la constitución en este plan. |
| **Dos lecturas sin clínica previa** (invitación por `token_hash`, paciente por documento y código) | Quien acepta o se vincula todavía no pertenece a una clínica, así que no hay `tenant_id` del contexto. | Pedirle la clínica al cliente violaría el principio II. La clínica sale del registro encontrado y toda falla es uniforme y limitada. |
| **Tabla de intentos fallidos por cuenta** | El límite de intentos por código no cubre a quien prueba muchos documentos; hace falta un límite por cuenta. | Un contador en memoria no sobrevive a un reinicio ni a más de un proceso. |
