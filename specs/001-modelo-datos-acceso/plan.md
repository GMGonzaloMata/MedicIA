# Implementation Plan: Modelo de datos de acceso multi-clínica

**Branch**: `001-modelo-datos-acceso` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-modelo-datos-acceso/spec.md`

## Summary

Definir el modelo de datos que sostiene el acceso multi-clínica: cinco entidades (clínica, usuario, membresía de personal, paciente y asignación médico–paciente) con sus relaciones, estados y las reglas que la propia base de datos garantiza. Es el primer paso de la plataforma y el único alcance de esta funcionalidad: no incluye ingreso, invitaciones, pantallas, casos de uso ni auditoría.

El enfoque técnico, detallado en [research.md](research.md):

- **Schema de Prisma** sobre PostgreSQL con las cinco tablas y sus enumeraciones, en [data-model.md](data-model.md).
- **Aislamiento dentro de la base:** `tenantId` obligatorio y claves foráneas compuestas, de modo que una asignación entre clínicas distintas sea imposible.
- **Reglas que Prisma no declara** (`CHECK` e índice único parcial) escritas a mano en el SQL de la migración.
- **Una prueba de integración por regla**, contra PostgreSQL real, intentando violarla.
- **Un solo archivo de aplicación:** el cliente compartido de Prisma, una instancia por proceso.

## Technical Context

**Language/Version**: TypeScript 5 con `strict`, sobre Node.js 24.

**Primary Dependencies**: Next.js 16.4.4 y React 19.3.0 (instalados). A agregar, con aprobación del responsable: `prisma`, `@prisma/client` y `@prisma/adapter-pg`, todos en la versión `7.10.1`, y `pg`. Se descarta Prisma 8 por estar aún en candidatas (ver R1).

**Storage**: PostgreSQL (Amazon RDS en producción) mediante Prisma, con un `PrismaClient` compartido por proceso. El cliente generado queda en `generated/prisma/`, fuera de `src/`.

**Testing**: Vitest con el proyecto `integration` ya configurado, contra PostgreSQL real levantado con Docker Compose en local y como servicio en CI. Cobertura mínima de 80 % de líneas por archivo en `src/`.

**Target Platform**: servidor Node.js en Amazon EC2.

**Project Type**: aplicación web full-stack (monolito modular con Next.js). Este paso solo toca la capa de persistencia.

**Performance Goals**: las consultas habituales (clínicas de una persona, pacientes de un médico, médicos de un paciente) responden en menos de 1 segundo con 100 clínicas y 10.000 pacientes en la mayor (SC-004).

**Constraints**:
- Ningún agente ejecuta `prisma migrate`, `prisma db` ni `prisma generate`; los corre el responsable.
- Las pruebas de integración no ejecutan comandos de Prisma: exigen la base ya migrada y fallan con un mensaje claro si no lo está.
- Hay dos entornos: producción (Amazon RDS) y una única base en Docker para probar. Las pruebas vacían las tablas, así que solo corren contra un servidor local.
- Sin borrado en cascada; los cambios de estado reemplazan al borrado.
- Datos mínimos: sin contraseñas, tokens, fecha de nacimiento ni datos clínicos en estas tablas.

**Scale/Scope**: cinco tablas, cuatro enumeraciones, unas 25 restricciones verificables y una prueba de integración por regla.

## Constitution Check

*GATE: debe pasar antes de la investigación (Fase 0) y revisarse después del diseño (Fase 1).*

- **I. Apoyo clínico, no diagnóstico:** no aplica; no hay resultados de IA. Ningún nombre del modelo usa términos de diagnóstico. **Cumple.**
- **II. Aislamiento multi-tenant (no negociable):** **cumple.** `tenantId` es obligatorio en membresías, pacientes y asignaciones; las claves foráneas compuestas impiden relaciones entre clínicas aunque la aplicación falle (R3); una prueba de integración verifica el rechazo. Las consultas de datos de una clínica, que deben restringirse por clínica, se escribirán en las funcionalidades siguientes. La seguridad por fila queda fuera de este paso, como lo permite la constitución.
- **III. Arquitectura hexagonal pragmática:** **cumple.** No hay dominio ni casos de uso que dependan de Prisma. El único archivo de aplicación es el cliente compartido de Prisma, en la capa de infraestructura y con una instancia por proceso, como indica la constitución.
- **IV. Trazabilidad de los análisis:** no aplica en este paso. Las asignaciones conservan su historial por período (clarificación 2), y `Patient` y `Tenant` quedan listos para que estudios y análisis se apoyen en ellos.
- **V. Extensibilidad por estudio y modelo:** no aplica.
- **VI. Tratamiento responsable de datos clínicos:** **cumple.** Del paciente solo se guarda documento y nombre; no se borra información, solo se cambia de estado; el historial de asignaciones registra quién tuvo acceso y cuándo.
- **VII. Interfaz consistente, responsiva y accesible:** no aplica; no hay interfaz.
- **VIII. Código limpio, tipado y verificable:** **cumple.** TypeScript `strict` sin `any`; campos en `camelCase`, enumeraciones en `UPPER_SNAKE_CASE` y tablas en `snake_case` mapeadas con `@map`; los tipos generados por Prisma no salen de la infraestructura; cada regla tiene su prueba.
- **Stack aprobado:** usa Prisma con PostgreSQL, ambos aprobados. Las dependencias nuevas (`@prisma/adapter-pg` y `pg`) son parte de la configuración de Prisma 7 y quedan listadas para la aprobación del responsable.
- **Comandos reservados:** el plan no requiere que ningún agente ejecute `git commit`, `prisma migrate`, `prisma db` ni `prisma generate`. Tampoco se agrega un `postinstall` que lo haga de forma indirecta (R11).

**Resultado:** sin violaciones.

## Project Structure

### Documentation (this feature)

```text
specs/001-modelo-datos-acceso/
├── plan.md              # Este archivo
├── research.md          # Decisiones técnicas y alternativas
├── data-model.md        # Diseño de las tablas
├── quickstart.md        # Guía de validación
├── checklists/
│   └── requirements.md  # Calidad de la especificación
└── tasks.md             # Lo genera speckit-tasks; no existe todavía
```

No hay carpeta `contracts/`: esta funcionalidad no expone interfaces a usuarios ni a otros sistemas.

### Source Code (repository root)

```text
prisma/
├── schema.prisma                  # Tablas, enumeraciones y relaciones
└── migrations/                    # Las genera el responsable; incluyen el SQL manual

