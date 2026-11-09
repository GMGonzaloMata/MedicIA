# Contrato: servicio de identidad en Terraform

**Plan**: [../plan.md](../plan.md) | **Decisiones**: [../research.md](../research.md) (R6, R7, R8, R12) | **Contrato de la aplicación**: [identity-provider.md de la 002](../../002-ingreso-sesion/contracts/identity-provider.md)

Define cómo cada punto de "Configuración requerida del grupo de usuarios" de la funcionalidad 002 se expresa en el módulo `infra/modules/identity` y cómo lo verifica una prueba. El módulo vive en `infra/modules/identity/`; las pruebas, en `infra/modules/identity/tests/identity.tftest.hcl`.

## Correspondencia con el contrato de la 002

Cada ítem indica el argumento de Terraform y la aserción de la prueba (modo `plan`, proveedor simulado).

- **Inicio de sesión con correo, sin distinguir mayúsculas:**
  - Argumentos: `username_attributes = ["email"]` y `username_configuration { case_sensitive = false }`.
  - Aserción: ambos valores en el grupo.
- **Registro abierto:**
  - Argumento: `admin_create_user_config { allow_admin_create_user_only = false }`.
  - Aserción: el valor es `false`.
- **Verificación del correo por código numérico de 6 dígitos:**
  - Argumentos: `auto_verified_attributes = ["email"]` y `verification_message_template { default_email_option = "CONFIRM_WITH_CODE" }`.
  - Aserción: ambos valores. El largo del código es el que usa Cognito por defecto y no se configura.
- **Atributos obligatorios `email` y `name`:**
  - Argumentos: dos bloques `schema`, con `attribute_data_type = "String"`, `required = true` y `mutable = true`.
  - Aserción: existen exactamente dos atributos obligatorios, y son esos.
- **Política de contraseña:**
  - Argumentos: `minimum_length = 8`, `require_uppercase = true`, `require_lowercase = false`, `require_numbers = false`, `require_symbols = false`.
  - Aserción: los cinco valores. Debe coincidir con la política de la aplicación (`src/modules/users/domain/password-policy.ts`).
- **Sin segundo factor:**
  - Argumento: `mfa_configuration = "OFF"`.
  - Aserción: el valor.
- **Correo de verificación:**
  - Argumento: `email_configuration { email_sending_account = "COGNITO_DEFAULT" }`.
  - Aserción: el valor. Es el remitente por defecto, con tope diario bajo (spec, casos borde).
- **Un único cliente de aplicación, confidencial:**
  - Argumento: un solo `aws_cognito_user_pool_client` con `generate_secret = true`.
  - Aserción: `generate_secret` es `true` y no hay otro cliente en el plan.
- **Solo ingreso con usuario y contraseña, sin renovación:**
  - Argumento: `explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH"]`.
  - Aserción: la lista tiene exactamente ese valor y no incluye `ALLOW_REFRESH_TOKEN_AUTH`.
- **Ocultar si un correo tiene cuenta:**
  - Argumento: `prevent_user_existence_errors = "ENABLED"`.
  - Aserción: el valor.
- **Token de identidad de la vida más corta:**
  - Argumentos: `id_token_validity = 5` con `token_validity_units { id_token = "minutes" }`.
  - Aserción: ambos valores. Cinco minutos es el mínimo que permite el proveedor.
- **Sin interfaz alojada ni otra vía de registro:**
  - Argumentos: no hay `aws_cognito_user_pool_domain`, ni proveedores de identidad externos, ni OAuth (`allowed_oauth_flows_user_pool_client = false`).
  - Aserción: la prueba falla si el plan contiene un recurso de dominio o de proveedor.
- **Protección contra reemplazo (FR-012):**
  - Argumentos: `deletion_protection = "ACTIVE"` y `lifecycle { prevent_destroy = true }`.
  - Aserción: `deletion_protection` es `ACTIVE`.
- **Permiso del servidor:**
  - Argumento: política del usuario `medicia-dev-app` con una sola declaración: acción `cognito-idp:AdminSetUserPassword` sobre el ARN del grupo.
  - Aserción: la política decodificada tiene una declaración, una acción, un recurso, y el recurso es el ARN del grupo (fijado con `override_resource` durante el plan).

## Variables del módulo

- **`environment`**: texto; nombre del entorno (`dev`). Se usa en los nombres y las etiquetas.
- **`protect_user_pool`**: booleano; `true` por defecto. Si es `false`, `deletion_protection` pasa a `INACTIVE`. `prevent_destroy` sigue en el código y solo se retira editando el archivo.

## Salidas del módulo

- **`region`**: región de AWS.
- **`user_pool_id`**: identificador del grupo.
- **`user_pool_arn`**: ARN del grupo.
- **`user_pool_client_id`**: identificador del cliente.
- **`user_pool_client_secret`**: secreto del cliente. Marcado como sensible.
- **`app_access_key_id`**: identificador de la clave de la aplicación. Marcado como sensible.
- **`app_secret_access_key`**: secreto de la clave de la aplicación. Marcado como sensible.

## Correspondencia con las variables de la aplicación

La raíz `environments/dev` repite las salidas del módulo. El responsable las consulta con `terraform output -raw <nombre>` y las escribe en `.env.local`:

- **`IDENTITY_PROVIDER`**: se escribe a mano con el valor `cognito`.
- **`COGNITO_REGION`**: salida `region`.
- **`COGNITO_USER_POOL_ID`**: salida `user_pool_id`.
- **`COGNITO_CLIENT_ID`**: salida `user_pool_client_id`.
- **`COGNITO_CLIENT_SECRET`**: salida `user_pool_client_secret`.
- **`AWS_ACCESS_KEY_ID`**: salida `app_access_key_id`.
- **`AWS_SECRET_ACCESS_KEY`**: salida `app_secret_access_key`.

La aplicación ya lee las cuatro variables `COGNITO_*` (`src/infrastructure/aws/cognito/config.ts`). Las dos variables `AWS_*` las toma la cadena de credenciales por defecto del SDK, que es lo que usa el cliente de Cognito de la aplicación, porque no recibe credenciales de forma explícita. Esta funcionalidad no modifica la aplicación.

`.env.example` está protegido contra escritura de los agentes. Si hace falta documentar ahí las dos variables `AWS_*`, lo actualiza el responsable.
