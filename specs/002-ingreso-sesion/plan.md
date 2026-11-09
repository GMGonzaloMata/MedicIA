# Implementation Plan: Ingreso y sesión

**Branch**: `002-ingreso-sesion` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-ingreso-sesion/spec.md`

## Summary

Permitir que una persona cree una cuenta con correo verificado, inicie y cierre sesión, recupere su contraseña y elija la clínica activa entre sus vínculos vigentes, y que cada solicitud posterior sepa quién es y en qué clínica trabaja, revalidando el vínculo en el servidor. Es el primer módulo hexagonal real (`users`) y fija el patrón de los siguientes.

El enfoque técnico, detallado en [research.md](research.md):

- **Identidad en Cognito, sesión propia.** Las pantallas son de la aplicación y las Server Actions hablan con Cognito. Al iniciar sesión se valida el ID token y se lo descarta (R2, R3).
- **Sesión en la base de datos con cookie opaca.** Una tabla `sessions` nueva, con el hash del identificador, vencimientos y la clínica activa como vínculo verificado (R1, R5).
- **Revalidación en cada solicitud, sin caché.** Un solo punto de entrada, `getAccessContext`, que todas las acciones y pantallas usan (R6). El `proxy` solo hace una comprobación optimista.
- **Respuestas uniformes** que no revelan si un correo tiene cuenta (R4).
- **Proveedor simulado** del servicio de identidad, con resguardos, para desarrollar y probar sin AWS (R11).
- **Cambio de contraseña** invalida las sesiones anteriores con `sessionsValidFrom` (R8).

## Technical Context

**Language/Version**: TypeScript 5 con `strict`, sobre Node.js 24.

**Primary Dependencies**: Next.js 16.4.4 (`cacheComponents` activo), React 19.3.0, Prisma 7.10.1 (instalados). A agregar, con aprobación del responsable (R15): `@aws-sdk/client-cognito-identity-provider` 3.1164.0, `aws-jwt-verify` 5.2.1 y `zod` 4.6.7.

**Storage**: PostgreSQL mediante Prisma. Una tabla nueva (`sessions`) y dos unicidades en tablas existentes ([data-model.md](data-model.md)).

**Testing**: Vitest (proyectos `unit` e `integration`, 80 % de líneas por archivo en `src/modules`, `src/infrastructure` y `src/shared`) y Playwright. Las pruebas de integración usan la base local de Docker.

**Target Platform**: servidor Node.js en Amazon EC2; identidad en Amazon Cognito.

**Project Type**: aplicación web full-stack (monolito modular con Next.js). Toca persistencia, aplicación, infraestructura y presentación.

**Performance Goals**: la resolución del contexto de acceso es una sola consulta por solicitud y usa índices existentes. Objetivo interno: menos de 50 ms con la base local, medido en las pruebas de integración. No hay un criterio de éxito de la spec que lo exija.

**Constraints**:
- Ningún agente ejecuta `prisma migrate`, `prisma db` ni `prisma generate`, ni `git commit`.
- `tenantId` sale solo del contexto verificado (constitución II).
- Ningún dato sensible (contraseña, código, token, cookie, correo) en los registros de actividad (FR-028).
- La sesión no se cachea en ninguna variante de `use cache` (R6).
- `.env.example` y `.env*` están protegidos contra escritura de los agentes: los actualiza el responsable.
- Las cookies se escriben solo en Server Actions y Route Handlers.

**Scale/Scope**: una tabla nueva y dos unicidades, un módulo hexagonal (`users`) con 10 casos de uso, un adaptador de Cognito y uno simulado, 8 pantallas, 9 acciones, `proxy.ts`, y pruebas unitarias, de integración y E2E.

## Constitution Check

*GATE: debe pasar antes de la investigación (Fase 0) y revisarse después del diseño (Fase 1).*

- **I. Apoyo clínico, no diagnóstico:** no aplica; no hay resultados de IA. **Cumple.**
- **II. Aislamiento multi-tenant (no negociable):** **cumple.**
  - El `tenantId` se deduce del vínculo activo verificado de la sesión; el cliente solo envía un identificador opaco de vínculo que se comprueba contra la persona (R5).
  - La clave foránea compuesta impide que una sesión apunte al vínculo de otra persona.
  - Cada Server Action y Route Handler autentica y autoriza por su cuenta; el `proxy` no es la defensa (R6).
  - Hay pruebas de integración de rechazo desde otra clínica (R16).
- **III. Arquitectura hexagonal pragmática:** **cumple.**
  - El dominio de `users` no importa Next, Prisma ni AWS. Los casos de uso reciben por inyección los puertos (identidad, sesiones, usuarios, acceso a clínicas) y una función `now`.
  - Cognito entra por un adaptador, y Prisma solo en repositorios.
  - Las acciones y pantallas solo orquestan: validan la forma, llaman al caso de uso y manejan cookies y redirecciones, que son cosas de Next.
  - No se agregan abstracciones sin necesidad: la generación y el hash del identificador de sesión son funciones del dominio, sin puerto.
- **IV. Trazabilidad de los análisis:** no aplica.
- **V. Extensibilidad por estudio y modelo:** no aplica.
- **VI. Tratamiento responsable de datos clínicos:** **cumple.** No se guardan datos clínicos. La sesión guarda un hash, no el identificador; los tokens de Cognito no se guardan; los registros no llevan datos personales; las sesiones se conservan como evidencia.
- **VII. Interfaz consistente, responsiva y accesible:** **cumple por diseño.** Tokens semánticos, modo claro y oscuro, tres tamaños, teclado, foco, y errores con texto además de color, verificados en las pruebas E2E por proyecto (escritorio, tablet, móvil).
- **VIII. Código limpio, tipado y verificable:** **cumple.** Entradas validadas con `zod` en el borde (formularios y variables de entorno), tipos de dominio propios que no exponen los de Prisma ni los de AWS, uniones cerradas para el contexto y para los errores, sin `any`.
- **Stack aprobado:** Cognito, Prisma y PostgreSQL están aprobados. Las tres dependencias nuevas se listan para aprobación.
- **"La aplicación DEBE validar los JWT y autorizar cada operación":** **cumple, con la interpretación aprobada por el responsable.** Se valida el ID token al iniciar sesión y se autoriza cada operación contra la sesión de la base (R2).
- **Comandos reservados:** el plan no requiere que ningún agente ejecute `git commit`, `prisma migrate`, `prisma db` ni `prisma generate`. La migración la genera y aplica el responsable.

**Resultado:** sin violaciones. La interpretación de "validar los JWT" y las tres dependencias nuevas fueron aprobadas por el responsable.

## Aprobaciones del responsable

Aprobadas el 2026-11-09, delegando el criterio técnico en el plan:

1. **Interpretación de la constitución (R2):** validar el JWT de Cognito al iniciar sesión y autorizar cada operación con una sesión propia. `memory/architecture.md` ya quedó actualizado.
2. **Dependencias nuevas (R15):** `@aws-sdk/client-cognito-identity-provider`, `aws-jwt-verify` y `zod`.
3. **Tabla `sessions` y dos unicidades** en `staff_memberships` y `patients`: la migración la genera y aplica el responsable cuando llegue esa tarea.

## Project Structure

### Documentation (this feature)

```text
specs/002-ingreso-sesion/
├── plan.md                          # Este archivo
├── research.md                      # Decisiones técnicas y alternativas
├── data-model.md                    # Tabla de sesiones y cambios al modelo
├── quickstart.md                    # Guía de validación
├── contracts/
│   ├── identity-provider.md         # Puerto de identidad y requisitos de Cognito
│   ├── access-context.md            # Contexto de acceso para las funcionalidades siguientes
│   └── screens-and-actions.md       # Pantallas, acciones y mensajes
├── checklists/
│   └── requirements.md              # Calidad de la especificación
└── tasks.md                         # Lo genera speckit-tasks; no existe todavía
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                    # Modelo Session y unicidades (userId, id)
└── migrations/                      # La migración la genera el responsable; incluye el SQL manual de los CHECK

