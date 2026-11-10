# Contexto de la plataforma

> Documento de contexto funcional y de negocio para el proyecto. Describe **qué es la plataforma, para quién existe y qué problema busca resolver**. No define tecnologías, arquitectura de software, infraestructura ni identidad visual; esos temas se documentan por separado.

## 1. Visión del producto

La plataforma es una solución de software orientada a instituciones de salud que permite **cargar estudios médicos y analizarlos mediante modelos de inteligencia artificial especializados**, con el propósito de identificar posibles hallazgos o anomalías relevantes y presentarlos de manera comprensible al profesional de salud o al paciente.

Su visión es evolucionar hacia una **plataforma de análisis de múltiples tipos de estudios médicos**. No se limita a una patología, un único modelo o una institución: busca ofrecer una experiencia de uso común para distintos estudios y capacidades de análisis que puedan incorporarse progresivamente.

La plataforma se concibe como una **herramienta de apoyo a la evaluación clínica**, no como un sistema que reemplaza el criterio profesional ni que emite diagnósticos definitivos de manera autónoma.

## 2. Problema que busca resolver

Los estudios médicos requieren interpretación especializada y pueden contener patrones que demandan tiempo, experiencia y herramientas específicas para su evaluación. A su vez, las soluciones de IA clínica suelen enfocarse en una modalidad o tarea particular, lo que puede obligar a las instituciones a adoptar herramientas separadas para distintas necesidades.

El proyecto busca facilitar el acceso a capacidades de análisis asistido por IA desde una **única plataforma**, organizada alrededor del trabajo de las clínicas y sus profesionales.

Esto no supone que todos los estudios puedan analizarse con el mismo modelo: cada modalidad y cada tarea requieren modelos adecuados y validados para ese uso.

## 3. Propuesta de valor

La plataforma pretende ofrecer:

- **Acceso unificado:** un mismo entorno desde el cual solicitar análisis de diferentes tipos de estudios médicos.
- **Análisis especializado:** selección de capacidades de IA acordes con el estudio y el tipo de hallazgo que se desea evaluar.
- **Resultados consultables:** presentación clara de los posibles hallazgos, junto con la información necesaria para contextualizarlos.
- **Trazabilidad:** conservación del estudio y del resultado para su posterior consulta, seguimiento o eventual reanálisis.
- **Extensibilidad:** posibilidad de incorporar nuevas modalidades, tareas clínicas y modelos sin cambiar la propuesta central del producto.
- **Uso institucional:** separación de la información y de la gestión de cada clínica dentro de una misma plataforma comercial.

El valor esperado es asistir al profesional en su proceso de revisión y favorecer un flujo de análisis más ordenado. **La utilidad clínica real de cada análisis deberá demostrarse mediante evaluaciones y validaciones apropiadas**; no se presupone a partir de la sola disponibilidad de un modelo.

## 4. Usuarios y clientes objetivo

### Clientes potenciales

- Clínicas y centros médicos.
- Instituciones de diagnóstico.
- Organizaciones de salud que necesiten incorporar análisis asistidos por IA a sus procesos.

### Usuarios de la plataforma

- **Profesionales de salud o pacientes:** cargan estudios, solicitan análisis y revisan resultados.
- **Administradores de clínica:** gestionan el uso institucional de la plataforma y sus usuarios, de acuerdo con los permisos que se definan.
- **Administradores de la plataforma:** administran la oferta de funcionalidades y la operación general del producto.

Los perfiles exactos, permisos y procesos administrativos podrán ajustarse según las necesidades de las instituciones usuarias.

## 5. Funcionamiento desde la perspectiva del usuario

El flujo funcional previsto es:

1. El usuario autorizado ingresa a la plataforma.
2. **Selecciona manualmente el tipo de estudio** que desea analizar (por ejemplo, electrocardiograma).
3. Selecciona el análisis disponible para ese tipo de estudio, cuando corresponda.
4. Carga el archivo del estudio.
5. La plataforma comprueba si el archivo cumple los requisitos del análisis solicitado.
6. El estudio es preparado y analizado mediante el modelo especializado correspondiente.
7. El usuario recibe un resultado con los posibles hallazgos y la información relevante para interpretarlos.
8. El estudio y el resultado se conservan para permitir su consulta posterior, según las políticas de acceso y conservación aplicables.

**Decisión de alcance:** el sistema **no necesita identificar automáticamente el tipo de estudio**. Esa selección la realiza el usuario. La identificación automática podría evaluarse como una capacidad futura, pero no es parte central de la propuesta actual.

## 6. Qué representa un análisis

Un **estudio** es el material médico que se carga en la plataforma, como un ECG, una radiografía, un ecocardiograma o un resultado de laboratorio. Cada estudio pertenece a un **paciente** de la clínica: lo carga el propio paciente o un médico con una asignación vigente a ese paciente, y lo ven esas mismas personas. Un administrador de clínica que no es médico no accede a los estudios.

Un **análisis** es una ejecución de una capacidad de IA sobre un estudio, orientada a buscar uno o más hallazgos concretos.

