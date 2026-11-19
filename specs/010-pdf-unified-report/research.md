# Research: decisiones acotadas para PDF e informe unificado

**Estado**: diseño de integración; evidencia científica y runtime separados. No se consultó internet, ejecutó Python, cargó artefactos o alteró otro repositorio. Las referencias externas siguientes son evidencia transmitida por el padre.

## R1 — Mantener el monolito y sus fronteras

**Decision**: `studies` conserva carga/lectura/autorización; `analyses` conserva pedidos, ejecuciones e informe. Composiciones conectan los módulos mediante puertos propios, sin imports cruzados de dominio/infraestructura. Nuevos puertos solo para extracción PDF y predicción con señal cruda; se reutilizan almacenamiento, directorio de pacientes y repositorios.

**Rationale**: coincide con constitución III y código existente. La preparación científica vive fuera de la aplicación, en una frontera privada previa a SageMaker, no en componentes o Server Actions. SageMaker recibe entradas numéricas preparadas, no el PDF original.

**Alternatives considered**: portal Anonimizacion expuesto públicamente (incorrecto alcance); Python incrustado en Next (viola responsabilidades); nueva cola/framework/orquestador (innecesario para dos invocaciones acotadas).

## R2 — Conservar un solo objeto privado por estudio, con versión nueva

**Decision**: nuevo sobre `MEDPDF01`, extensión `.pdfecg1`, que contiene original PDF, extracción desidentificada y derivados necesarios con procedencia. Se conserva `ecg1` exactamente como está; ningún backfill ni recodificación. El nuevo sobre no suplanta `MEDECG01` y un lector desconocido lo rechaza.

**Rationale**: guardar varios objetos exige ampliar transacciones, conciliación y limpieza; un sobre acotado preserva las invariantes actuales con un solo `storageKey`. Se reutilizan `insertWithNextNumber`, `StudyFileStorage`, compensación de carga y `findExistingStorageKeys` de conciliación. El original no llega a inferencia SageMaker: solo al extractor privado previo. S3 conserva el sobre privado según S7; almacenamiento autorizado no es entrada de predicción.

**Alternatives considered**: PDF desechado (contradice S7); reescribir todos los estudios a un formato nuevo (no autorizado); múltiples artefactos con tabla y recolector nuevos (complejidad evitable).

## R3 — Un pedido persistente, snapshot y ejecuciones disponibles

**Decision**: ampliar `Analysis` de forma aditiva con `kind`, `integratedResult` y `revision`. Mantener una fila por pedido y el índice `analyses_one_in_progress` existente. Para `ECG_UNIFIED_V1`, un documento validado contiene snapshot de disponibilidad y ejecuciones disponibles solicitadas, cada una con sus estados/resultados/procedencia. S11: inicialmente solo E022; Mini NOT_AVAILABLE es omisión, no ejecución fallida. Las filas antiguas quedan `LEGACY_ECHONEXT` por defecto, sin cambiar sus resultados.

**Rationale**: dos filas `Analysis` activas chocarían con el índice existente y debilitarían «un pedido por estudio». No se necesita tabla/índice de trabajos adicional. La fila agregada es el pedido, no un modelo ficticio; cada ejecución tiene la trazabilidad exigida por la constitución IV.

**Alternatives considered**: quitar el índice (regresión de concurrencia); escribir solo un resultado fusionado (contradice S2/S4/S9); dos subsistemas de análisis independientes (duplica políticas).

## R4 — Publicación al terminar todos los disponibles solicitados (S8 + S11)

**Decision**: S11 habilita E022 primero; solo cuando ambos estén disponibles habrá llamadas independientes en paralelo dentro del run programado por after(). La instantánea de capacidades es inmutable: no crear ejecución o error para Mini NOT_AVAILABLE; esperar solo ejecuciones disponibles solicitadas. Cada componente tiene tope de 30 s, incluido su preprocesamiento externo; el pedido vence a 120 s desde su creación, como el flujo histórico. Transiciones persistidas y finalización con comparación de revisión y estado. Una caída se recupera marcando pendientes como fallidos al consultar/pedir, sin reiniciar inferencias automáticamente.

**Rationale**: S8 exige esperar estados terminales, no una plataforma de colas. Con dos invocaciones paralelas el presupuesto actual basta como límite técnico propuesto, no como rendimiento demostrado. Las escrituras tardías no reviven estados terminales. Si el runtime real no puede cumplir estos límites, se detiene su habilitación y se revisa el diseño antes de ampliar infraestructura.

