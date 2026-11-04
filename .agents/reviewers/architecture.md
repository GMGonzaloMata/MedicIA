# Revisión de arquitectura

Comprobá que el cambio respete la arquitectura hexagonal pragmática de MedicIA. ESLint ya controla los imports entre capas y módulos, así que concentrate en lo que no puede detectar.

Documentos de referencia: `memory/architecture.md`, `memory/project-structure.md`, `memory/design-patterns.md` y `memory/coding-standards.md`.

## Qué comprobar

- **Lógica de negocio fuera de lugar:** reglas en componentes, Server Actions, Route Handlers o repositorios en lugar del dominio o los casos de uso.
- **Handlers delgados:** Server Actions y Route Handlers siguen el orden documentado y delegan en un caso de uso.
- **Fugas de infraestructura:** tipos de Prisma o respuestas de AWS que llegan al dominio, a la aplicación o a la interfaz, incluso mediante tipos inferidos.
- **Puertos:** se definen en `application/ports/`, los de salida se implementan en `infrastructure/` y los casos de uso reciben sus dependencias por inyección.
- **Conexión de dependencias:** se hace en `composition.ts` y no hay implementaciones creadas dentro de los casos de uso.
- **Extensibilidad:** un tipo de estudio o modelo nuevo se registra sin agregar `if` o `switch` en los casos de uso ni cambiar el flujo general.
- **Trazabilidad:** cada análisis conserva su estudio, sus hallazgos, la versión exacta del modelo, el momento de ejecución y un estado explícito.
- **Sobreingeniería:** interfaces, fábricas o capas sin una necesidad concreta.
- **Ubicación y nombres:** archivos en la carpeta documentada y en `kebab-case`, y términos del glosario (`Tenant`, `Study`, `Analysis`, `Finding`, `ModelVersion`).
- **Pruebas:** las pruebas nuevas están en `tests/` y comprueban comportamiento, no solo que el código se ejecute.
