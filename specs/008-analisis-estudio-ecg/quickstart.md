# Guía de verificación: Análisis de un estudio de ECG con EchoNext-Mini

Cómo comprobar la 008 de punta a punta. Detalles en los [contratos](contracts/) y en el [modelo de datos](data-model.md). Se prueba solo con archivos sintéticos; nunca con datos de pacientes.

## Requisitos

- Base local de Docker levantada y `npm run seed:demo` ejecutado.
- La migración de la 008 aplicada y el cliente de Prisma regenerado (los comandos están en la sección siguiente).
- Un archivo sintético de `make_synthetic.py` (de `medicia-ml`) o armado por las pruebas.
- En `.env.local`: `STUDY_STORAGE=fake`, `MODEL_INFERENCE=fake` (y opcionalmente `FAKE_MODEL_DELAY_MS`), y `COGNITO_*` comentadas para usar el proveedor de identidad falso. `.env.example` también lleva `MODEL_INFERENCE`; lo actualiza el responsable.

## 0. Migración (solo el responsable)

1. `npx prisma migrate dev --create-only --name add_analyses`
2. Editar el SQL generado: agregar al final el índice único parcial y los `CHECK` de [data-model.md](data-model.md).
3. `npx prisma migrate dev` para aplicarla y `npx prisma generate` para regenerar el cliente.

## 1. Pruebas automáticas

1. `npm run check` (lint, tipos, pruebas con cobertura y compilación). Trunca la base local: después volvé a correr `npm run seed:demo`.
2. `npm run test:e2e` (incluye `study-analysis.spec.ts`).
3. `terraform test` en `infra/modules/identity` y `infra/bootstrap`, y `validate` en `infra/environments/dev`.

Resultado esperado: todo en verde; cobertura de línea de al menos 80 % por archivo en lo nuevo de `src/modules` y `src/infrastructure`.

## 2. Recorrido del paciente (modelo simulado)

1. Entrá como paciente, subí un archivo sintético y abrí «Ver onda» del estudio.
2. En la sección «Análisis», tocá «Analizar estudio».
3. Esperado: el botón se deshabilita con «Hay un análisis en curso» y aparece «Analizando el estudio…»; en pocos segundos el resultado se muestra solo, con las 12 filas en el orden del contrato, porcentajes escritos, barras, el compuesto destacado, la advertencia, el modelo `echonext-mini-fake` y la fecha.

## 3. Historial y uno en curso

1. Pedí otro análisis cuando el anterior terminó: aparecen dos en el historial, del más reciente al más antiguo.
2. Con la demora del simulado alta (`FAKE_MODEL_DELAY_MS=8000`), pedí un análisis y probá pedir otro desde otra pestaña: se rechaza con «Ya hay un análisis en curso».
3. Abrí «Ver resultado» de un análisis anterior.

## 4. Fallas

1. Subí un estudio sintético con el valor `7.77` en la cuarta variable (frecuencia auricular), `7.78` o `7.79`, y pedí el análisis.
2. Esperado: queda «Fallido» con el motivo genérico (no pudimos analizar el estudio, no está disponible en este momento, tardó demasiado). Se puede pedir uno nuevo.
3. Reiniciá el servidor con un análisis en curso: pasados 2 minutos, al abrir el estudio figura «Fallido» por demora.

## 5. Acceso y eliminación

1. Abrí la dirección de un estudio con otro paciente, un médico sin asignación, una cuenta de otra clínica, un administrador sin rol médico y un identificador inventado: siempre «No tenés acceso a este estudio.» y ningún análisis.
2. Con un análisis en curso, intentá eliminar el estudio: se rechaza. Con análisis terminados, eliminalo: desaparecen el estudio y sus análisis.

## 6. Responsivo y privacidad

1. Abrí un estudio con resultado a 375, 768 y 1280 px, en claro y oscuro: sin desplazamiento horizontal, todo operable con teclado.
2. Con las herramientas de desarrollo, revisá la respuesta de la página: no aparecen la clave del archivo ni las siete variables. En los registros del servidor no figuran probabilidades.

## 7. Prueba real con el punto de inferencia encendido (solo el responsable)

El punto de inferencia cobra mientras está encendido: 0,089 USD por hora (`ml.t2.medium`, ver [la 004](../004-infra-sagemaker-modelos/contracts/model-catalog.md)). Encendelo, probá y apagalo en la misma sesión.

1. **Permisos** (una sola vez): aplicá el cambio de `infra/bootstrap` por la vía de administración y después `infra/environments/dev` con el operador, como en [contracts/permissions.md](contracts/permissions.md).
2. **Encender:** en `infra/environments/dev/variables.tf`, `enabled = true` en `echonext-mini`; `terraform plan` (debe proponer un punto de inferencia y nada más) y `apply`. Esperá a que `aws sagemaker describe-endpoint --endpoint-name medicia-dev-echonext-mini` muestre `InService` (varios minutos).
3. **Configurar la aplicación:** en `.env.local`, `MODEL_INFERENCE=sagemaker`, `SAGEMAKER_ENDPOINT_NAME=medicia-dev-echonext-mini` y `AWS_REGION=sa-east-1`, con las claves de la aplicación y sin `AWS_PROFILE` (si está definido, gana el perfil del operador y falla el permiso).
4. **Probar:** subí un archivo sintético, pedí el análisis y comprobá que llega a «Completado» con las 12 probabilidades y el modelo y la versión que informa el contenedor (`echonext-mini` y `0.1.0`).
5. **Apagar:** `enabled = false`, `plan` (debe proponer destruir solo el punto de inferencia) y `apply`. Confirmá con `aws sagemaker list-endpoints --region sa-east-1` que no quedó ninguno.
6. **Si quedó encendido y no podés esperar:** `aws sagemaker delete-endpoint --endpoint-name medicia-dev-echonext-mini --region sa-east-1`, y después dejá `enabled = false` en el código.
7. **Con el punto apagado**, pedí un análisis con `MODEL_INFERENCE=sagemaker`: queda «Fallido» con «El análisis no está disponible en este momento».

## Resultados

Se completan al terminar la implementación.
