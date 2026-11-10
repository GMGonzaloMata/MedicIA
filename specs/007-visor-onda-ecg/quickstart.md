# Guía de verificación: Visor de la onda de un estudio de ECG

Cómo comprobar la 007 de punta a punta. Detalles en [contracts/get-study-waveform.md](contracts/get-study-waveform.md) y [contracts/viewer-ui.md](contracts/viewer-ui.md). Se prueba solo con archivos sintéticos; nunca con datos de pacientes.

## Requisitos

- Base local de Docker levantada y `npm run seed:demo` ejecutado (clínica de prueba con médicos, pacientes y asignaciones).
- Un archivo sintético de `make_synthetic.py` (de `medicia-ml`), por ejemplo los de `C:\datos\echonext\synthetic\`.
- En `.env.local`: `STUDY_STORAGE=fake` (o `s3` con las variables de la 006) y `COGNITO_*` comentadas para usar el proveedor de identidad falso.
- Sin migraciones ni cambios de infraestructura: no hay nada que aplicar.

## 1. Pruebas automáticas

1. `npm run check` (lint, tipos, pruebas con cobertura y compilación). Nota: trunca la base local; después volvé a correr `npm run seed:demo`.
2. `npm run test:e2e` (incluye `study-viewer.spec.ts`).

Resultado esperado: todo en verde; cobertura de línea de al menos 80 % por archivo en lo nuevo de `src/modules` y `src/infrastructure`.

## 2. Recorrido del paciente

1. Entrá como paciente, subí el archivo sintético en «Mis estudios».
2. En la fila del estudio tocá «Ver onda».
3. Esperado: se ven las 12 derivaciones con su nombre sobre una cuadrícula, el eje de 0 a 10 s, la forma de latidos del archivo sintético, el encabezado (número, fecha y hora, «El propio paciente») y la aclaración de señal normalizada sin mV. No figura el nombre del paciente.

## 3. Zoom y desplazamiento

1. Elegí una derivación (clic o Enter): se ve ampliada.
2. Con el teclado: `+` acerca, `−` aleja, flechas izquierda y derecha desplazan, `0` vuelve a ver todo, flechas arriba y abajo cambian de derivación, `Escape` vuelve a las 12.
3. Intentá desplazar más allá de los extremos y acercar más del mínimo (1 s): se frena sin errores.
4. En un móvil o con las herramientas de desarrollo en modo táctil: arrastrá con un dedo y hacé el pellizco.
5. Esperado: el eje de tiempo y el aviso del rango visible se actualizan; el foco visible nunca se pierde.

## 4. Recorrido del médico

1. Entrá como médico con un paciente asignado que tenga estudios, abrilo desde «Mis pacientes» y tocá «Ver onda».
2. Esperado: misma onda; el encabezado muestra además el nombre del paciente; «Volver a los estudios del paciente» regresa a su lista.

## 5. Acceso rechazado

1. Copiá la dirección de un estudio y abrila con: otro paciente, un médico sin asignación a ese paciente, una cuenta de otra clínica, un administrador que no es médico y una dirección con un identificador inventado.
2. Esperado: en todos los casos «No tenés acceso a este estudio.», con el mismo texto, sin datos del estudio.

## 6. Onda no disponible (a mano, solo con S3)

1. Con `STUDY_STORAGE=s3`, borrá el objeto de un estudio (con una credencial de administración, no con la de la aplicación) y recargá la pantalla del estudio.
2. Esperado: el encabezado del estudio y el mensaje de onda no disponible, sin detalles internos. (Este caso no tiene prueba E2E; está cubierto por pruebas de unidad.)

## 7. Responsivo y temas

1. Abrí un estudio a 375, 768 y 1280 px, en claro y en oscuro (preferencia del sistema).
2. Esperado: sin desplazamiento horizontal de la página, nombres y trazos legibles, contraste suficiente, todo el recorrido posible con teclado.

## 8. Privacidad

1. Con las herramientas de desarrollo, revisá la respuesta de la página.
2. Esperado: no aparece la clave del objeto (`studies/...`) ni las siete variables; solo los datos del estudio y las 12 derivaciones.

## Resultados

Se completan al terminar la implementación.
