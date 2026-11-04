# Patrones de diseño del proyecto

## Objetivo

Definir los patrones de diseño que orientan la implementación de la plataforma. Se aplican cuando resuelven una necesidad concreta; no se introducen interfaces, clases ni abstracciones solo para cumplir un patrón.

## Patrones principales

### Strategy

**Aplicación en la plataforma:** Permitir distintas estrategias de preparación o procesamiento según el tipo de estudio médico (ECG, radiografía, ecocardiograma, etc.).

### Factory / Registry

**Aplicación en la plataforma:** Resolver el procesador correspondiente al estudio seleccionado y el modelo especializado para el análisis solicitado. La selección de modelos puede basarse en un catálogo o configuración; no exige una fábrica de clases por modelo.

### Adapter

**Aplicación en la plataforma:** Encapsular la comunicación con servicios externos, como Amazon S3 y SageMaker, detrás de contratos definidos por la aplicación.

### Repository

**Aplicación en la plataforma:** Abstraer las operaciones de persistencia de estudios, análisis, clínicas y versiones de modelos; utilizar Prisma y PostgreSQL en las implementaciones concretas.

### Dependency Injection

**Aplicación en la plataforma:** Proporcionar a los casos de uso las implementaciones de sus dependencias sin acoplarlos directamente a ellas, facilitando sustituciones y pruebas.

### Singleton (PrismaClient)

**Aplicación en la plataforma:** Reutilizar una instancia de `PrismaClient` por proceso de Node.js para evitar clientes y pools de conexiones innecesarios. No representa una instancia única entre servidores.

## Patrones según necesidad

### Facade

**Cuándo utilizarlo:** Cuando resulte útil ofrecer una interfaz simple para coordinar varias operaciones de un análisis sin exponer esa complejidad a quien lo invoca.

### State

**Cuándo utilizarlo:** Cuando las transiciones y reglas entre estados de análisis (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`) adquieran complejidad. Inicialmente pueden gestionarse con estados y validaciones explícitas.

### Procesamiento asíncrono basado en colas

**Cuándo utilizarlo:** Cuando la inferencia tarde demasiado para una solicitud HTTP o requiera reintentos y procesamiento desacoplado. Puede implementarse con una cola de trabajos y workers, por ejemplo Amazon SQS. Es un patrón de integración, no un patrón GoF.

## Criterios de aplicación

- Elegir el patrón por el problema que resuelve, no por obligación.
- Evitar fábricas, interfaces y capas de delegación sin utilidad real.
- Mantener las dependencias hacia contratos y separar las implementaciones externas de la lógica de negocio.
- Favorecer implementaciones simples, legibles y testeables.
- Revisar el uso de cada patrón cuando aparezcan nuevas necesidades, sin anticipar complejidad innecesaria.

## Alcance

Este documento describe **patrones y criterios para aplicarlos**. Las decisiones de arquitectura, estructura de carpetas, infraestructura y flujos funcionales se documentan por separado en `memory/architecture.md` y `memory/project-structure.md`.
