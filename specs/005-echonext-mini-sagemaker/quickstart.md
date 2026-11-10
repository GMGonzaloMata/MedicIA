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
- SC-006: la 006 se puede construir con solo el contrato de inferencia.

## Aviso

Las probabilidades son un indicador relativo de riesgo de un posible hallazgo, de apoyo clínico. El modelo es de investigación, entrenado con adultos en un solo centro, y el código original no declara licencia. El uso actual es académico; un uso comercial exige revisar la licencia antes.
