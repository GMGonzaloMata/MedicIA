# Tareas: Resumen clínico en Inicio

**Entrada**: diseño en `specs/011-doctor-overview/`. Una historia verificable como MVP; sin setup de dependencias, migraciones ni infraestructura.

## Fase 1: Preparación y base existente

- [x] T001 Verificar constitución, contexto de acceso y modelo existente según `specs/011-doctor-overview/plan.md`; no modificar archivos de setup.

## Fase 2: US1 — Consultar un panorama de mi clínica (P1)

**Prueba independiente**: en Inicio, comparar totales y últimos estudios contra los asignados a la membresía y repetir con dos causas de vacío y con roles sin acceso.

- [x] T002 [P] [US1] Escribir primero pruebas unitarias del actor, totales, vistas, vacíos, error y destinos conservados en `tests/unit/modules/studies/application/get-doctor-overview.test.ts`, `tests/unit/app/doctor-overview.test.tsx` y `tests/unit/app/clinic-header-navigation.test.tsx` (FR-001–005, SC-001/002).
- [x] T003 [P] [US1] Escribir primero casos de integración con el límite de cinco filas, fecha y empate, terminación, otro médico y otro tenant en `tests/integration/study-storage/doctor-overview.test.ts` (FR-001–003, SC-001/002).
- [x] T004 [US1] Implementar contrato de lectura, restricción a actor médico y parámetro fijo de cinco en `src/modules/studies/domain/doctor-overview.ts`, `src/modules/studies/application/ports/out/doctor-overview.ts` y `src/modules/studies/application/use-cases/get-doctor-overview.ts` (FR-001–003).
- [x] T005 [US1] Implementar consultas por conjunto, ámbito compartido, instantánea y proyección mínima en `src/modules/studies/infrastructure/repositories/prisma-doctor-overview.ts` e inyectar en `src/modules/studies/composition.ts` (FR-001–003).
- [x] T006 [US1] Renderizar resumen, accesibilidad, vacíos y error exclusivamente en el Inicio médico, con tokens responsivos en `src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/_components/doctor-overview.tsx` y `src/app/(dashboard)/dashboard.css` (FR-001–005).

## Fase 3: Validación

- [x] T007 Verificar pruebas unitarias focalizadas y análisis estático sin base interactiva según `specs/011-doctor-overview/quickstart.md`.
- [ ] T008 Verificar integración, cobertura, check, E2E y presentación en un entorno aislado según `specs/011-doctor-overview/quickstart.md` (T4, SC-001–003, verificación a cargo del parent).

## Dependencias y entrega

T001 → T002/T003 (independientes) → T004 → T005 → T006 → T007 → T008. Se escribe toda prueba primero, se observa el fallo unitario antes de implementar y se preservan las vistas existentes. El MVP incluye alcance, cifras, últimos estudios y los dos vacíos; no se publica una vista con cifras simuladas.