prisma.config.ts                   # Conexión y rutas de Prisma (versión 7)
docker-compose.yml                 # PostgreSQL de desarrollo y de pruebas
.env.example                       # Variables documentadas
generated/prisma/                  # Cliente generado (ignorado por git y por ESLint)

src/
└── infrastructure/
    └── database/
        └── prisma-client.ts       # Cliente compartido, una instancia por proceso

tests/
├── integration/
│   └── access-model/              # Una prueba por regla, agrupadas por historia
└── support/
    ├── integration-setup.ts       # Verifica que la base sea local y esté migrada; no ejecuta Prisma
    └── database.ts                # Conexión, limpieza y datos de prueba
```

**Structure Decision:** el modelo vive en `prisma/`, tal como define `memory/project-structure.md`. El código de aplicación se limita al cliente compartido en `src/infrastructure/database/`. El cliente generado queda fuera de `src/` para no afectar la medición de cobertura por archivo. Los módulos `tenants` y `users` se crean en las funcionalidades que los necesiten.

## Cambios de entorno asociados

- `package.json`: dependencias nuevas.
- `vitest.config.mts`: archivo de preparación para el proyecto `integration`.
- `.github/workflows/ci.yml`: servicio de PostgreSQL, generación del cliente y aplicación de migraciones en el job `check`, que hoy no tiene base de datos.
- `.gitignore` y `eslint.config.mjs`: ignorar `generated/`.
- `docker-compose.yml` y `.env.example`: nuevos.

## Riesgos y verificaciones tempranas

- **Versión de Prisma:** instalar `7.10.1` y confirmar su configuración contra la documentación antes de escribir el schema (R1).
- **Restricciones manuales:** comprobar cómo trata la versión instalada los índices parciales y los `CHECK` en una segunda migración; tener lista la alternativa de columna marcadora (R2).
- **Base de pruebas:** sin PostgreSQL disponible no hay verificación posible. Debe informarse, no omitirse.
- **Historial de vínculos del paciente:** al revincular se pierde la fecha de la revocación anterior. Queda para el registro de auditoría posterior (R7).

## Complexity Tracking

Sin violaciones de la constitución que justificar.
