# Revisión de seguridad y multi-tenancy

Buscá fallas que permitan acceder a datos de otra clínica, operar sin autorización o exponer información clínica. Si la skill `security-audit` está disponible, usala solo en modo de guía (*guidance mode*): no ejecutes su auditoría completa ni crees archivos.

Documentos de referencia: los principios II y VI de la constitución, `memory/architecture.md` y `memory/coding-standards.md`.

## Qué comprobar

- **Origen del tenant:** el `tenantId` sale del contexto autenticado y nunca de parámetros, cuerpo, cabeceras o formularios del cliente.
- **Autenticación y autorización:** cada Server Action y Route Handler las verifica adentro, porque se puede invocar sin pasar por la interfaz. Que lo haga un layout o una pantalla no alcanza.
- **Permisos sobre el recurso:** además de la sesión, se comprueba que el recurso pertenezca a la clínica del usuario.
- **Consultas:** toda lectura y escritura sobre datos de una clínica filtra por tenant, incluidas las búsquedas por `id`, las actualizaciones, los borrados y las relaciones.
- **Prueba de aislamiento:** cada operación nueva sobre datos de una clínica tiene una prueba de integración en `tests/integration/` que verifica el rechazo desde otra clínica, y esa prueba falla si se quita el control.
- **Archivos en S3:** los objetos son privados, el acceso se autoriza por clínica y las rutas no se arman con datos sin validar. Los prefijos por tenant no cuentan como barrera por sí solos.
- **Entradas:** formularios, parámetros, archivos y respuestas de servicios se validan antes de usarse.
- **Datos que salen:** las respuestas y las props de Client Components incluyen solo lo necesario, sin registros completos, secretos ni detalles internos.
- **Logs y errores:** no incluyen datos clínicos, datos de pacientes, tokens ni secretos, y el usuario no ve trazas ni mensajes de servicios externos.
- **Secretos:** no hay credenciales en el código, y el código de servidor está protegido con `server-only`.
- **Uso secundario:** los estudios no se reutilizan, por ejemplo para entrenamiento, sin una finalidad y una autorización definidas.
