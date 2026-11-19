# Implementation Plan: ECG desde PDF e informe unificado

**Branch**: `feature/pdf-ecg-ingestion` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: `specs/010-pdf-unified-report/spec.md`, S1–S11. Plan documental, no autorización de implementación o prueba real.

## Summary

Agregar carga habitual de PDF Mortara y un informe por pedido con contribuciones independientes de EchoNext y E022. Conservar PDF original privado, señal/máscara y derivados; E022 real primero, con Mini NOT_AVAILABLE como omisión de cobertura sin ejecución/error/espera. Esperar solo las ejecuciones disponibles solicitadas y publicar completo/parcial/ninguno según cobertura válida, conservando la etapa futura de ambos modelos. Dos indicadores de función ventricular con igual jerarquía, sin fusión ni comparación clínica.

Se extienden `studies` y `analyses`, sin módulo/plataforma nueva: sobre de archivo versionado, documento de ejecuciones versionado, adaptadores de extracción/inferencia y componentes de informe. El lector y los adaptadores científicos existentes se reutilizan detrás de una frontera privada externa previa a SageMaker; su aislamiento/exposición es un entregable externo. La constitución mantiene SageMaker para inferencia numérica, sin enviarle el PDF original. No se implementa Python aquí ni se modifica otro repositorio.

## Technical Context

**Language/Version**: TypeScript strict, Node.js del proyecto; Next.js 16.4.4 y React 19.3.0 según `package.json`.

**Primary Dependencies**: zod 4, Prisma 7, SDK existentes de S3 y SageMaker. Sin dependencias nuevas.

**Storage**: PostgreSQL mediante PrismaClient compartido; un objeto privado cifrado por estudio en S3. `ecg1` permanece inmutable; nuevo `MEDPDF01` para PDFs, sin backfill.

**Testing**: Vitest (unit/integration), Testing Library, Playwright. TDD obligatorio para comportamiento; 80 % de líneas por archivo lógico modificado; pruebas de acceso cruzado por operación.

**Target Platform**: monolito Next en EC2; servicios científicos externos referenciados por versión, no desplegados por este plan.

**Project Type**: web full-stack modular hexagonal; sin API pública nueva de procesamiento.

**Performance Goals**: límites de seguridad, no SLA clínico: PDF máximo 2 MiB, extracción con tope 20 s, cada inferencia/preparación con tope 30 s en paralelo, pedido vencido a 120 s y refresco UI cada 3 s. Se preservan 30/120/3 s del flujo anterior. El límite de PDF reutiliza el presupuesto actual de carga de 3 MB; debe probarse el multipart real antes de habilitar. Sobre almacenado máximo 16 MiB, respuestas de extracción/inferencia acotadas según contrato. No se afirma latencia real medida.

**Constraints**: sin datos reales, secretos, ejecución externa, DB, Docker, nube, nuevos worktrees o mutaciones de repositorios externos en T1. Comandos Prisma y git commit reservados al responsable. Consultar guía Next instalada antes de escribir su código. G1–G4 en [research.md](research.md) condicionan únicamente las rutas reales que dependen de ellos.

**Scale/Scope**: un archivo por carga, un pedido activo por estudio, una o dos ejecuciones según disponibilidad congelada al pedir; mismos pacientes, roles y páginas. Sin lotes, colas, nuevos roles, migración de datos ni retirada de NPZ.

## Constitution Check

*GATE previo a investigación y revalidado tras el diseño: PASS para la propuesta. Los gates externos siguen abiertos; no son evidencia de cumplimiento runtime.*

| Principio/control | Antes y después del diseño |
|-------------------|---------------------------|
| I — apoyo clínico | Resultados válidos solamente; failed sin resultados; advertencia y ausencia de umbrales/fusión. |
| II — aislamiento | Actor/tenant de sesión, autorización antes de bytes/invocaciones, consultas tenant-scoped y prueba cruzada por operación, incluido original PDF. |
| III — hexagonal | Dominio puro; casos de uso por módulo; SDK solo en infraestructura; conexión entre módulos solo por composiciones. |
| IV — trazabilidad | Pedido agrupador, una o dos ejecuciones disponibles independientes con versión/fecha/estado y omisiones distintas de fallas; historial sin reescritura. |
| V — extensibilidad | Selección explícita ECG/análisis integrado; contratos nuevos discriminados, sin cambiar 005 o entradas históricas. |
| VI — datos | Original puede contener identificadores, es privado y cifrado; no entrenamiento ni retención indefinida; sin pacientes reales. |
| VII — interfaz | Tokens, claro/oscuro, teclado/foco, texto además de color y tres anchos; probado antes de integración. |
| VIII — verificabilidad | Validación externa zod, strict sin any; TDD, integración tenant, ≥80 % por archivo lógico, check/E2E antes de integrar código. |
| Stack y responsables | SageMaker para inferencia, Python fuera del repo, Prisma compartido; schema/SQL solo en unidad posterior autorizada y ejecución humana. |

