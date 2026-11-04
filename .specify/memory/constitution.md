# MedicIA Constitution

## Core Principles

### I. Apoyo clínico, no diagnóstico

- Todo resultado de IA DEBE presentarse como posible hallazgo y NO DEBE mostrarse, nombrarse ni almacenarse como diagnóstico confirmado.
- La plataforma NO DEBE afirmar que una capacidad está disponible, es precisa o está clínicamente validada sin evidencia de esa validación. Figurar en la visión del producto no alcanza.
- Un análisis fallido NO DEBE generar resultados clínicos: se registra como `FAILED` con su error.

**Justificación:** la plataforma asiste al criterio profesional y no lo reemplaza. Un resultado presentado como certeza puede causar daño clínico.

### II. Aislamiento multi-tenant (NO NEGOCIABLE)

- El `tenant_id` DEBE obtenerse del contexto autenticado y autorizado, y NUNCA de un parámetro enviado por el cliente.
- Toda operación sensible DEBE validar autenticación, autorización y pertenencia a la clínica, tanto en Server Actions como en Route Handlers.
- Toda consulta sobre datos de una clínica DEBE restringirse por tenant. RLS puede sumarse como defensa adicional, pero no reemplaza esta validación.
- Los objetos en S3 DEBEN ser privados y su acceso DEBE autorizarse por clínica. Los prefijos por tenant NO DEBEN considerarse por sí solos una barrera de seguridad.

**Justificación:** la separación entre instituciones es un requisito de negocio y de confianza, independiente de la implementación elegida.

### III. Arquitectura hexagonal pragmática

- El proyecto DEBE mantenerse como un monolito modular con Next.js full-stack, organizado en los módulos de `src/modules/`.
- El dominio NO DEBE depender de Next.js, Prisma ni SDK de AWS. Las dependencias DEBEN apuntar hacia los contratos definidos en el núcleo.
- La lógica de negocio NO DEBE residir en componentes React, Server Actions ni Route Handlers; estos delegan en casos de uso.
- Un patrón o abstracción DEBE responder a una necesidad concreta. NO DEBEN agregarse interfaces, fábricas ni capas de delegación solo para cumplir un patrón.

**Justificación:** el desacoplamiento permite cambiar interfaz, persistencia o servicios externos sin tocar el negocio, y evitar la sobreingeniería mantiene el código simple y testeable.

### IV. Trazabilidad de los análisis

- Un estudio PUEDE tener múltiples análisis; el modelo de datos NO DEBE asociarlo a una única predicción.
- Cada análisis DEBE conservar su estudio, sus hallazgos, la versión exacta del modelo utilizado y el momento de ejecución.
- Cada análisis DEBE tener un estado explícito: `PENDING`, `PROCESSING`, `COMPLETED` o `FAILED`.

**Justificación:** un resultado que no puede relacionarse con el estudio y el modelo que lo
produjeron no puede revisarse, compararse ni reanalizarse.

### V. Extensibilidad por estudio y modelo

- Incorporar un tipo de estudio, procesador o modelo NO DEBE exigir cambios en el flujo general de la plataforma.
- Cada análisis DEBE ejecutarse con un modelo apropiado para esa modalidad y tarea. NO DEBE suponerse que un modelo sirve para otros estudios.
- El usuario DEBE seleccionar explícitamente el tipo de estudio y el análisis. La identificación automática del estudio no es un requisito actual.
- El archivo DEBE validarse contra los requisitos del análisis solicitado antes de enviarse a inferencia.

**Justificación:** el producto crece desde ECG hacia otras modalidades, y esa ampliación debe conservar una experiencia de uso común.

### VI. Tratamiento responsable de datos clínicos

- El acceso a datos médicos DEBE estar restringido y responder a una finalidad definida.
- Conservar un estudio NO DEBE implicar su uso para entrenamiento. Todo uso secundario DEBE tener finalidad definida, autorizaciones correspondientes y controles apropiados.
- Los plazos de conservación y eliminación DEBEN definirse según los requisitos institucionales y legales aplicables antes de operar con datos reales de pacientes. No son un requisito de la etapa actual.

**Justificación:** la información médica es especialmente sensible, y su uso indebido compromete
a los pacientes y a las instituciones.

### VII. Interfaz consistente, responsiva y accesible

- Los colores DEBEN definirse mediante tokens semánticos, no con valores fijos dispersos en
  componentes.
- Cada vista DEBE funcionar en modo claro y oscuro, con preferencia del sistema y elección del usuario, sin duplicar pantallas para cada tema.
- Cada vista DEBE funcionar en móvil, tablet y escritorio, sin desbordes ni pérdida de información o funcionalidad.
- La interfaz DEBE garantizar contraste suficiente, navegación por teclado y foco visible. Los estados NO DEBEN comunicarse solo con color.

