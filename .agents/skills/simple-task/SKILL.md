---
name: simple-task
description: Hacer una tarea acotada en MedicIA sin el flujo completo de Spec Kit, como corregir un error puntual, ajustar textos o estilos, un refactor pequeño, documentación o configuración. Usar cuando se pida una tarea sencilla o se invoque esta skill. No usar para funcionalidades nuevas.
---

# Tarea sencilla

Flujo corto para cambios que no justifican especificación, plan y tareas. La constitución y los controles de calidad se aplican igual.

## 1. Confirmar que corresponde

La tarea entra en este flujo solo si se cumplen todas estas condiciones:

- No agrega una funcionalidad ni una capacidad nueva para el usuario.
- No cambia contratos: API, esquema de datos, migraciones o puertos.
- No toca autenticación, autorización ni aislamiento entre clínicas.
- No cambia cómo se calcula, guarda o presenta un resultado clínico.
- No agrega dependencias.
- No deja decisiones de diseño abiertas.

Si alguna no se cumple, detenete, explicá cuál y proponé usar `speckit-specify`. La constitución exige especificar cada funcionalidad, así que no sigas con este flujo aunque el cambio parezca chico. Si no estás seguro, preguntá.

Si se cumplen todas, indicá en una línea que vas a usar el flujo corto.

## 2. Hacer el cambio

1. Leé el código cercano y las partes de `.specify/memory/constitution.md` y `memory/coding-standards.md` que apliquen.
2. Si el cambio toca Next.js, leé antes la guía correspondiente en `node_modules/next/dist/docs/`.
3. Hacé el cambio mínimo, sin refactors ni mejoras fuera del pedido.

## 3. Probar según el riesgo

- **Error en la lógica:** agregá en `tests/` una prueba que falle sin la corrección.
- **Tarea compleja según la constitución:** cumplí la cobertura mínima que exige.
- **Estilos, textos o ajustes visuales sin lógica:** no hacen falta pruebas nuevas.

## 4. Verificar

1. Ejecutá `npm run check`, salvo que solo hayas cambiado documentación.
2. Si cambió una vista o un flujo de usuario, ejecutá `npm run test:e2e`.
3. Si el cambio tocó lógica en `src/`, usá la skill `review-changes`. Si fue solo visual, de texto o de documentación, no hace falta, salvo que se pida.

## 5. Informar

Indicá qué cambiaste, qué comprobaste y qué no pudiste comprobar. Respetá los comandos reservados de `AGENTS.md`: no hagas commit ni ejecutes comandos de base de datos.
