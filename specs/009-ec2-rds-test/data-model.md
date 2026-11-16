# Modelo de configuración y estados

No se cambia el esquema Prisma en esta entrega documental ni en las unidades independientes EC2/RDS. Se conservan tenantId, sesiones y estados PENDING/PROCESSING/COMPLETED/FAILED. No se usa IaC para transportar datos clínicos.

| Entidad | Campos/validaciones | Relación/lifecycle |
| --- | --- | --- |
| DemoDeployment | enabled por defecto false; environment solo dev; hostname DuckDNS no vacío al habilitar; release_key y sha256 obligatorios al publicar | Disabled → provisionado → configurado → HTTPS verificado → compartible; fallas no promueven estado |
| DemoNetwork | CIDR privado válido sin solapamiento comprobado humano; AZ distintas; dos subredes DB privadas; app subnet pública | DB no tiene ruta Internet; SG DB solo app:5432 |
| DemoDatabase | PostgreSQL compatible, cifrado, Single-AZ, backup 7 días, master managed, protección de borrado | Sin cambio de credenciales master vía Terraform; app usa usuario limitado preparado humano |
| RuntimeSecretReference | ARN no vacío y del entorno; valor nunca en Terraform; separar app y DuckDNS | Ausente o malformado → servicio no arranca, mensaje sin valores |
| WebRelease | clave versionada, checksum SHA-256 de 64 hex, Linux amd64, cliente Prisma preexistente | Verificado → instalado → activado; checksum incorrecto no cambia release activo |
| InferenceService | identidad EchoNext-Mini o FEVI ECGFounder+E022; referencias/versión reales externas; enabled por defecto false | Pendiente artefactos → contrato validado → preparado → habilitado humano → comprobado |
| HostImage | AMI estándar oficial AL2023 x86_64 con ID fijo y evidencia de procedencia/system-release/repos exactamente2023.12.20261021; no imagen personalizada con herramientas previas | Imagen comprobada → prerrequisitos preparados → arranque intentado; falla no acredita aplicación ni nube disponibles. Metadatos operativos, no tabla Prisma. [FR-015] |
| ValidationEvidence | control, fecha, entorno, resultado observado/pendiente, responsable | No contiene secretos, trazas con payload ni estudios individuales |

## Integración futura, no esquema inventado

Analysis.probabilities actual es JSON validado con doce probabilidades EchoNext, no un contenedor FEVI genérico. Tras recibir contrato FEVI se diseñará discriminador de capacidad y resultado versionado, manteniendo lectura de filas históricas y versión exacta del contenedor/cadena. La selección se resuelve por registro de capacidades autorizadas; tenantId nunca llega del formulario. Restricciones de entrada/rangos/unidades FEVI y cambios de persistencia no pueden fijarse sin el contrato externo.

No se agregan estados persistidos de infraestructura a la base de negocio: los estados de la tabla son evidencia operativa, no una nueva máquina de estados de aplicación.
