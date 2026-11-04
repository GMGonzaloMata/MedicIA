# Buenas prácticas de código

## Objetivo

Definir los criterios de código para cualquier persona o agente que modifique la plataforma. Este documento complementa a `.specify/memory/constitution.md`, que prevalece ante cualquier conflicto. La arquitectura, la estructura, los patrones y el diseño visual se detallan en sus propios documentos de `memory/`; aquí solo se indica cómo aplicarlos al escribir código.

## Forma de trabajo

- Leer el código cercano antes de cambiarlo y seguir los patrones ya usados.
- Limitarse al alcance de la tarea; evitar refactors no solicitados.
- No revertir cambios existentes que no sean propios.
- Priorizar soluciones simples, conservadoras y fáciles de revisar.
- Mejorar el código que se está tocando cuando sea parte de la tarea; lo demás se propone por separado.

## Clean code

### Nombres

- Usar nombres que revelen la intención, sin abreviaturas ambiguas.
- Escribir los identificadores en inglés, igual que los módulos y estados del proyecto.
- Seguir esta convención de escritura:
  - `camelCase`: variables, funciones, parámetros, propiedades, y campos de Prisma y de la API (`tenantId`, `getStudyById`).
  - `UPPER_SNAKE_CASE`: constantes y valores de enumeraciones (`MAX_FILE_SIZE`, `PENDING`).
  - `PascalCase`: tipos, interfaces, clases y componentes de React (`Study`, `AnalysisCard`).
  - `kebab-case`: archivos y carpetas propios (`study-repository.ts`, `use-cases/`).
  - `snake_case`: tablas y columnas de PostgreSQL (`tenant_id`), mapeadas con `@map` y `@@map` en Prisma.
- Nombrar los booleanos como afirmaciones: `isCompleted`, `hasFindings`.
- Usar siempre el mismo término para cada concepto del dominio:
  - Clínica: `Tenant`.
  - Estudio: `Study`.
  - Análisis: `Analysis`.
  - Hallazgo: `Finding`.
  - Versión de modelo: `ModelVersion`.
- El `tenant_id` que mencionan los demás documentos se escribe `tenantId` en TypeScript.
- No usar `diagnosis` ni términos equivalentes para nombrar resultados de IA.

### Funciones

- Cada función hace una sola cosa, en un único nivel de abstracción.
- Usar cláusulas de guarda y retornos tempranos en lugar de anidar condiciones.
- Si una función necesita más de tres parámetros, agruparlos en un objeto con nombre.
- Evitar parámetros booleanos que cambien el comportamiento; preferir funciones separadas.
- Evitar efectos secundarios ocultos: una función que consulta no modifica.

### Claridad

- Centralizar valores mágicos en constantes con nombre.
- Representar estados y opciones cerradas con tipos o enumeraciones, no con cadenas sueltas.
- No dejar código muerto ni comentado; el historial queda en git.
- Extraer código cuando dos fragmentos representan la misma regla; no unificar código que solo se parece.

### Errores

- No silenciar errores ni dejar bloques `catch` vacíos.
- Usar errores propios para los casos de negocio y traducirlos a HTTP o a mensajes de interfaz en la capa de presentación.
- No mostrar al usuario detalles internos, como trazas o mensajes de servicios externos.
- No registrar en logs datos clínicos, datos de pacientes, tokens ni secretos.

## TypeScript

- No usar `any`.
- No usar aserciones (`as`, `!`) para esquivar un error de tipos sin un comentario que explique el motivo.
- Declarar tipos explícitos en puertos, casos de uso y funciones exportadas de los módulos.
- Validar los datos externos al entrar a la aplicación: formularios, parámetros de API, archivos y respuestas de servicios.
- Ubicar los tipos junto a su módulo si son locales, y en `src/shared/types/` si son transversales.

## Arquitectura en el código

### Dependencias entre capas

- `domain/` no importa de `application/` ni de `infrastructure/`, ni usa Next.js, Prisma o SDK de AWS.
- `application/` depende del dominio y de sus puertos; recibe las implementaciones por inyección.
- `infrastructure/` implementa los puertos de salida definidos en `application/ports/out/`. Es el único lugar que usa Prisma y los SDK de AWS.
- `src/modules/<módulo>/composition.ts` conecta los casos de uso con sus implementaciones.
- `src/app/` obtiene los casos de uso de `composition.ts` y los invoca. Ni `src/app/` ni `src/components/` importan repositorios, Prisma o SDK de AWS.
- Un módulo usa a otro mediante sus puertos de entrada; no importa su infraestructura.

