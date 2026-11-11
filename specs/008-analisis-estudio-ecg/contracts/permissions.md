# Contrato: permisos de AWS para invocar el punto de inferencia

Cómo recibe la aplicación el permiso de usar el modelo, sin ampliar nada más. Los cambios de Terraform pasan por revisión y los aplica el responsable; las pruebas de Terraform verifican cada punto.

## Qué se concede

- Acción: `sagemaker:InvokeEndpoint`.
- Recurso: exactamente `arn:aws:sagemaker:sa-east-1:896618135592:endpoint/medicia-dev-echonext-mini`. El ARN se arma por nombre, así que el permiso existe aunque el punto de inferencia esté apagado.
- Sin ninguna otra acción de SageMaker, sin comodines de recurso y sin acceso al bucket de artefactos de modelos.

## Dónde

- **Política del usuario de la aplicación** (`infra/modules/identity`): política nueva `model-endpoint-invoke`, que existe solo si la variable opcional `model_endpoint_arn` no está vacía. La variable valida el patrón de un ARN de punto de inferencia de SageMaker. Una salida indica si se concedió el permiso.
- **Techo de permisos** (`infra/bootstrap/permissions-boundary.tf`, política `medicia-dev-boundary`): sentencia `InvocarModelo` con la misma acción y el mismo recurso. Sin ella, la política del usuario no tiene efecto. El operador no puede editar este archivo: cambia por la vía de administración.
- **Entorno de desarrollo** (`infra/environments/dev/main.tf`): pasa al módulo `identity` el ARN armado con la región, la cuenta y el nombre `medicia-dev-<nombre del modelo>` del catálogo.

## Orden y quién ejecuta

1. El agente edita y corre `terraform fmt`, `validate` y `test` en `identity`, `bootstrap` y `environments/dev`.
2. **[Administrador]** El responsable aplica `infra/bootstrap` por la vía de administración (`infra/README.md`, «Cambiar los permisos del operador»). Esto agrega la sentencia al techo.
3. **[Responsable]** El responsable corre `terraform plan` en `infra/environments/dev` con el operador y revisa que proponga **una política de usuario nueva y ningún otro cambio**; después aplica.
4. No se rota la clave de acceso de la aplicación: el usuario es el mismo.

## Qué verifican las pruebas

- Sin `model_endpoint_arn`, el módulo `identity` no crea la política (0 recursos nuevos).
- Con el ARN, crea exactamente una política cuya única sentencia permite `sagemaker:InvokeEndpoint` sobre ese recurso.
- Un ARN con formato inválido falla la validación.
- El techo contiene la sentencia `InvocarModelo` con esa acción y ese recurso, y ninguna otra acción de SageMaker para la aplicación.
- La política del operador no cambia.

## Límites conocidos

- Con `sagemaker:InvokeEndpoint` la aplicación podría invocar el punto de inferencia con cualquier entrada, igual que ya puede leer cualquier estudio de la clínica que la aplicación autorice. La barrera entre clínicas es la aplicación, no IAM.
- Mientras el punto de inferencia esté encendido, cualquier persona con acceso a un estudio puede provocar costo pidiendo análisis. Está acotado por «uno en curso por estudio», pero no hay límite de frecuencia: forma parte de la lista «antes de datos reales» de la 006.
