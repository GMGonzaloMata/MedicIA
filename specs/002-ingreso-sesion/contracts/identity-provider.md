# Contrato: proveedor de identidad

**Plan**: [../plan.md](../plan.md) | **Decisiones**: [../research.md](../research.md) (R2, R3, R4)

Define el puerto de salida que usan los casos de uso y lo que necesita el grupo de usuarios de Cognito. El puerto vive en `src/modules/users/application/ports/out/identity-provider.ts`. Lo implementan el adaptador de Cognito (`src/infrastructure/aws/cognito/`) y el proveedor simulado (R11).

## Operaciones del puerto

Todas reciben el correo ya normalizado (minúsculas, sin espacios). Ninguna devuelve ni expone tokens, contraseñas ni códigos.

- **`signUp({ email, fullName })`**
  - **Sin contraseña (R18):** el adaptador de Cognito usa una contraseña provisional aleatoria que nadie conoce.
  - **Resultado:** `{ status: "verification-required" }`.
  - **Si el correo ya existe:** el adaptador lo absorbe y devuelve el mismo resultado (R4).
  - **Errores:** `UNAVAILABLE`.
- **`confirmSignUp({ email, code, password })`**
  - **Resultado:** cuenta verificada, con `password` como contraseña definitiva (R18).
  - **Errores:** `INVALID_CODE` (incorrecto, vencido o ya usado, sin distinguir), `INVALID_PASSWORD` (no cumple la política), `UNAVAILABLE`.
- **`resendConfirmationCode({ email })`**
  - **Resultado:** siempre éxito visible, exista o no la cuenta.
  - **Errores:** `UNAVAILABLE`.
- **`signIn({ email, password })`**
  - **Resultado:** `{ subject, email, fullName }`, tomados de un ID token ya validado: firma, emisor, cliente, expiración, `token_use = id` y `email_verified = true`.
  - **Errores:** `INVALID_CREDENTIALS` (agrupa correo inexistente, contraseña incorrecta, cuenta sin verificar, bloqueo temporal y desafíos no soportados), `UNAVAILABLE`.
- **`requestPasswordReset({ email })`**
  - **Resultado:** siempre éxito visible.
  - **Errores:** `UNAVAILABLE`.
- **`confirmPasswordReset({ email, code, newPassword })`**
  - **Resultado:** contraseña cambiada.
  - **Errores:** `INVALID_CODE`, `INVALID_PASSWORD`, `UNAVAILABLE`.

`UNAVAILABLE` cubre cualquier falla del servicio o de red. El detalle se registra sin datos personales (R12) y la persona ve un error general (spec, casos borde).

## Comportamiento del proveedor simulado

- **Memoria:** guarda las cuentas en un mapa del proceso.
- **Código de verificación y de recuperación:** fijo, `000000`.
- **Contraseña:** acepta cualquiera que cumpla la política de 12 a 128 caracteres. Se define al verificar el correo; hasta entonces la cuenta tiene una contraseña provisional desconocida.
- **Subject:** genera un identificador estable por correo, con el formato de un UUID.
- **Arranque:** se niega a iniciar si están definidas las variables de Cognito (R11).

## Configuración requerida del grupo de usuarios (repositorio de Terraform)

Para que el adaptador funcione, el grupo y su cliente de aplicación deben tener:

- **Inicio de sesión:** con correo electrónico (`username_attributes = ["email"]`), sin distinguir mayúsculas.
- **Registro abierto:** autoregistro permitido.
- **Permiso del servidor (R18):** el rol o las credenciales de la aplicación incluyen `cognito-idp:AdminSetUserPassword` sobre este grupo, y nada más de administración.
- **Verificación:** verificación automática del correo con un código numérico de 6 dígitos.
- **Atributos obligatorios:** `email` y `name`.
- **Política de contraseña:** longitud mínima 12, sin exigir mayúsculas, números ni símbolos (coincide con R13).
- **Cliente de aplicación:**
  - **Secreto:** con secreto de cliente (confidencial).
  - **Flujos:** solo `ALLOW_USER_PASSWORD_AUTH`. Sin `ALLOW_REFRESH_TOKEN_AUTH`, porque la aplicación no usa los tokens más allá del ingreso.
  - **Existencia de usuarios:** `prevent_user_existence_errors = "ENABLED"`.
  - **Validez del ID token:** el mínimo (5 minutos).
- **MFA:** desactivado. Un desafío de Cognito (por ejemplo, cambio obligatorio de contraseña) se trata como `INVALID_CREDENTIALS`.
- **Remitente de correo:** el de Cognito por defecto sirve para desarrollo (ver R17).

## Variables de entorno de la aplicación

- **`IDENTITY_PROVIDER`**: `cognito` o `fake`. Obligatoria, sin valor por defecto.
- **`COGNITO_REGION`**, **`COGNITO_USER_POOL_ID`**, **`COGNITO_CLIENT_ID`**, **`COGNITO_CLIENT_SECRET`**: obligatorias con `cognito`, y ausentes con `fake`. Se validan con `zod` al iniciar.

`.env.example` debe documentarlas. Ese archivo está protegido contra escritura de los agentes: lo actualiza el responsable del proyecto (ver las tareas).
