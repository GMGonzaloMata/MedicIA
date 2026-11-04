# Estructura de carpetas del proyecto

## Objetivo

Organizar la plataforma como un **monolito modular con Next.js full-stack**, siguiendo principios de arquitectura hexagonal y separación de responsabilidades. Esta estructura sirve de guía para Spec Kit y los agentes; no es necesario crear carpetas vacías.

## Estructura general

```
/
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/                # Pantallas de acceso
│   │   ├── (dashboard)/           # Pantallas de la plataforma
│   │   └── api/v1/               # API REST (Route Handlers)
│   │
│   ├── components/                # Componentes visuales reutilizables
│   ├── modules/                   # Funcionalidades del negocio
│   │   ├── tenants/              # Clínicas y aislamiento multi-tenant
│   │   ├── users/                # Usuarios y perfiles
│   │   ├── studies/              # Estudios y archivos
│   │   ├── analyses/             # Solicitudes, estados y resultados
│   │   └── models/               # Catálogo y versiones de modelos
│   │
│   ├── infrastructure/            # Adaptadores e integraciones comunes
│   │   ├── database/             # Cliente Prisma compartido
│   │   └── aws/
│   │       ├── cognito/
│   │       ├── s3/
│   │       └── sagemaker/
│   │
│   └── shared/                 # Tipos y utilidades transversales
│       ├── types/
│       ├── utils/
│       ├── constants/
│       └── ...
│
├── prisma/                        # Esquema y migraciones de PostgreSQL
├── tests/                         # Pruebas unitarias, de integración y E2E
├── memory/                        # Contexto estable del proyecto
│   ├── platform-context.md
│   ├── architecture.md
│   ├── project-structure.md
│   ├── design-patterns.md
│   ├── design.md
│   └── coding-standards.md
├── specs/                         # Especificaciones por funcionalidad
├── .specify/                      # Configuración de Spec Kit
├── .claude/                       # Skills, subagentes, permisos y hooks de Claude Code
├── .agents/                       # Skills de Codex y criterios de los revisores
├── .codex/                        # Subagentes, reglas, permisos y hooks de Codex
├── .github/                       # Integración continua
├── scripts/agent-hooks/           # Hooks compartidos por los agentes
└── AGENTS.md                      # Instrucciones generales para agentes
```

## Estructura interna de un módulo (arquitectura hexagonal)

```
src/modules/studies/
├── domain/                  # Entidades y reglas de negocio
├── application/
│   ├── use-cases/           # Casos de uso
│   └── ports/               # Interfaces de entrada y salida
│       ├── in/
│       └── out/
├── infrastructure/
│   ├── repositories/        # Implementaciones con Prisma
│   └── adapters/            # Integraciones con servicios externos
└── composition.ts           # Conecta los casos de uso con sus implementaciones
```

- **Domain:** contiene las entidades, objetos de valor y reglas de negocio.
- **Application:** define los casos de uso y los puertos de entrada y salida.
- **Infrastructure:** implementa los adaptadores que conectan la aplicación con tecnologías externas.
- **Composition:** entrega los casos de uso ya conectados con sus implementaciones; `app/` los obtiene desde este archivo.
- **Regla de dependencias:** el dominio no depende de las capas externas; los adaptadores dependen de los contratos definidos en el núcleo.

## Reglas de organización

- **`app/`** contiene rutas, layouts, Server Components, Server Actions y Route Handlers; no concentra lógica de negocio.
- **`modules/`** organiza el negocio por capacidades. Los casos de uso coordinan operaciones; el dominio no depende de Next.js, Prisma ni SDK de AWS.
- **`infrastructure/`** contiene integraciones compartidas. Los adaptadores específicos de un módulo pueden permanecer dentro de ese módulo.
- **Prisma** se reutiliza mediante un cliente compartido por proceso; las consultas del negocio se encapsulan donde corresponda.
- **Multi-tenancy:** toda operación sensible valida la clínica autorizada. No se confía en el `tenant_id` enviado por el cliente.
- **Modelos ML:** su entrenamiento y código Python/PyTorch viven en un proyecto o espacio de ML separado; esta aplicación consume inferencia mediante el adaptador de SageMaker.
- **Tests:** todas las pruebas viven en `tests/`: unitarias en `tests/unit/` (replicando la estructura de `src/`), de integración en `tests/integration/` y E2E en `tests/e2e/`. Los archivos de apoyo compartidos van en `tests/support/`.
- Evitar dependencias circulares, duplicación de lógica y nuevas abstracciones sin una necesidad concreta.

La estructura puede evolucionar, pero cualquier cambio relevante debe mantenerse coherente con `memory/architecture.md`.
