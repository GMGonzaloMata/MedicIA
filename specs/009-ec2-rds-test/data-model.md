# Modelo de configuración y estados

No se cambia el esquema Prisma en esta entrega documental ni en las unidades independientes EC2/RDS. Se conservan tenantId, sesiones y estados PENDING/PROCESSING/COMPLETED/FAILED. No se usa IaC para transportar datos clínicos.

| Entidad | Campos/validaciones | Relación/lifecycle |
| --- | --- | --- |
| DemoDeployment | enabled por defecto false; app_enabled opcional true; environment solo dev; AMI/evidencia/motor/snapshot obligatorios al habilitar; hostname/release_key/sha256 obligatorios al activar | Disabled → infraestructura sola o arranque intentado → configurado → HTTPS verificado → compartible; no transición en sitio garantizada [FR-016/017] |
| DemoNetwork | CIDR privado válido sin solapamiento comprobado humano; AZ distintas; dos subredes DB privadas; app subnet pública | DB no tiene ruta Internet; SG DB solo app:5432 |
| DemoDatabase | PostgreSQL compatible, cifrado, Single-AZ, backup 7 días, master managed, protección de borrado | Sin cambio de credenciales master vía Terraform; app usa usuario limitado preparado humano |
| RuntimeSecretReference | ARN no vacío y del entorno; valor nunca en Terraform; separar app y DuckDNS | Ausente o malformado → servicio no arranca, mensaje sin valores |
| WebRelease | clave versionada, checksum SHA-256 de 64 hex, Linux amd64, cliente Prisma preexistente | Verificado → instalado → activado; checksum incorrecto no cambia release activo |
| InferenceService | identidad EchoNext-Mini o FEVI ECGFounder+E022; referencias/versión reales externas; enabled por defecto false | Pendiente artefactos → contrato validado → preparado → habilitado humano → comprobado |
| HostImage | AMI estándar oficial AL2023 x86_64 con ID fijo y evidencia de procedencia/system-release/repos exactamente2023.12.20261021; no imagen personalizada con herramientas previas | Imagen comprobada → prerrequisitos preparados → arranque intentado; falla no acredita aplicación ni nube disponibles. Metadatos operativos, no tabla Prisma. [FR-015] |
| ValidationEvidence | control, fecha, entorno, resultado observado/pendiente, responsable | No contiene secretos, trazas con payload ni estudios individuales |

## Control de activación (contrato propuesto, todavía sin fuente)

- Raíz `demo.app_enabled = optional(bool, true)`; módulo host `app_enabled` bool, default true, no nullable. `demo.enabled=false` sigue sin crear módulos y devuelve output demo null; no se reinterpretan llamadores anteriores.
- Con demo habilitada, AMI/evidencia/motor/snapshot y todos los guards de infraestructura siguen obligatorios, independientemente de app_enabled.
- Con app_enabled=false, `public_hostname`, `release_key`, `release_sha256` admiten `""`/omisión, sin valores de relleno. Si se aportan no vacíos conservan sus validaciones actuales. En host esos tres strings reciben default `""`; con app_enabled=true se rechaza vacío igual que antes, con los mismos errores existentes.
- `accept_acme_terms=false` es obligatorio en infraestructura sola; true se rechaza en raíz/host. Nuevo error exacto: `Infraestructura sola requiere accept_acme_terms=false.` El contacto conserva su validación previa, sin volverlo obligatorio cuando terms=false.
- runtime_references no se relaja: la raíz ya aporta referencias reales conocidas de Cognito/S3/EchoNext; no exige endpoint encendido ni FEVI. No crear ARNs ficticios ni permisos alternativos.
- Con infraestructura sola, output demo conserva IDs/metadata de RDS/EC2/EIP/bucket/ARNs de secretos, pero public_hostname/public_url/release_key son null. No URL `https://` vacía ni readiness; output demo apagado permanece null y modo activo conserva campos/valores previos. El output release_key directo del host puede ser `""`, no evidencia de release.
- Activar/desactivar o modificar entradas que alteran user-data puede reemplazar EC2 por `user_data_replace_on_change=true`; no equivale a apagar servicios de una instancia existente. Estado local/certificados/tmpfs no se garantizan conservados; RDS y sus protecciones no cambian.

## Integración futura, no esquema inventado

Analysis.probabilities actual es JSON validado con doce probabilidades EchoNext, no un contenedor FEVI genérico. Tras recibir contrato FEVI se diseñará discriminador de capacidad y resultado versionado, manteniendo lectura de filas históricas y versión exacta del contenedor/cadena. La selección se resuelve por registro de capacidades autorizadas; tenantId nunca llega del formulario. Restricciones de entrada/rangos/unidades FEVI y cambios de persistencia no pueden fijarse sin el contrato externo.

No se agregan estados persistidos de infraestructura a la base de negocio: los estados de la tabla son evidencia operativa, no una nueva máquina de estados de aplicación.