src/
├── proxy.ts                         # Comprobación optimista de la cookie
├── app/
│   ├── page.tsx                     # Inicio provisional protegido (reemplaza la plantilla)
│   ├── _lib/
│   │   ├── access.ts                # getAccessContext y requireClinicContext*
│   │   └── session-cookie.ts        # Lectura, escritura y borrado de la cookie
│   ├── (auth)/
│   │   ├── sign-in/ sign-up/ verify-email/ forgot-password/ reset-password/
│   │   └── _actions/                # Server Actions de registro, ingreso y recuperación
│   └── (dashboard)/
│       ├── select-clinic/ no-access/
│       ├── _components/             # Encabezado con clínica activa, selector y cierre de sesión
│       └── _actions/                # selectClinic y signOut
├── components/                      # Componentes reutilizables de formularios y mensajes
├── modules/users/
│   ├── domain/                      # Contexto de acceso, política de sesión, token, errores
│   ├── application/
│   │   ├── use-cases/               # register-account, confirm-account, resend-confirmation-code,
│   │   │                            # sign-in, sign-out, request-password-reset, reset-password,
│   │   │                            # get-access-context, list-available-clinics, select-active-clinic
│   │   └── ports/out/               # identity-provider, session-repository, user-repository,
│   │                                # clinic-access-repository
│   ├── infrastructure/
│   │   ├── repositories/            # Implementaciones con Prisma
│   │   └── adapters/                # Proveedor de identidad simulado
│   └── composition.ts               # Conecta los casos de uso con sus implementaciones
├── infrastructure/aws/cognito/      # Adaptador de Cognito y su configuración
└── shared/utils/                    # Redirección segura (función pura)

