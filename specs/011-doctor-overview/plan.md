# Plan: Resumen clínico en Inicio

**Rama**: `integration/pdf-ecg-rebrand` | **Fecha**: 2026-11-18 | **Entrada**: [especificación](spec.md), ODD S4/T3.

## Resumen

Reemplazar solo el panel de Inicio del médico por dos totales y hasta cinco estudios recientes. Reutilizar el contexto de clínica activa, la traducción a actor de estudios y los destinos existentes. Mantener las vistas de paciente y administración no médica.

## Contexto técnico

- TypeScript estricto, Next.js App Router 16.4 y React 19. Servidor asíncrono dentro del `Suspense` existente; sin caché de resultados entre solicitudes ni datos clínicos en componentes cliente.
- PostgreSQL y Prisma existentes. Una transacción de lectura con la misma instantánea para dos conteos y la lista. Consultas de conjunto, sin precargar IDs de pacientes ni hacer una consulta por paciente. Máximo cinco filas seleccionadas; `uploadedAt DESC, id DESC`.
- Puerto de consulta específico de `studies`, conectado en su composición sin inicializar almacenamiento de archivos para el resumen. En ningún caso se modifican listas, permisos, schema, migraciones o dependencias.
- Vitest unitario y fixture PostgreSQL de integración. Verificación visual y de teclado en una instancia aislada, a cargo de T4.

## Constitution Check

| Control | Antes y después del diseño |
| --- | --- |
| I, IV, V — apoyo clínico, trazabilidad, extensibilidad | Solo metadatos y conteos; no altera análisis, estados, modelos o sus interpretaciones. |
| II y VI — aislamiento y privacidad | Clínica y médico de sesión; toda consulta restringida por tenant, paciente vinculado y asignación vigente. Proyección mínima y test real de acceso cruzado. |
| III — arquitectura | Dominio y caso de uso puros; Prisma solo en repositorio de lectura; wiring en composición; presentación llama al caso de uso. |
| VII — interfaz | Literata, tokens existentes, foco visible, filas adaptables y variación de tema sin duplicar la vista. |
| VIII y controles | TDD, test de integración, objetivo constitucional de 80 % por archivo lógico y `check`/E2E como gates de integración aislados. No se corre una verificación que pueda tocar la base interactiva. |

Diseño sin excepciones a la constitución. Las pruebas runtime y cobertura global dependen de la verificación aislada.

## Fases y estructura

1. Investigación y aclaración: [research.md](research.md); ningún punto de producto ameritó una pregunta adicional.
2. Diseño: [modelo de datos](data-model.md), [contrato de la vista](contracts/home.md) y [guía de validación](quickstart.md).
3. Implementación y verificación en [tasks.md](tasks.md): `src/modules/studies/{domain,application,infrastructure}` y `src/modules/studies/composition.ts`; `src/app/(dashboard)/page.tsx`, `_components/doctor-overview.tsx` y `dashboard.css`; `tests/unit/{app,modules/studies/application}` y `tests/integration/study-storage`.

El directorio de esta especificación se usa explícitamente, sin escribir un selector global de Spec Kit ni cambiar de rama.
