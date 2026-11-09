# Implementation Plan: Infraestructura base y servicio de identidad

**Branch**: `003-infra-base-cognito` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-infra-base-cognito/spec.md`

## Summary

Se describe en la carpeta `infra/` del repositorio, con Terraform, el entorno de desarrollo de AWS: el estado remoto (bucket de S3 cifrado, con versiones y bloqueo nativo) y el servicio de identidad de Cognito configurado como exige el contrato de la funcionalidad 002. La aplicación no cambia: recibe sus datos de conexión desde las salidas de Terraform, que el responsable copia a su archivo local de entorno.

El enfoque técnico, resuelto en [research.md](research.md):

- **Tres piezas en `infra/`:** una raíz de arranque (`bootstrap/`) que se aplica una vez por cuenta, un módulo reutilizable de identidad (`modules/identity/`) y la raíz del entorno (`environments/dev/`).
- **Arranque en dos fases:** el estado del arranque empieza local y se migra al bucket que él mismo crea.
- **Contrato verificado sin crear recursos:** pruebas `terraform test` en modo `plan` con un proveedor simulado.
- **Revisión en CI con un flujo propio:** formato, validación, `tflint`, `trivy`, pruebas y un plan contra AWS con un rol de solo lectura que GitHub asume por OIDC, sin claves guardadas.
- **Aplicar sigue siendo del responsable:** ninguna automatización ejecuta `apply`, `destroy`, `import` ni `state`.

## Technical Context

**Language/Version**: Terraform 1.15.x (`required_version = "~> 1.15"`; instalado: 1.15.1). Lenguaje HCL. Flujos de GitHub Actions en YAML.

**Primary Dependencies**: proveedor `hashicorp/aws` `~> 6.72` (última: 6.72.0). En CI: `hashicorp/setup-terraform@v4`, `aws-actions/configure-aws-credentials@v6`, `aquasecurity/trivy-action@v0.36.0` y `tflint` con el complemento de AWS.

**Storage**: estado de Terraform en un bucket de S3 `medicia-tfstate-dev-896618135592`, con cifrado SSE-S3, versiones, TLS obligatorio y bloqueo nativo (`use_lockfile`). La base de datos de la aplicación no cambia.

**Testing**: `terraform test` en modo `plan` con `mock_provider "aws"` sobre `infra/modules/identity`; `terraform validate` y `fmt`, `tflint`, `trivy config` y `trivy fs --scanners secret` sobre `infra/`. El recorrido real de la 002 contra el servicio creado se hace a mano (escenario 4 de la guía).

**Target Platform**: AWS, cuenta de desarrollo `896618135592`, región `sa-east-1`. El operador usa Windows con PowerShell y el perfil `medicia-dev` de la CLI.

**Project Type**: infraestructura como código dentro de un monolito Next.js. No agrega código de aplicación.

**Performance Goals**: crear el entorno desde cero en menos de 30 minutos siguiendo la guía (SC-001); una segunda ejecución propone 0 cambios (SC-002).

**Constraints**: ningún secreto, estado ni plan guardado en git; solo el responsable ejecuta `apply`, `destroy`, `import` y `state`; costo menor a 1 USD al mes (SC-007); una sola región; sin recursos fuera del alcance del spec.

**Scale/Scope**: un entorno, un operador, un grupo de usuarios con un cliente. Producción, S3 de estudios, RDS, EC2, SageMaker, SES y dominio quedan fuera.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución v1.6.0.

- **I. Apoyo clínico, no diagnóstico:** no aplica. No se genera ni presenta ningún resultado clínico.
- **II. Aislamiento multi-tenant:** no aplica, no hay datos de clínicas. Se respeta el espíritu con mínimo privilegio: el usuario de la aplicación solo puede fijar contraseñas en un grupo, y el rol de CI no lee otros buckets, para no exponer datos clínicos futuros. **Pasa.**
- **III. Arquitectura hexagonal pragmática:** no aplica, no se toca `src/`. El módulo de Terraform se crea porque producción lo reutilizará, y el arranque no usa módulo porque se aplica una sola vez, siguiendo el criterio de no agregar capas sin necesidad. **Pasa.**
- **IV. Trazabilidad de los análisis y V. Extensibilidad por estudio:** no aplican.
- **VI. Tratamiento responsable de datos clínicos:** no se aprovisiona ningún dato clínico. El estado, que sí contiene secretos, es privado, cifrado y con versiones. **Pasa.**
- **VII. Interfaz consistente:** no aplica, no hay interfaz.
- **VIII. Código limpio, tipado y verificable:** no hay código de aplicación. El código HCL se verifica con formato, validación, `tflint`, `trivy` y pruebas. **Pasa.**
- **Stack aprobado:** infraestructura con Terraform en `infra/`, con estado remoto cifrado y con bloqueo, nunca en git, y los comandos `apply`, `destroy`, `import` y `state` solo del responsable. **Pasa.**
- **Flujo de calidad:** la funcionalidad sigue Spec Kit. `npm run check` no cambia, porque no se toca código de la aplicación. Las pruebas proporcionales al riesgo son las de Terraform, que cubren cada punto del contrato. Las pruebas de aislamiento entre clínicas no aplican. **Pasa.**
- **Comandos reservados:** el plan no usa `git commit` ni comandos de Prisma. **Pasa.**

**Resultado:** sin violaciones. No hace falta la sección de complejidad.

**Re-evaluación posterior al diseño:** sin cambios. El diseño agrega la política del operador y un rol de plan de solo lectura, ambos de mínimo privilegio, y no introduce ninguna violación.

## Project Structure

### Documentation (this feature)

```text
specs/003-infra-base-cognito/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones y pendientes de verificar
├── data-model.md        # Fase 1: recursos, atributos y relaciones
├── quickstart.md        # Fase 1: recorrido de validación
├── contracts/
│   ├── identity-service.md   # Contrato del servicio de identidad y de las variables de la aplicación
│   └── ci-and-access.md      # Flujo de CI, confianza con GitHub y permisos
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2: lo genera speckit-tasks
```

### Source Code (repository root)

```text
infra/
├── README.md                      # Guía del responsable (FR-021)
├── .tflint.hcl                    # Configuración de tflint con el complemento de AWS
├── .trivyignore                   # Excepciones del análisis, cada una con su motivo
├── bootstrap/                     # Se aplica una vez por cuenta
│   ├── versions.tf                # Versión de Terraform y del proveedor
│   ├── providers.tf               # Región, allowed_account_ids y default_tags
│   ├── variables.tf
│   ├── state-bucket.tf            # Bucket del estado y su política
│   ├── github-oidc.tf             # Proveedor de GitHub y rol de plan de solo lectura
│   ├── operator-policy.tf         # Política del operador
│   ├── outputs.tf
│   ├── backend.tf.example         # Se copia a backend.tf en la fase 2 del arranque
│   └── .terraform.lock.hcl
├── modules/
│   └── identity/                  # Grupo de usuarios, cliente y usuario de la aplicación
│       ├── versions.tf
│       ├── variables.tf
│       ├── main.tf
│       ├── outputs.tf
│       └── tests/
│           └── identity.tftest.hcl
└── environments/
    └── dev/                       # Raíz del entorno de desarrollo
        ├── versions.tf
        ├── providers.tf
        ├── backend.tf             # Backend s3 con use_lockfile
        ├── main.tf                # Llama a modules/identity
        ├── outputs.tf             # Repite las salidas del módulo
        └── .terraform.lock.hcl

.github/workflows/
└── infra.yml                      # Comprobaciones estáticas y plan de solo lectura
```

También se modifican archivos existentes:

- `.gitignore`: declara el estado, los planes guardados, `.terraform/`, `*.tfvars` y `*.tfvars.json`.
- `memory/project-structure.md`: refleja el árbol real de `infra/`.
- `memory/architecture.md`: documenta el flujo de CI y el acceso al estado.
- `.claude/skills/review-changes` y `.agents/skills/review-changes`: sin cambios, porque ya incluyen a la revisora de infraestructura.

**Structure Decision**: tres piezas bajo `infra/` por entorno y por frecuencia de uso: `bootstrap/` (una vez), `modules/identity/` (reutilizable) y `environments/dev/` (a diario). Producción agregará `environments/prod/` y su propio arranque en otra cuenta. El flujo de CI vive aparte de `ci.yml` para que las pruebas de la aplicación y las de infraestructura no se disparen entre sí.

## Complexity Tracking

Sin violaciones de la constitución. No se completa.
