# Revisión de infraestructura (Terraform)

Buscá fallas de seguridad, de aislamiento entre entornos y de configuración en el código de infraestructura (carpeta `infra/`, archivos `.tf`, `.tfvars`, `.tftest.hcl` y el flujo de CI que los ejecuta). Si las skills `terraform-style-guide` y `terraform-skill` están disponibles, usalas solo como guía de referencia: no sigas su "Response Contract", no ejecutes comandos ni crees archivos.

Documentos de referencia: la constitución, `memory/architecture.md` y, para Cognito, `specs/002-ingreso-sesion/contracts/identity-provider.md` (sección "Configuración requerida del grupo de usuarios").

Sos de solo lectura: no ejecutás `terraform`, `tflint`, `trivy` ni `checkov`. Comprobá que el flujo de CI los ejecute y que los resultados se respeten; si no, informalo.

## Qué comprobar

- **Secretos:** no hay contraseñas, claves ni tokens en archivos `.tf` o `.tfvars` versionados. Las variables sensibles usan `sensitive = true`, y los valores se obtienen de un gestor de secretos o de variables de entorno. Recordá que `sensitive` solo oculta la salida: el valor igual queda en el estado.
- **Archivos que no se versionan:** `*.tfstate`, `*.tfstate.backup`, `.terraform/`, `*.tfplan` y los `.tfvars` con datos sensibles están en `.gitignore`. El archivo `.terraform.lock.hcl` sí se versiona.
- **Estado remoto:** el estado usa un backend remoto con cifrado, versionado y bloqueo, nunca estado local. Cada entorno (desarrollo y producción) tiene su propio estado, sin compartirlo.
- **IAM de mínimo privilegio:** no hay `"*"` en acciones ni en recursos sin justificación. Los permisos del rol del servidor se limitan a lo que la aplicación usa y al recurso concreto (por ejemplo, `cognito-idp:AdminSetUserPassword` solo sobre el grupo de usuarios, y ninguna otra acción de administración). No hay credenciales de larga duración para la aplicación.
- **Cognito:** el grupo de usuarios coincide con el contrato de la funcionalidad 002:
  - inicio de sesión con correo, sin distinguir mayúsculas;
  - política de contraseña de 8 caracteres como mínimo y al menos una mayúscula, sin exigir nada más;
  - un único cliente de aplicación con autoregistro, con secreto de cliente y solo el flujo `ALLOW_USER_PASSWORD_AUTH`;
  - `prevent_user_existence_errors` activado;
  - sin interfaz alojada (*managed login*) que permita registro;
  - ID token con la validez mínima.
- **S3:** los buckets de estudios y resultados bloquean todo acceso público, cifran en reposo y exigen TLS. El acceso por clínica lo resuelve la aplicación, no la política del bucket.
- **Base de datos:** RDS cifrado, sin acceso público, en subredes privadas, con copias de seguridad, y sus grupos de seguridad no abren puertos a `0.0.0.0/0`.
- **Red:** ningún grupo de seguridad abre puertos de administración (SSH, base de datos) a internet. No se usa la VPC por defecto.
- **Datos clínicos:** nada de lo aprovisionado los expone ni los copia a destinos sin cifrado o sin control de acceso. Los registros (logs) no los incluyen.
- **Cambios destructivos:** los recursos con datos (RDS, buckets con estudios) tienen `prevent_destroy` o una protección equivalente. Los refactores usan bloques `moved` para no destruir ni recrear recursos. Un cambio que reemplace un recurso con datos se informa como bloqueante.
- **Versiones:** la versión de Terraform y las de los proveedores están fijadas, y las actualizaciones van en un cambio aparte de las funcionales.
- **Etiquetas:** los recursos llevan etiquetas de proyecto, entorno y gestión (por ejemplo, con `default_tags`).
- **Estilo:** el código sigue la guía de HashiCorp (`terraform-style-guide`): archivos estándar, dos espacios, nombres en minúscula con guion bajo, variables y salidas con tipo y descripción, `for_each` en lugar de `count` para varios recursos. Si la guía de HashiCorp y la skill `terraform-skill` discrepan en nombres (por ejemplo `main` frente a `this`), prevalece la de HashiCorp.
- **Pruebas:** los módulos con lógica tienen archivos `.tftest.hcl` (en modo `plan` y con proveedores simulados cuando no necesiten recursos reales).
- **Flujo de CI:** el flujo ejecuta `terraform fmt -check`, `terraform validate`, un análisis de seguridad (`trivy config` o `checkov`) y `terraform plan`. Aplicar a producción exige un plan revisado y aprobación. El agente nunca ejecuta `terraform apply`, `destroy`, `import` ni comandos de `state`: son del responsable.
