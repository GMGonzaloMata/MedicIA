# Arquitectura del proyecto

## 1. Arquitectura de software

- **Estilo:** Monolito modular con Next.js full-stack.
- **Enfoque:** Principios de arquitectura hexagonal y SOLID, aplicados de forma pragmática.
- **Módulos de negocio:** Clínicas (tenants), usuarios, estudios, análisis y catálogo/versiones de modelos.
- **Objetivo:** Mantener la lógica de negocio desacoplada de la interfaz, la base de datos y los servicios AWS, permitiendo incorporar nuevos tipos de estudios y análisis.

### Capas

- **Presentación:** Server Components y Client Components de Next.js; Server Actions para operaciones de la web y Route Handlers para la API REST.
- **Aplicación:** Casos de uso, servicios de aplicación y puertos de entrada y salida que permiten coordinar operaciones sin depender de implementaciones externas.
- **Dominio:** Entidades, objetos de valor y reglas de negocio independientes de tecnologías externas.
- **Infraestructura:** Implementaciones de persistencia y adaptadores para Cognito, S3 y SageMaker.

### Reglas principales

- Separar módulos y capas; evitar lógica de negocio en componentes React o controladores HTTP.
- Validar autenticación, autorización y pertenencia a la clínica en cada operación sensible.
- Un estudio puede tener múltiples análisis. Cada análisis debe conservar trazabilidad de sus hallazgos y de la versión exacta del modelo utilizado.
- Permitir agregar nuevos estudios y modelos sin rehacer el núcleo de la plataforma.

## 2. Componentes y tecnologías

### Aplicación web y API

- **Tecnología:** Next.js, React y TypeScript, ejecutados en Node.js sobre Amazon EC2.
- **Responsabilidad:** Interfaz de usuario, Server Actions, Route Handlers y coordinación de los análisis.

### Acceso a datos

- **Tecnología:** Prisma.
- **Responsabilidad:** Consultas y transacciones sobre PostgreSQL.

### Autenticación

- **Tecnología:** Amazon Cognito.
- **Responsabilidad:** Registro, verificación del correo, inicio de sesión y recuperación de contraseña. La aplicación valida el JWT que emite Cognito al iniciar sesión y lo descarta; después mantiene su propia sesión en la base de datos, con una cookie opaca, y autoriza cada operación contra esa sesión y los vínculos vigentes de la persona.

### Base de datos

- **Tecnología:** Amazon RDS con PostgreSQL.
- **Responsabilidad:** Persistencia de clínicas, usuarios, estudios, análisis, hallazgos y versiones de modelos.

### Almacenamiento de archivos

- **Tecnología:** Amazon S3.
- **Responsabilidad:** Conservar estudios originales y, cuando sea necesario, archivos procesados, con aislamiento por clínica y acceso privado.

### Inferencia de inteligencia artificial

- **Tecnología:** Amazon SageMaker AI; modelos desarrollados en Python y PyTorch.
- **Responsabilidad:** Ejecutar modelos especializados y devolver resultados de inferencia. El preprocesamiento científico se realiza en Python dentro de SageMaker o mediante un componente especializado, coordinado por la aplicación.

### Infraestructura como código

- **Tecnología:** Terraform, gestionado en un repositorio separado.
- **Responsabilidad:** Aprovisionar y gestionar los recursos de AWS; no participa en el procesamiento de cada solicitud.

## 3. Flujo funcional

1. El usuario se autentica y selecciona el tipo de estudio y análisis.
2. La aplicación valida permisos, recibe el archivo y lo almacena en S3.
3. Registra el estudio y su estado en RDS.
4. Coordina el preprocesamiento correspondiente y envía la entrada al modelo desplegado en SageMaker.
5. Recibe la inferencia y guarda el análisis, los hallazgos y la versión del modelo en RDS. Cada análisis mantiene un estado (PENDING, PROCESSING, COMPLETED o FAILED) y registra errores sin generar resultados clínicos inválidos.
6. Muestra al usuario el resultado y permite consultar el historial autorizado.

## 4. Multi-tenancy

La plataforma atiende a múltiples clínicas con aislamiento lógico de información. El `tenant_id` se obtiene del contexto autenticado y autorizado, nunca de un parámetro arbitrario del cliente. Todas las operaciones verifican la pertenencia a la clínica. RDS restringe las consultas por tenant y puede utilizar Row-Level Security (RLS) como defensa adicional. S3 mantiene los objetos privados con accesos autorizados por clínica; los prefijos por tenant no constituyen por sí solos una barrera de seguridad.

## 5. Evolución

La primera capacidad es el análisis de ECG. La arquitectura permite incorporar nuevos tipos de estudio, procesadores y modelos especializados sin cambiar el flujo general de la plataforma.
