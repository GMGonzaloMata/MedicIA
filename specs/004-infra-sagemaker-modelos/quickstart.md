# Guía de validación: Infraestructura base de SageMaker

**Plan**: [plan.md](plan.md) | **Contratos**: [contracts/](contracts/)

Recorrido para comprobar la funcionalidad de punta a punta. La guía definitiva para el uso diario será `infra/README.md` (FR-021); esta es la lista de comprobaciones de la entrega. Los comandos que modifican infraestructura real (`apply`, `destroy`, `import` y `state`) los ejecuta solo el responsable desde su terminal. Los agentes solo corren `fmt`, `validate` y las pruebas.

Todos los comandos usan `-chdir` desde la raíz del repositorio. En PowerShell: `$env:AWS_PROFILE = "medicia-dev"`.

## Requisitos previos

- La 003 aplicada: estado remoto, rol de plan, política del operador y presupuesto `medicia-dev-mensual`.
- Un administrador disponible (usuario raíz con MFA) para el escenario 2.
- Terraform 1.15.x instalado.

Comprobación de solo lectura: `aws sts get-caller-identity` muestra la cuenta `896618135592`.

## Escenario 1: comprobaciones locales sin AWS (historias 1 a 4)

1. `terraform fmt -check -recursive infra`.
2. Para cada directorio (`infra/bootstrap`, `infra/environments/dev`, `infra/modules/identity`, `infra/modules/model-artifacts`, `infra/modules/sagemaker-execution-role`, `infra/modules/model-endpoints`): `terraform -chdir=<directorio> init -backend=false` y `terraform -chdir=<directorio> validate`.
3. `terraform -chdir=<directorio> test` en los mismos directorios que tienen `tests/`.

Resultado esperado: todo pasa, sin credenciales y sin crear recursos. Las pruebas cubren FR-013 y FR-018 y SC-004 y SC-006.

## Escenario 2: permisos por la vía de administración (historia 4)

1. Con el perfil del administrador: `terraform -chdir=infra/bootstrap plan` y revisar. Debe agregar la política `medicia-dev-sagemaker-boundary`, cambiar en el lugar la política del operador y la política límite `medicia-dev-boundary` (solo lecturas) y el rol de plan, y nada más.
2. El administrador ejecuta `terraform -chdir=infra/bootstrap apply`.
3. Repetir el plan: 0 cambios.

Resultado esperado: el plan no destruye ni reemplaza la política del operador (su descripción no cambia, ver el comentario en `operator-policy.tf`).

## Escenario 3: crear el bucket y el rol (historias 1 y 2)

1. Con el perfil `medicia-dev`: `terraform -chdir=infra/environments/dev init` y `plan`. Debe proponer crear el bucket y sus configuraciones, el rol, su política y 0 modelos y 0 puntos de inferencia.
2. El responsable ejecuta `terraform -chdir=infra/environments/dev apply`.
3. Repetir el plan: 0 cambios (SC-002).

Resultado esperado:

- El bucket existe, es privado, cifrado y con versiones. `aws s3api get-public-access-block` y `get-bucket-encryption` lo confirman.
- El rol existe con su límite: `aws iam get-role --role-name medicia-dev-sagemaker-execution` muestra el `PermissionsBoundary`.
- `aws sagemaker list-endpoints --region sa-east-1` no lista nada.

## Escenario 4: subir y leer un artefacto de prueba (historia 1)

1. Crear un archivo de texto sin datos clínicos, subirlo con `aws s3 cp prueba.txt s3://medicia-models-dev-896618135592/prueba/prueba.txt` y listarlo con `aws s3 ls`.
2. Comprobar el rechazo del borrado: `aws s3 rm s3://medicia-models-dev-896618135592/prueba/prueba.txt` debe fallar con acceso denegado para el operador.
3. Comprobar el rechazo del acceso sin TLS (`--no-verify-ssl` no sirve para esto; alcanza con la prueba automática de la política).

Resultado esperado: subir y leer funciona; borrar un artefacto no. El archivo de prueba se elimina con el perfil del administrador y queda registrado en la guía.

## Escenario 5: el rol y el límite (historia 2)

1. Revisar con la prueba automática que el rol no tenga comodines ni otro bucket (`terraform -chdir=infra/modules/sagemaker-execution-role test`).
2. Con el perfil `medicia-dev`, intentar crear un rol de prueba `medicia-dev-x` sin límite: debe fallar con acceso denegado.
3. Intentar crear un rol de prueba con `medicia-dev-sagemaker-boundary`: debe fallar, porque solo se permite para el rol de ejecución.

Resultado esperado: tres rechazos o aprobaciones según lo indicado. No queda ningún rol de prueba creado.

## Escenario 6: catálogo y costo (historia 3)

1. Con el catálogo vacío, el plan de `environments/dev` propone 0 modelos y 0 puntos de inferencia.
2. En una rama aparte, agregar una entrada de ejemplo con `enabled = false` y verificar con `terraform test` (no se aplica) que propone 1 modelo, 1 configuración y 0 puntos de inferencia.
3. Cambiar la entrada a `enabled = true`: la prueba propone exactamente 1 punto de inferencia.
4. Poner un `instance_type` fuera de la lista: la validación falla.
5. Confirmar que la guía de `infra/README.md` trae la tabla de costos por hora, día y mes y los comandos para ver y apagar lo encendido (SC-008).

Resultado esperado: las pruebas pasan sin crear recursos. La entrada de ejemplo no se versiona.

## Escenario 7: revisión en CI (historia 4)

1. Abrir una propuesta que toque `infra/`, **después** del escenario 2.
2. Comprobar que corren `static` y `plan` y que el plan aparece en el resumen con 0 cambios.
3. Probar un cambio que incumpla una regla (por ejemplo, `"s3:*"` en el rol de ejecución, o un `aws_sagemaker_endpoint` fuera de su módulo): las pruebas o la guarda de costo deben fallar.
4. Abrir una propuesta de prueba **antes** de aplicar los permisos (si todavía no se hizo el escenario 2): el plan falla con acceso denegado, como documenta la guía.

Resultado esperado: ninguna propuesta se incorpora con una comprobación fallida, y ningún paso del flujo aplica cambios (SC-007).

## Búsqueda de artefactos y secretos (SC-005)

`git ls-files` no debe listar archivos de pesos de modelos (`*.pt`, `*.pth`, `*.onnx`, `*.tar.gz`, `*.safetensors`, `*.h5`) ni datos clínicos, y `trivy fs --scanners secret infra` no debe reportar nada.

## Costo

Después de una semana, la página de facturación de la cuenta no debe mostrar un gasto adicional mayor a 1 USD por esta base (SC-003). `aws sagemaker list-endpoints` y `aws sagemaker list-notebook-instances` listan vacío.
