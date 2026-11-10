# Guía de validación: Modelo EchoNext-Mini en SageMaker

Recorrido de punta a punta para comprobar que la funcionalidad anda. Los comandos exactos y los scripts se terminan en la implementación; acá está el orden, lo que se espera y cuánto cuesta. Contratos: [inference-api.md](contracts/inference-api.md) y [permissions-and-artifacts.md](contracts/permissions-and-artifacts.md).

## Requisitos previos

- La 004 aplicada (bucket, rol de ejecución, catálogo vacío).
- Docker en marcha, Python 3.11 y el repositorio `medicia-ml` clonado.
- El conjunto de datos EchoNext-Mini descargado en la máquina del responsable (partición de prueba: ondas, variables y metadatos). Nunca dentro de un repositorio.
- Un clon aparte de `PierreElias/IntroECG` en el commit `15233e9`, fuera de ambos repositorios, solo para la comparación.
- Credenciales del operador de la 003 y acceso de administrador para la rotación (paso 1).

## Pasos, en este orden (FR-021)

1. **Permisos por la vía de administración.** Rotación de la 003: el administrador revisa y aplica `infra/bootstrap` (política nueva del operador, límite del rol de ejecución, rol de plan y su límite) y deja al operador con sus políticas, incluida la nueva. Comprobar: `terraform -chdir=infra/bootstrap plan` sin cambios.
2. **Repositorio de imágenes.** Agregar el módulo `model-registry` en `infra/environments/dev`, revisar el plan y aplicarlo. Esperado: se crea solo `medicia-dev-echonext-mini`.
3. **Armar y probar el modelo en `medicia-ml`** (cero costo):
   - pruebas unitarias;
   - paridad en proceso contra el original con 3 a 5 estudios de prueba: diferencia máxima menor a 0,001 en las 12 salidas.
4. **Empaquetar y subir el artefacto.** `package_artifacts.py` arma `model.tar.gz` con su `MANIFEST.json`; se sube a `echonext-mini/<versión>/` en el bucket de la 004.
5. **Construir, probar y subir la imagen.**
   - `docker build` para `linux/amd64`.
   - Prueba local con `docker run --network none`: `/ping` responde, las entradas válidas devuelven 12 probabilidades iguales a las del paso 3, las inválidas devuelven 400.
   - Subir la imagen con la etiqueta de versión.
6. **Agregar la entrada al catálogo** con `enabled = false`, revisar el plan (esperado: modelo y configuración nuevos, 0 puntos de inferencia) y abrir la propuesta de cambio. Pasan las comprobaciones de CI.
7. **Encender el modelo** (`enabled = true`), revisar el plan (esperado: exactamente 1 punto de inferencia) y aplicarlo. Esperar entre 5 y 10 minutos hasta que esté en servicio.
8. **Probar el punto de inferencia real:** `invoke_endpoint.py` envía los mismos estudios y compara con la referencia. Esperado: diferencia máxima menor a 0,001; una entrada inválida devuelve error y no probabilidades.
9. **Apagar el modelo** (`enabled = false`), revisar el plan (esperado: se quita solo el punto de inferencia) y aplicarlo. Comprobar que no queda nada encendido.
10. **Registrar los resultados** con fecha en esta carpeta: índices de estudio, diferencia máxima, tiempos y costo. Nunca datos de estudios.

## Cómo ver qué hay encendido y apagar de emergencia

- Ver: consola de SageMaker AI, "Inference > Endpoints", o `aws sagemaker list-endpoints --region sa-east-1`.
- Apagar de emergencia: `aws sagemaker delete-endpoint --endpoint-name <nombre> --region sa-east-1`. Después, dejar el catálogo con `enabled = false` para que Terraform quede en sintonía.
- El presupuesto `medicia-dev-mensual` (20 USD) alerta el gasto.

## Costo

- Encendido: `ml.t2.medium`, 0,089 USD por hora (unos 2,14 USD por día, 64,97 USD por mes si quedara todo el mes). Precios de `sa-east-1` del 2026-11-09.
- Una sesión de pruebas de una hora: menos de 0,10 USD.
- Apagado: 0 USD de cómputo. Almacenamiento de la imagen y del artefacto: centavos por mes.

