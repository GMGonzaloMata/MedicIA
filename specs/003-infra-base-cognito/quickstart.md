# Guía de validación: Infraestructura base y servicio de identidad

**Plan**: [plan.md](plan.md) | **Contratos**: [contracts/](contracts/)

Recorrido para comprobar la funcionalidad de punta a punta. La guía definitiva para el uso diario será `infra/README.md` (FR-021); esta es la lista de comprobaciones de la entrega. Los comandos que modifican infraestructura real (`apply`, `destroy`, `import` y `state`) los ejecuta solo el responsable desde su terminal. Los agentes solo corren `fmt`, `validate` y las pruebas.

Todos los comandos usan `-chdir` desde la raíz del repositorio y el perfil `medicia-dev` (`$env:AWS_PROFILE = "medicia-dev"` en PowerShell).

## Requisitos previos

- Cuenta `896618135592` en plan pago, con el presupuesto `medicia-dev-mensual` creado.
- Usuario `terraform-dev` con MFA y el perfil `medicia-dev` configurado en `sa-east-1`.
- La cuenta raíz con MFA y sin claves de acceso.
- Terraform 1.15.x instalado.

Comprobaciones de solo lectura, antes de crear nada:

- `aws sts get-caller-identity` muestra la cuenta `896618135592` y el usuario `terraform-dev`, no la raíz.
- `aws iam get-account-summary` informa `AccountMFAEnabled` igual a 1.
- En la consola, la página de credenciales de seguridad de la cuenta raíz no muestra claves de acceso.

## Escenario 1: arranque del estado remoto (historia 1)

1. `terraform -chdir=infra/bootstrap init`.
2. `terraform -chdir=infra/bootstrap plan` y revisar: crea el bucket del estado, el proveedor de GitHub, el rol de plan y la política del operador.
3. El responsable ejecuta `terraform -chdir=infra/bootstrap apply`.
4. Copiar `infra/bootstrap/backend.tf.example` a `infra/bootstrap/backend.tf`.
5. El responsable ejecuta `terraform -chdir=infra/bootstrap init -migrate-state` y acepta copiar el estado.
6. Borrar el archivo de estado local que quedó.

Resultado esperado:

- El bucket existe, es privado, cifrado y con versiones.
- `terraform -chdir=infra/bootstrap plan` informa 0 cambios (SC-002).
- `git status` no muestra archivos de estado (SC-004).

Comprobación del bloqueo: con una operación en curso, otra en una segunda terminal es rechazada con un error de bloqueo.

## Escenario 2: servicio de identidad (historia 2)

1. `terraform -chdir=infra/environments/dev init`.
2. `terraform -chdir=infra/environments/dev plan` y revisar: crea el grupo, el cliente, el usuario de la aplicación, su política y su clave.
3. El responsable ejecuta `terraform -chdir=infra/environments/dev apply`.
4. Repetir el plan: 0 cambios.

Resultado esperado:

- Las pruebas del contrato pasan: `terraform -chdir=infra/modules/identity test`.
- En la consola de Cognito hay un solo grupo y un solo cliente, sin dominio.
- El usuario `medicia-dev-app` tiene una única acción permitida.

## Escenario 3: conexión de la aplicación (historia 3)

1. Consultar sin secretos: `terraform -chdir=infra/environments/dev output region`, `user_pool_id` y `user_pool_client_id`.
2. Consultar los sensibles, de a uno y solo en la terminal del responsable: `terraform -chdir=infra/environments/dev output -raw user_pool_client_secret`, y lo mismo con `app_access_key_id` y `app_secret_access_key`.
3. Escribir en `.env.local` las siete variables que indica [contracts/identity-service.md](contracts/identity-service.md), con `IDENTITY_PROVIDER=cognito`.
4. Iniciar la aplicación con `npm run dev` (el responsable la corre).

Resultado esperado:

- La aplicación inicia con el servicio real y no se queja de variables ausentes.
- Una búsqueda del secreto del cliente en todos los archivos versionados no devuelve nada (SC-004).

## Escenario 4: recorrido real de la 002 (SC-006)

Con la aplicación en modo `cognito`:

1. Registrarse con un correo real: llega un código de 6 dígitos.
2. Verificar el correo, elegir la contraseña y repetirla.
3. Ingresar con ese correo y esa contraseña. Se ve el estado vacío de la 002.
4. Probar la recuperación de contraseña y el cierre de sesión.

Resultado esperado: el recorrido funciona. Quedan cerradas las pendientes T072, T080 y T083 de la 002 (los permisos del servidor, la política de 8 caracteres con mayúscula y la prueba real).

## Escenario 5: revisión en CI (historia 4)

1. Abrir una propuesta de cambio de prueba que toque `infra/`.
2. Comprobar que corren `static` y `plan`, y que el plan aparece en el resumen del trabajo.
3. Confirmar que el valor del `sub` impreso coincide con el configurado en la confianza (R10).
4. Probar un cambio que incumpla una regla (por ejemplo, un permiso con `"*"` en la política de la aplicación): `trivy` o las pruebas deben fallar.
5. Probar que un cambio que reemplaza el grupo de usuarios es frenado por `prevent_destroy`.

Resultado esperado: ninguna propuesta se incorpora con una comprobación fallida, y ningún paso del flujo aplica cambios (SC-005).

## Escenario 6: operación

- **Estado bloqueado por un proceso cortado:** comprobar que no hay una operación en curso y ejecutar `terraform force-unlock <id>`, que corre el responsable. Documentado en la guía.
- **Secreto del cliente perdido:** crear uno nuevo con `terraform apply -replace=...` sobre el cliente, o desde la consola. Se documentan ambos caminos y su efecto: el cliente nuevo cambia el identificador, así que no se pierden las cuentas del grupo.
- **Rotación de la clave de la aplicación:** `terraform apply -replace=module.identity.aws_iam_access_key.app`, que corre el responsable.
- **Liberación de recursos:** quitar el `prevent_destroy` del código, aplicar `protect_user_pool = false` y destruir con el plan revisado.
- **Cambio hecho a mano en la consola:** el plan de CI muestra la diferencia.

## Costo

Después de una semana de uso de desarrollo, la página de facturación de la cuenta debe mostrar un gasto menor a 1 USD (SC-007).
