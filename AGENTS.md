# MedicIA

Plataforma B2B multi-tenant para analizar estudios médicos con IA. Sus resultados son posibles hallazgos de apoyo clínico, nunca diagnósticos.

## Qué leer

Leé siempre `.specify/memory/constitution.md`: tiene las reglas no negociables y prevalece sobre todo lo demás. Según la tarea, leé además:

- **Negocio y alcance:** `memory/platform-context.md`
- **Arquitectura y tecnologías:** `memory/architecture.md`
- **Ubicación de archivos:** `memory/project-structure.md`
- **Patrones:** `memory/design-patterns.md`
- **Interfaz:** `memory/design.md`
- **Código:** `memory/coding-standards.md`

## Cómo trabajar

- **Funcionalidades nuevas o cambios de contratos, datos o seguridad:** seguí el flujo de Spec Kit: `speckit-specify`, `speckit-clarify`, `speckit-plan`, `speckit-tasks`, `speckit-analyze` y `speckit-implement`.
- **Tareas acotadas:** usá la skill `simple-task`, que define cuándo corresponde. Si no estás seguro, preguntá antes de elegir el flujo.

## Verificar y revisar

- Ejecutá `npm run check` antes de dar un cambio por terminado. Si cambió una vista o un flujo de usuario, ejecutá también `npm run test:e2e`.
- Para comprobar un cambio en la app corriendo, usá la skill `next-dev-loop`.
- Para revisar los cambios contra las reglas del proyecto, usá la skill `review-changes`. Se ejecuta sola al terminar `speckit-implement`.
- Informá lo que no hayas podido verificar.

## Git

No hagas commit ni push salvo que se pida.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