## Project Structure

### Documentation (this feature)

- `spec.md`, `checklists/requirements.md`: requisitos y cierre de aclaraciones.
- `research.md`: decisiones y gates de evidencia, sin investigación duplicada de repositorios externos.
- `data-model.md`: sobre de estudio, snapshot de disponibilidad y ejecuciones, compatibilidad y transiciones.
- `contracts/processing-boundary.md`: extracción/inferencia externas, límites y validación.
- `contracts/study-and-report-ui.md`: acciones, original autorizado, informe e historial.
- `quickstart.md`: validación futura y condiciones de seguridad.
- `tasks.md`: unidades ordenadas con RED/GREEN/PRESERVE y superficies candidatas; ninguna se ejecuta ahora.
- Análisis de consistencia: reporte de solo lectura en el handoff; no archivo generado por `speckit-analyze`.

### Source Code (repository root)

Superficies propuestas para futuras delegaciones, no autorizadas por esta entrega documental:

```text
src/modules/studies/{domain,application,infrastructure}/
src/modules/studies/composition.ts
src/modules/analyses/{domain,application,infrastructure}/
src/modules/analyses/composition.ts
src/app/(dashboard)/_studies/{_actions,_components,_lib}/
src/app/(dashboard)/studies/[studyId]/page.tsx
src/app/(dashboard)/studies/[studyId]/original/route.ts
prisma/schema.prisma
prisma/migrations/20261116000000_pdf_unified_report/migration.sql
tests/unit/modules/{studies,analyses}/
tests/unit/app/studies/
tests/integration/{study-storage,analyses}/
tests/e2e/pdf-unified-report.spec.ts
```

**Structure Decision**: reutilizar `insertWithNextNumber` para numeración/transacción, `StudyFileStorage` para el único sobre y la compensación/conciliación existentes; extenderlas para nuevos formatos sin cambiar su camino NPZ. Reutilizar autorización y `after()`/refresco del flujo 008, con contratos discriminados que no conviertan el padre en un modelo ficticio. Mantener DTOs de servidor separados de los de navegador.

## Fases de entrega y límites

| Unidad | Resultado revisable | Dependencia |
|--------|---------------------|-------------|
| A | Dominio puro del informe: disponibilidad, omisiones, estados y publicación; pruebas sintéticas. | Sin referencia EchoNext, DB o servicios. Siguiente trabajo recomendado. |
| B | Codec versionado del estudio y puertos/fakes; persistencia aditiva del pedido integrado con concurrencia real. | Contratos de A; ejecución SQL/generación solo humana en DB de prueba autorizada. |
| C | Carga PDF, original privado, visor de señal cruda, compensación/eliminación y continuidad NPZ. | B; G1 solo para habilitar extractor real. No necesita G2 para guardar una extracción válida, pero no anuncia EchoNext disponible. |
| D | Coordinación de dos componentes y una UI común, fallos y vencimiento; fakes primero. | A/B; C para recorrido PDF completo; G2/G3 solo para adaptadores científicos reales. |
| E | Verificación local real autorizada y revisión independiente de riesgos. | G1/G3/G4 para PARTIAL; también G2 para COMPLETE, con evidencia. Sin despliegue ni merge automático. |

Las unidades comparten casos de uso/repositorios: ejecutar un único hilo de edición e integrar cada corte antes de tocar el siguiente, no paralelizar cambios en archivos comunes. La carga de revisión abarca almacenamiento clínico, schema, estados, privacidad y UI: no aprobar todo como un parche único. El padre acuerda los cortes antes de fuente/commits; revisiones de riesgo en B/C y D/E, sin burocracia por archivo.

## Primer corte vertical y orden actualizado S11