## Criterios que se comprueban

- SC-001: diferencia menor a 0,001 en el 100 % de los estudios (pasos 3 y 8).
- SC-002: el 100 % de las entradas inválidas se rechazan sin probabilidades (pasos 5 y 8).
- SC-003: apagado, 0 puntos de inferencia en el plan; encendido, exactamente 1 (pasos 6, 7 y 9).
- SC-004: de subir los artefactos a apagar, menos de 30 minutos siguiendo solo la guía (se mide en el paso 8).
- SC-005: ningún dato del conjunto en los repositorios ni en el bucket (búsqueda automática en CI y revisión de `.gitignore`).
- SC-006: la 008 se puede construir con solo el contrato de inferencia.

## Aviso

Las probabilidades son un indicador relativo de riesgo de un posible hallazgo, de apoyo clínico. El modelo es de investigación, entrenado con adultos en un solo centro, y el código original no declara licencia. El uso actual es académico; un uso comercial exige revisar la licencia antes.

## Resultados (2026-11-10)

Verificación hecha con los 5 primeros estudios de la partición de prueba (índices 0 a 4; la partición tiene 5.442). Se registran solo índices y diferencias, nunca datos de estudios (FR-022). Tolerancia: 0,001.

- **Modelo reescrito contra el original, en proceso** (`check_parity.py`, clon de `IntroECG` en el commit `15233e9`): diferencia máxima **0** en los 5 estudios. Un control con un peso alterado a propósito (0,05) dio 0,0067, así que la comparación detecta diferencias.
- **Imagen en contenedor local, sin red** (`invoke_endpoint.py --url`): diferencias entre 3e-8 y 1,8e-7. La entrada inválida (6 variables) devolvió 400 sin probabilidades. Probado además con ruido aleatorio: `/ping`, mismo resultado ante la misma entrada, 400 ante 4 tipos de entrada inválida y 415 ante otro tipo de contenido, con el contenedor corriendo como usuario sin privilegios y sin internet.
- **Punto de inferencia real en SageMaker** (`invoke_endpoint.py --endpoint-name`, `ml.t2.medium`, `sa-east-1`): diferencias entre 6e-8 y 1,8e-7. La entrada inválida se rechazó sin probabilidades (SageMaker la devuelve como error 424). **SC-001 y SC-002 cumplidos.**
- **SC-003:** apagado, el plan propone el modelo y la configuración sin ningún punto de inferencia, y la lista de endpoints quedó vacía; encendido, el plan propuso exactamente 1 punto de inferencia; al apagar se quitó solo ese. Verificado en el plan real y por las pruebas automáticas.
- **Artefacto:** `echonext-mini/0.1.0/model.tar.gz`, 3.552.110 bytes, SHA-256 `f452421e406c289341a85e6d0c840377ad8cf57c641428867d74253dc3565476`, cifrado AES-256.
- **Imagen:** `medicia-dev-echonext-mini:0.1.0`, manifiesto simple, 331 MB comprimida en ECR y 1,54 GB descomprimida. Escaneo: 0 críticas, 13 altas, 10 medias y 4 bajas, todas de paquetes del sistema operativo (ver `research.md`, R13).
- **SC-004 (menos de 30 minutos de subir el artefacto a apagar, con la imagen ya subida):** el encendido tardó los 5 a 10 minutos esperados y la prueba un par de minutos, pero **no se midió con reloj**, así que no hay un tiempo registrado. Queda como objetivo razonable y sin cifra.
- **Costo de la sesión de pruebas:** una sesión corta con `ml.t2.medium` a 0,089 USD por hora, por debajo de 0,10 USD. La facturación real se revisa una semana después (T059).
- **Lo que no se pudo probar:** la comparación del punto de inferencia real se hizo con 5 estudios, no con los 5.442 (queda fuera de esta entrega, FR-015). No se midió la calibración de las probabilidades.