**Alternatives considered**: publicación incremental (rechazada por S8); invocación secuencial con suma de demoras (innecesaria); entrega garantizada/reintentos transparentes (no pedidos y pueden duplicar costo).

## R5 — Frontera externa versionada, sin inventar preparación

**Decision**: contrato `mortara-extraction.v1` hacia extractor privado y `ecg-preparation.v1` hacia preparación externa previa a dos adaptadores de SageMaker. Se pueden implementar schemas, puertos y fakes aquí; la exposición privada de los lectores/adaptadores Python existentes es un entregable externo, no trabajo autorizado en este repositorio ni en otro. EchoNext reutiliza el contrato numérico de 005 después de preparar; nunca enviar el contrato crudo al endpoint legacy.

**Rationale**: el lector reporta 12 × 5000 muestras, 500 Hz, microvoltios y máscara; EchoNext espera 2500 × 12 y siete variables ya preparadas. Es una incompatibilidad científica que no se arregla asumiendo un filtro, scaler, orden o tasa. La aplicación solo valida, empaqueta y preserva datos; el wrapper científico debe verificar su preparación específica.

**Alternatives considered**: reducir cada dos muestras, estandarizar con medias inventadas, rellenar faltantes o ejecutar `joblib` en el servidor (no aceptables).

## Evidencia y gates técnicos

| Gate | Evidencia actual | Cierre exigido | Qué bloquea |
|------|------------------|----------------|-------------|
| G1 — lector | Lectura pública comunicada: extractor Mortara versión 2, señal/máscara. | Referencia/versionado del lector, matriz de variantes y fixtures sintéticos aceptados/rechazados; prueba externa de límites y ausencia de identificadores en salida. | Habilitar carga PDF real; no codecs, fakes o pruebas de rechazo. |
| G2 — EchoNext | Auditoría pública del padre/explorador en `GMGonzaloMata/medicia-ml`, main sin pin de commit de ese repositorio: README, scripts/common.py, make_sample.py, package_artifacts.py, check_parity.py y src/medicia_ml/echonext/{contract,validation,predict}.py. Entrada preparada; validación/predict solo comprueban forma, finitud, sexo y pasan la onda al modelo. Esa ruta de servicio no aplica máscara, remuestreo, filtro o normalización; no demuestra ausencia de adaptadores en otros archivos. Common/make_sample leen arrays preparados con allow_pickle=False. El empaquetado nombra waveform_normalization_params.json y tabular_transformer.joblib externos, sin contenidos ni medias/escalas; servidor nunca carga joblib/pickle. IntroECG referenciado en `15233e9392e9dc10c136a5624abf10199207bce9`, no es un pin del servicio actual. | Adaptador E031 localizado y leído completo en el único archivo externo autorizado E031_compare_pdf.py. Reutilizar/verificar ese código, no crear conversión desde cero. Faltan el JSON exacto de normalización de onda, demostrar convención de escala/unidades, paridad de preparación y de las doce salidas, e aislar runtime sin imports privados. Las fórmulas tabulares ya están en texto y no requieren cargar joblib/pickle. Ver detalle G2 abajo. Orden confirmado: sex, age, ventricular_rate, atrial_rate, pr_interval, qrs_duration, qt_corrected; excepto sex 0 mujer/1 hombre, todo estandarizado. E022 usa seis variables y no aporta atrial_rate: su preparación no sustituye esta referencia. | Transformación e inferencia real EchoNext desde PDF, cobertura COMPLETE y afirmación de compatibilidad de ambos. No bloquea extracción, dominio, UI, fakes ni informe PARTIAL de E022 si G1/G3/G4 están cerrados y EchoNext figura NOT_AVAILABLE como omisión sin ejecución, error ni espera. |
| G3 — E022 | ZIP leído por el padre: E022/pdf_adapter.py línea 18 prepara onda/máscara/seis variables antes de SageMaker; no envía original PDF a inferencia. inference.py normaliza y valida 500 Hz/12×5000; no duplicar esa etapa. El humano confirma adaptación existente de frecuencia/duración, quizá upstream: no se afirma ausencia por no verla en el archivo leído. Objetivo lvef_lte_45, no FEVI numérica; hashes verificados, sin ejecución. | Entrega externa versionada que reutilice esa preparación, esquema de salida, limitaciones y prueba sintética reproducible. No volver a solicitar el preprocessing ya aportado. | Integración real de E022; no fakes o presentación. |
| G4 — operación | No servicios ejecutados; daemon Docker previamente no disponible. | Responsable confirma runtime local aislado, artefactos/servicios y permisos mínimos; autoriza cada ejecución. | Prueba local real y cualquier despliegue. |