**Justificación:** los resultados clínicos deben leerse correctamente en cualquier dispositivo, y una interfaz inconsistente o poco legible favorece errores de interpretación.

### VIII. Código limpio, tipado y verificable

- El código de la aplicación DEBE escribirse en TypeScript con modo `strict` activo.
- NO DEBE usarse `any`. Los valores de tipo desconocido DEBEN declararse como `unknown` y validarse antes de usarse.
- Los datos externos (formularios, API, archivos, respuestas de servicios) DEBEN validarse al entrar a la aplicación.
- NO DEBEN silenciarse errores de tipos o de lint sin un comentario que explique el motivo.
- Las reglas de código automatizables DEBEN configurarse en las herramientas del proyecto a medida que el código las requiera.
- El código DEBE seguir los criterios de `memory/coding-standards.md`.

**Justificación:** en una plataforma clínica, un dato mal tipado o sin validar puede terminar en un resultado incorrecto, y el código legible reduce los errores al revisarlo y modificarlo.

## Restricciones técnicas y de seguridad

**Stack aprobado.** Cambiar cualquiera de estas tecnologías requiere una enmienda:

- **Aplicación:** Next.js, React y TypeScript sobre Node.js en Amazon EC2.
- **Datos:** Prisma con PostgreSQL en Amazon RDS, con un `PrismaClient` compartido por proceso.
- **Autenticación:** Amazon Cognito. La aplicación DEBE validar los JWT y autorizar cada operación.
- **Archivos:** Amazon S3 con acceso privado.
- **Inferencia:** Amazon SageMaker AI, consumido mediante un adaptador.
- **Infraestructura:** Terraform.

**Límites de responsabilidad.** El entrenamiento y el código Python/PyTorch de los modelos DEBEN vivir fuera de este repositorio.

**Next.js.** La versión instalada tiene cambios incompatibles con versiones anteriores. Antes de escribir código de Next.js, DEBE leerse la guía correspondiente en `node_modules/next/dist/docs/` y respetarse sus avisos de deprecación.

## Flujo de desarrollo y controles de calidad

- Cada funcionalidad DEBE especificarse en `specs/` y seguir el flujo de Spec Kit: especificación, plan, tareas e implementación.
- Cada plan DEBE superar el Constitution Check. Toda violación DEBE justificarse en el plan, en la sección prevista para ello, o la propuesta DEBE cambiarse.
- Antes de integrar un cambio, `npm run lint` y `npm run build` DEBEN finalizar sin errores.
- Las pruebas DEBEN ser proporcionales al riesgo del cambio:
  - **Tareas complejas:** las que tocan reglas de negocio, casos de uso, estados de análisis, autorización, persistencia o integraciones externas. El código nuevo o modificado DEBE alcanzar al menos 80 % de cobertura de líneas.
  - **Cambios simples:** estilos, textos o ajustes visuales sin lógica. NO requieren pruebas nuevas.
- Toda operación sobre datos de una clínica DEBE tener una prueba de integración que verifique el rechazo del acceso desde otra clínica.
- Todas las pruebas DEBEN ubicarse en `tests/`, incluidas las unitarias.

## Governance

Esta constitución prevalece sobre la documentación y las prácticas del proyecto. La carpeta
`memory/` aporta el detalle y NO DEBE contradecirla; si surge un conflicto, se corrige `memory/` o se enmienda este documento:

- `memory/platform-context.md`: negocio, usuarios y alcance del producto.
- `memory/architecture.md`: arquitectura, tecnologías y flujo funcional.
- `memory/project-structure.md`: estructura de carpetas y reglas de organización.
- `memory/design-patterns.md`: patrones de diseño y criterios para aplicarlos.
- `memory/design.md`: identidad visual y reglas de interfaz.
- `memory/coding-standards.md`: buenas prácticas de código y clean code.

**Enmiendas.** Toda enmienda DEBE modificar este archivo, explicar el motivo, contar con la
aprobación del responsable del proyecto y actualizar los documentos de `memory/` afectados.

**Versionado.** La versión sigue el esquema semántico:

- **MAJOR:** eliminación o redefinición incompatible de un principio o regla de gobierno.
- **MINOR:** nuevo principio o sección, o ampliación sustancial de una guía.
- **PATCH:** aclaraciones y correcciones de redacción sin cambio de significado.

**Cumplimiento.** Toda revisión de planes y cambios DEBE verificar el cumplimiento de esta
constitución. La complejidad adicional DEBE justificarse.

**Version**: 1.3.0 | **Ratified**: 2026-11-04 | **Last Amended**: 2026-11-04