### Datos

- Los tipos de Prisma y las respuestas de AWS no salen de la infraestructura; se convierten a tipos del dominio.
- Los repositorios de datos de una clínica reciben `tenantId` de forma explícita en cada operación.
- Los módulos de infraestructura se marcan con `import 'server-only'` para evitar que lleguen al cliente. Fuera de Next.js, como en las pruebas, ese import debe reemplazarse con un mock.
- Un nuevo tipo de estudio se incorpora registrando su procesador, no agregando `if` o `switch` en los casos de uso (ver `memory/design-patterns.md`).

### Server Actions y Route Handlers

Se mantienen delgados y siguen este orden:

1. Autenticar y autorizar dentro de cada uno. Las Server Actions se pueden invocar por POST directo, sin pasar por la interfaz.
2. Obtener el `tenantId` del contexto autenticado.
3. Validar la forma de la entrada. Las reglas de negocio, como los requisitos del archivo para cada análisis, se validan en el caso de uso.
4. Invocar el caso de uso.
5. Devolver solo lo que el cliente necesita.

## Componentes

- Usar Server Components por defecto y `'use client'` solo en los componentes que necesitan interactividad o API del navegador.
- Pasar a los Client Components únicamente los campos que necesitan, nunca registros completos ni secretos.
- Crear componentes reutilizables cuando la funcionalidad se repite, sin anticiparse a usos que aún no existen.
- Mantener los componentes enfocados en la interfaz y delegar la lógica auxiliar en funciones o hooks.
- Manejar los estados de carga, error y datos vacíos cuando la vista los requiera, y los estados del análisis donde se muestren.
- Escribir los textos de la interfaz en español y presentar los resultados como posibles hallazgos.
- En títulos, párrafos y demás textos de la interfaz, usar mayúscula inicial solo en la primera palabra: "Integración de electrocardiogramas", no "Integración De Electrocardiogramas". Los nombres propios y las siglas conservan sus mayúsculas, como "MedicIA" o "ECG".
- Aplicar los tokens y las reglas de `memory/design.md`.

## Dónde ubicar cada cosa

- Componente de una sola pantalla: junto a su ruta, en `src/app/**/_components/`.
- Componente reutilizable: `src/components/`.
- Entidades y reglas de negocio: `src/modules/<módulo>/domain/`.
- Casos de uso: `src/modules/<módulo>/application/use-cases/`.
- Contratos: `src/modules/<módulo>/application/ports/`.
- Implementaciones con Prisma: `src/modules/<módulo>/infrastructure/repositories/`.
- Integraciones propias de un módulo: `src/modules/<módulo>/infrastructure/adapters/`.
- Conexión de casos de uso con sus implementaciones: `src/modules/<módulo>/composition.ts`.
- Integraciones compartidas: `src/infrastructure/`.
- Tipos, utilidades y constantes transversales: `src/shared/`.
- Pruebas unitarias: `tests/unit/`, replicando la estructura de `src/`.
- Pruebas de integración: `tests/integration/`.
- Pruebas E2E: `tests/e2e/`.

Crear archivos y carpetas solo cuando aporten claridad real, sin dejar carpetas vacías.

## Dependencias

- Usar las librerías instaladas cuando cubran la necesidad.
- No agregar dependencias sin una razón clara.
- Preferir las API oficiales de las librerías.

## Comentarios y documentación

- Escribir la documentación y los comentarios en español.
- Comentar solo decisiones, reglas de negocio o partes no obvias del código.
- Explicar el código en sí: qué problema resuelve o por qué se eligió ese enfoque. No repetir lo que el código ya dice ni parafrasear el pedido que originó el cambio.
- Documentar el propósito y el uso básico de cada configuración o integración externa nueva.

## Verificación

- Ejecutar las validaciones exigidas por la constitución según el tipo de cambio.
- Si una validación no se puede ejecutar, informarlo con claridad.
- Antes de terminar, revisar que el cambio responda al pedido y no afecte comportamiento no relacionado.