tests/
├── unit/                            # Dominio, casos de uso, adaptadores, utilidades
├── integration/session-access/      # Una prueba por regla de la sesión, contra PostgreSQL
├── e2e/                             # Recorridos con el proveedor simulado
└── support/                         # Datos de prueba de sesiones y de vínculos
```

**Structure Decision:** el módulo `users` sigue la estructura hexagonal de `memory/project-structure.md`. El adaptador de Cognito vive en `src/infrastructure/aws/cognito/`, donde la estructura prevé las integraciones compartidas. Lo que depende de Next (cookies, redirecciones) queda en `src/app/_lib/` y en las acciones, para que el módulo no dependa de Next. La inactividad, el vencimiento y la política de contraseña se centralizan en constantes del dominio.

## Cambios de entorno asociados

- `package.json`: las tres dependencias nuevas, fijadas a la versión exacta.
- `.env.example` (lo actualiza el responsable): `IDENTITY_PROVIDER` y las variables `COGNITO_*`.
- `.github/workflows/ci.yml`: el job de E2E necesita el servicio de PostgreSQL, la aplicación de migraciones y `IDENTITY_PROVIDER=fake`.
- `playwright.config.ts`: el servidor de pruebas necesita `DATABASE_URL` e `IDENTITY_PROVIDER=fake`.
- `memory/architecture.md`: sección Autenticación actualizada (R2).
- `memory/project-structure.md`: agregar `proxy.ts` y la carpeta `src/app/_lib/`.
- `tests/unit/app/page.test.tsx` y `tests/e2e/home.spec.ts`: ajustarlos al inicio provisional.
- `tests/support/database.ts`: datos de prueba de sesiones, y vaciar la tabla nueva.

## Riesgos y verificaciones tempranas

- **Clave foránea compuesta en Prisma (R5):** comprobar al escribir el schema que Prisma 7.10.1 acepta la relación opcional que comparte `userId`. Alternativa: clave foránea simple más comprobación de pertenencia en la consulta.
- **SDK de Cognito sin credenciales de AWS (R3):** probar en la primera tarea del adaptador.
- **Respuesta de Cognito ante cuentas sin verificar (R4):** la aplicación no depende de ella, pero hay que confirmarla con el grupo real.
- **Cookie `Secure` en `http://localhost` en las pruebas E2E (R10).**
- **Fallo parcial al cambiar la contraseña (R8):** Cognito acepta el cambio y la base falla. Se registra y se informa, no se reintenta.
- **Proveedor simulado en un despliegue real (R11):** mitigado con resguardos y pruebas; lo revisa el revisor de seguridad.
- **Costo de revalidar en cada solicitud (R6):** una consulta por solicitud. Se mide en las pruebas; el caché por solicitud de React evita repetirla dentro de un mismo render.
- **Sin límite de tasa propio ni limpieza de sesiones vencidas (R17):** se documentan como límites conocidos.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