## G2 — Adaptador experimental localizado: qué demuestra y qué no

Se leyó, no ejecutó, `C:/Users/lucho/Downloads/E031_compare_pdf.py`, autorizado expresamente por el humano. No se siguieron sus imports/rutas privadas ni se copió el script. Fuente en disco suministrada, sin pin propio aún verificado; el hash de IntroECG no identifica este archivo.

- `mini_wave`: requiere señal/máscara bool de 12×5000 a 500 Hz; por derivación, segmento observado contiguo, comienzo y longitud pares y al menos 302 muestras. Aplica `resample_poly(visible / uv_per_unit, 1, 2, padtype='line')`, mediana sucesiva 51/151, resta baseline, clip con límites y normaliza por media/std por derivación. Coloca el segmento en ix0//2 de un tensor 1×2500×12 inicialmente cero. Es una referencia experimental existente, no parámetros inventados por este plan.
- Caso real usa `uv_per_unit=10`, declarado explícitamente experimental y sin equivalencia de dispositivo verificada. El JSON de onda no fue aportado: SHA esperado `f3fc58aa37984bb58c7d47aa73f7a623c40fe0fd13f4c1ba4e1de050a53c2b1c`. Pesos Mini esperados `aac57aad0ec9763021c6264e89c74e3d78f8b711159b1880e5bd4515d5e21cd6`.
- `mini_fields` exige edad adulta/sexo y alguna tasa o intervalo positivo; orden crudo sex, age, ventricular_rate, atrial_rate=0, PR faltante=0, qrs_duration, qt_corrected. Las seis medias/escalas/imputaciones estandarizadas son arrays literales del archivo: NaN usa imputación, otros valores se estandarizan, sexo intacto. No repetir los arrays en estos docs ni cargar artefactos serializados para reconstruirlos.
- `predict_mini` usa únicamente `sigmoid(mini(... )[:,0])` para comparar FEVI. No prueba por sí mismo compatibilidad PDF de las doce salidas de producto. Los encabezados simulados son metadatos estructurados, no validación de OCR; un ECG real es comprobación técnica, no validación clínica.
- `e022_input` aplica normalización global de observados distinta de Mini. No mezclarla ni aplicarla dos veces al reutilizar la ruta E022 suministrada, cuyo adaptador corre antes de SageMaker y cuyo inference normaliza según su propio contrato.

Evidencia adicional leída por el padre (sin ejecución aquí): E031_metodo_y_ejecucion.md declara extracción de constantes tabulares bajo sklearn 1.1.3 y paridad histórica con casos sintéticos completos/faltantes; no se reprodujo. E031_test_compare_pdf.py contiene cinco tests con parámetros de onda falsos: forma/ceros ocultos/no lectura de NaN ocultos, orden tabular/ceros, rechazo de derivación ausente y cobertura de rechazos/métricas insuficientes; su presencia no es un resultado PASS ni recupera el JSON real. E030_digital_head_to_head.ipynb es digital-only, excluye PDF, RUN_TEST=False, sin outputs y sin artefacto/SHA Mini configurados; referencia medicia-ml en ee754fef420950899178cbf2bfaac720a8354974 y selecciona lvef_lte_45 por etiqueta. Ese commit es una referencia del notebook, no un pin verificado por esta lectura del servicio actual.

Para reproducibilidad hace falta el waveform_normalization_params.json con el SHA ya señalado y eventualmente pesos/manifest Mini exactos; también puede obtenerse de un **Mini model.tar.gz** generado por el script de empaquetado, si el compañero ya lo generó. Su existencia en su máquina es desconocida: no se afirma que haya un archivo existente perdido o ausente. No confundirlo con el tar de E022. Ninguno de los documentos/notebook/tests aportados contiene el JSON real; no asumir que otro documento lo recuperará.

Conservar estas convenciones como procedencia experimental, no como equivalencia científica aprobada ni como señal realmente observada. El dominio de ingestión nunca inventa ceros/medias: una imputación del adaptador solo puede reutilizarse explícitamente, con procedencia y evidencia, fuera del lector y de la app. Hasta cerrar ese gate, EchoNext PDF figura no disponible. No hay cuarta pregunta de producto para localizar el código, ya suministrado.

Una tolerancia para la nueva ruta PDF solo puede derivarse de la referencia validada: no se adopta automáticamente la de 005 ni se inventa otra. Ningún gate técnico constituye una nueva decisión de producto. Investigación documental terminada para las unidades seguras; G1–G4 no se declaran resueltos.