Tras el dominio A, entregar codec/lector y carga privada, persistencia mínima del pedido con snapshot de capacidades, transporte E022 real existente e informe único PARTIAL. Probar primero con fakes tipados y después, bajo autorización concreta, con imagen/pesos E022 y lector Mortara suministrados. La frontera privada del lector sigue fuera del repo; no autoriza modificarla en otro repositorio. La ruta local de validación puede usar transporte HTTP directo al contenedor como prueba de 005, sin cambiar SageMaker como destino aprobado de producción. Ni el arranque local ni la DB se ejecutan en T1. Mini queda preparado por contrato y difiere su habilitación hasta G2; no bloquea este corte vertical.

## Corte UI acotado S12–S13 (T8)

El objetivo aceptado es el recorrido funcional PDF→E022→informe, no una maqueta. Primero se integra un `PdfDropzone` controlado por el formulario existente: un único `selectedFile` para drop/selector nativo, nombre/tamaño locales, reemplazo/eliminación y la misma validación de cantidad/extensión/tamaño. El formulario pone ese `File` en el `FormData` enviado a la acción existente; no se modifica ni habilita la acción PDF en este corte. La validación real del contenido sigue en el servidor. La ruta NPZ y ECG explícito se conservan.

`useActionState`/`SubmitButton` reflejan únicamente la promesa de carga: sin temporizadores, porcentaje ni etapa de análisis ficticia. Se conserva el aviso de indisponibilidad PDF, se sanea un rechazo de transporte y el cambio de formato desmonta archivo/feedback anteriores, incluso ante una respuesta tardía. Se reutilizan tokens, botones, `FormMessage`, foco y anuncios semánticos; DOM/unit no prueba teclado nativo del navegador, contraste o responsive real. La siguiente integración de preparación/inferencia/informe corresponde a T3/T4 del ODD y tareas pendientes, no se declara satisfecha por este corte.

La verificación de esta unidad usa Vitest aislado `envDir:false`, dependencias sibling instaladas en lectura y cache propia `medicia-pdf-dropzone`. El diferencial anterior del formulario permanece fallido/pendiente con presupuesto agotado: no se repara, reintenta ni reemplaza por otro runner. Check completo, E2E/Next/browser y revisión independiente siguen pendientes; T7 permanece intacta.

## Compatibilidad y habilitación

- Ruta NPZ, `MEDECG01`, `ModelInference` de 005/008, respuestas previas y resultados históricos siguen disponibles sin reinterpretación. PDF es la opción normal nueva, no una autorización para retirar NPZ. Mantener su acceso explícito de compatibilidad hasta otra decisión trazable.
- El contrato crudo/de preparación no se envía al endpoint legacy. La preparación externa entrega el contrato numérico EchoNext de 005; su adaptador real existente se reutiliza sin modificación científica. E022 recibe únicamente su entrada numérica preparada, con normalización en la etapa confirmada por G3, nunca duplicada. Adaptadores reales nuevos se habilitan solo con sus referencias/versiones aprobadas; fakes están claramente identificados. Falta de configuración nunca selecciona un fake silenciosamente.
- Una extracción válida permite guardar/ver el estudio aunque un modelo no sea compatible. Se localizó y leyó el adaptador experimental E031 indicado por el humano; no hay que inventar uno desde cero. Sus convenciones académicas, parámetros de onda aún ausentes y evidencia solo FEVI requieren verificación antes de habilitar las doce salidas PDF. Sin G2, EchoNext es NOT_AVAILABLE: no se crea ejecución, no se invoca ni genera error del usuario. Con G1/G3/G4 cerrados, el primer corte vertical PDF→E022 real→informe publica PARTIAL al terminar E022, sin esperar Mini y nunca COMPLETE. Su imagen/pesos tienen hashes verificados, no ejecución demostrada; el daemon Docker local necesita disponibilidad antes de probar el contenedor. La ruta simulada solo existe en desarrollo/pruebas y no es prueba científica.
- Escribir schema/SQL y código que use el cliente generado exige una futura delegación explícita. El responsable ejecuta `npx prisma migrate deploy` y `npx prisma generate` solo contra el entorno de prueba autorizado; no se ejecutan en T1.
- Permisos nuevos de invocación de endpoints externos son un entregable de infraestructura separado. No se amplían IAM ni Terraform dentro de la implementación segura del dominio/UI.