Un **hallazgo** es el resultado reportado por esa capacidad: por ejemplo, una estimación de probabilidad o una señal de posible anomalía. Su interpretación depende de la tarea y del modelo empleado.

Un mismo estudio podría admitir **varios análisis diferentes**, realizados en distintos momentos o con capacidades especializadas distintas. Esto permite que el producto crezca sin asociar permanentemente cada estudio a una única predicción.

## 7. Primer caso de uso: electrocardiogramas

La primera implementación funcional se concentra en **electrocardiogramas (ECG)**.

En este caso, el usuario selecciona ECG, carga un estudio compatible y solicita el análisis. La plataforma devuelve una estimación del modelo y la presenta como **posible hallazgo**, no como confirmación diagnóstica.

El desarrollo inicial se apoya en datos y modelos de investigación para estudiar la viabilidad de esta capacidad. Antes de un uso clínico real, será necesario verificar la compatibilidad de los estudios de entrada y evaluar el desempeño del modelo en condiciones representativas de la institución de destino.

## 8. Evolución funcional prevista

La plataforma debe poder incorporar progresivamente:

- Nuevos análisis sobre ECG.
- Otras modalidades, como radiografías y ecocardiogramas.
- Análisis de datos de laboratorio, cuando existan modelos adecuados y una forma de entrada compatible.
- Nuevos modelos o versiones mejoradas para capacidades ya disponibles.
- Reanálisis de estudios almacenados, cuando resulte útil y esté permitido.

Estas posibilidades constituyen una **visión de evolución**, no funcionalidades que deban considerarse implementadas o clínicamente validadas en la actualidad.

## 9. Enfoque multiinstitucional

El producto está pensado para ser utilizado por **múltiples clínicas o instituciones de salud**. Cada institución constituye un espacio de trabajo propio, con sus usuarios, estudios y análisis.

La plataforma debe preservar la **separación de la información entre instituciones**. Un usuario de una clínica no debe poder consultar ni operar sobre información de otra sin una autorización explícita y válida.

Esta separación es un requisito de negocio y de confianza del producto, independientemente de la implementación técnica elegida.

## 10. Conservación y consulta de estudios

La plataforma contempla conservar los archivos de los estudios cargados y los resultados obtenidos para ofrecer valor más allá de una predicción momentánea.

Los usos previstos incluyen:

- Recuperar un estudio y revisar su resultado anterior.
- Consultar el historial de análisis realizados dentro de una institución.
- Saber qué capacidad de análisis produjo un resultado y en qué momento.
- Facilitar reanálisis posteriores si se habilita esa función.
- Respaldar la trazabilidad y las revisiones pertinentes.

La conservación **no implica utilizar automáticamente los estudios para entrenamiento**. Cualquier uso secundario de datos clínicos requiere una finalidad definida, las autorizaciones correspondientes y controles apropiados.

Los plazos de conservación y eliminación deberán definirse de acuerdo con los requisitos institucionales y legales aplicables.

## 11. Modelo de negocio: orientación inicial

La orientación comercial es **B2B**, dirigida a clínicas y otras organizaciones de salud. La propuesta consiste en ofrecer acceso institucional a capacidades de análisis médico asistido por IA, con posibilidad de ampliar el conjunto de estudios y análisis disponibles.

Se podrán evaluar alternativas comerciales como suscripción institucional, planes por funcionalidades o cobro asociado al volumen de análisis, pero **no hay un esquema de precios ni una modalidad de facturación definitivamente establecidos** en este documento.

El producto deberá demostrar tanto utilidad operativa como desempeño clínico suficiente antes de que su propuesta de valor pueda considerarse validada comercialmente.

## 12. Principios funcionales y límites del producto

1. **Apoyo, no sustitución:** los resultados de IA son asistencia a la evaluación profesional y no constituyen por sí solos un diagnóstico.
2. **Selección explícita:** el usuario elige el estudio y el análisis; la clasificación automática de estudios no es un requisito actual.
3. **Especialización:** cada análisis se asocia con una capacidad/modelo apropiado para la tarea.
4. **Extensibilidad:** el producto debe admitir nuevas modalidades y análisis sin perder coherencia de uso.
5. **Trazabilidad:** los resultados deben poder relacionarse con el estudio y la capacidad que los produjo.
6. **Separación institucional:** la información de cada clínica debe mantenerse aislada y con acceso autorizado.
7. **Tratamiento responsable de datos:** la información médica se gestiona con finalidad definida, acceso restringido y políticas de conservación.
8. **Validación de alcance:** no se afirma que una capacidad esté disponible, sea precisa o esté clínicamente validada solo por estar contemplada en la visión del producto.

## 13. Fuera del alcance de este documento

Este archivo **no define**:

- Frameworks, lenguajes o librerías.
- Arquitectura de software, patrones de diseño o infraestructura cloud.
- Servicios concretos de almacenamiento, autenticación o despliegue.
- Diseño de base de datos o contratos de API.
- Colores, tipografías, logotipos o componentes visuales.
- Hiperparámetros, arquitecturas de redes neuronales o métricas experimentales detalladas.

Esos temas deben mantenerse en documentos independientes, para que el contexto de negocio siga siendo estable aunque cambie la implementación tecnológica.
