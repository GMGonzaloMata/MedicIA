# Contrato de preparación de dos servicios reales

## Identidad aceptada y evidencia actual

S7/S8: EchoNext-Mini y FEVI completo ECGFounder + E022 son DOS servicios SageMaker. E022 candidato pendiente de validación externa. Backbone y head FEVI no se despliegan como endpoints independientes. Código/pesos/empaquetado Python se producen fuera de este repositorio; no se accede a ML externo, Colab ni Drive.

EchoNext tiene contrato en `specs/005-echonext-mini-sagemaker/contracts/inference-api.md`: waveform 2500x12, tabular 7, respuesta model/model_version y doce probabilidades. Referencias 0.1.0 del catálogo son evidencia de código, no de disponibilidad AWS actual. No cambiar ese contrato para acomodar FEVI.

## Gate G-ML — entrega humana externa

Antes de declarar FEVI preparado, recibir y verificar:

1. Validación/selección E022, provenance/huellas/versiones exactas de backbone y head, licencias y permiso de uso demo; no afirmar validación clínica.
2. Imagen real Linux compatible, URI ECR versionada inmutable y artefacto real en bucket autorizado con clave/checksum/versiones. Sin placeholders en catálogo.
3. Serving SageMaker /ping y /invocations, carga offline con network isolation, content types, límites de tamaño, errores sin datos clínicos y tiempos de arranque.
4. Contrato científico de entrada: frecuencia/duración/derivaciones/orden, normalización y variables requeridas; evidencia de compatibilidad o incompatibilidad con ecg1 actual. No transformar señal normalizada EchoNext a cruda por suposición.
5. Salida FEVI: campos/unidades/rangos/significado y semántica de versión compuesta, validación determinista y fixtures sintéticos permitidos. No asumir probabilidad, porcentaje o doce claves.
6. Benchmark CPU/memoria/latencia y cuota regional para una instancia permitida. Si no cabe o excede 30 s, presentar alternativa acotada al orquestador antes de cambiar arquitectura/costos.

No se especifican aquí los valores ausentes. G-ML pendiente no bloquea tests ni implementación EC2/RDS/HTTPS.

## Gate G-APP — integración después del contrato

La app actual no soporta ambos: ModelInference/ModelPrediction usan Probabilities EchoNext, configuración acepta un endpoint, Analysis.probabilities y renderizado son monomodelo. Cambiar solo SAGEMAKER_ENDPOINT_NAME a FEVI sería incorrecto.

Después de G-ML: refinar esta feature con selección explícita de capacidad apropiada, validación de archivo previa a inferencia, adaptadores por contrato, salida discriminada validada, persistencia aditiva que preserve históricos y versiones exactas, UI de posibles hallazgos y pruebas de autorización cross-tenant. Mantener PENDING/PROCESSING/COMPLETED/FAILED; respuesta malformada o servicio ausente produce FAILED, sin hallazgos. Reutilizar requestAnalysis/repositorios/composiciones existentes, no duplicar inserción/contadores o autorización.

El refinamiento de contrato/datos/tareas debe pasar clarify/plan/analyze del delta y lectura del padre antes de código de integración. Ningún umbral ni esquema FEVI se decide en implementación por conveniencia. No introducir capa nueva sin necesidad concreta.

## Gate G-CLOUD — aceptación real, posterior y humana

G-ML y G-APP satisfechos; costo/duración/cierre aprobados. Preparar repositorio con model-registry y entrada con model-endpoints; ampliar lectura ECR concreta tanto rol ejecución como su límite. Endpoints apagados por defecto, habilitados solo explícitamente por humano. Verificar un caso válido y uno inválido por servicio, selección efectiva, versiones exactas persistidas y rechazo ajeno. La demo no cumple FR-010/SC-005 si solo EchoNext funciona, si se invoca FEVI fuera de la app sin integración, o si se reemplazan fallas por resultados ficticios.
