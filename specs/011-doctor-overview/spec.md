# Especificación: Resumen clínico en Inicio

**Rama de trabajo**: `integration/pdf-ecg-rebrand` (sin cambiar de rama)
**Creada**: 2026-11-18
**Origen**: [ODD, S4 y T3](../../odd/tasks/clinical-dashboard-refresh.md). Inicio tiene que informar al médico antes que ofrecerle navegación.

## Escenarios de uso y pruebas

### US1 — Consultar un panorama de mi clínica (P1)

Como médico, al entrar a Inicio quiero saber cuántos pacientes tengo asignados, cuántos estudios tienen y cuáles se cargaron más recientemente, sin abrir la lista de pacientes.

**Prueba independiente**: entrar como médico con más de cinco estudios repartidos entre pacientes a cargo, además de estudios de otro médico o clínica. Comparar los totales con los datos propios y abrir una fila con el teclado.

1. Con asignaciones vigentes, Inicio muestra el total de pacientes y de sus estudios y hasta cinco entradas recientes con nombre del paciente, número de estudio, fecha de carga y enlace al estudio.
2. Con pacientes asignados pero sin estudios, el total de estudios es cero y se explica que no tienen estudios cargados. Sin pacientes asignados, ambos totales son cero y se explica que no hay asignaciones vigentes.
3. Como administrador que también es médico, veo el resumen con el mismo alcance personal que un médico. Como paciente o administrador sin rol médico, conservo mi Inicio actual, sin resumen ni nombres de otros pacientes.

### Casos límite

- Una asignación terminada no aporta pacientes ni estudios a la próxima carga de Inicio, aunque el paciente y sus estudios sigan en la clínica. Los pacientes no vinculados tampoco aportan datos.
- Una coincidencia en fecha de carga se ordena siempre igual. Un paciente asignado sin estudios cuenta en pacientes, no en estudios.
- Si falla la consulta, no se presentan ceros como si fueran datos reales.

## Requisitos

### Requisitos funcionales

- **FR-001**: `Resumen clínico` está disponible solo para el vínculo médico de la clínica activa, con o sin rol administrativo. Se toma el vínculo de la sesión vigente, no de filtros que provea el usuario. No se reutilizan resultados entre usuarios o clínicas.
- **FR-002**: `Pacientes asignados` cuenta solo pacientes vinculados con una asignación vigente al médico en la clínica activa. `Estudios de esos pacientes` cuenta todos los estudios de ese mismo conjunto, sin limitarse a la lista reciente ni a quien los cargó.
- **FR-003**: `Estudios recientes` muestra hasta cinco estudios de ese conjunto, por fecha de carga descendente con desempate estable. Cada fila muestra únicamente nombre del paciente, número y fecha de carga, y enlaza al visor existente. No muestra documentos ni identificadores de cuenta, archivos, análisis o información fuera de alcance.
- **FR-004**: El resumen y sus cifras reales tienen prioridad visual. `Mis pacientes` es un enlace secundario a `/patients`. Los vacíos de asignaciones y estudios tienen mensajes distintos; no se inventan indicadores de urgencia, diagnósticos, turnos ni pendientes de revisión.
- **FR-005**: Se preservan las vistas de los demás roles y los labels/destinos de la barra lateral. El resumen conserva la paleta clínica y Literata, se lee en temas claro/oscuro y admite teclado, foco visible y texto sin desbordes en móvil, tablet y escritorio.

### Entidades relevantes

- **Asignación médica**: vínculo de una membresía médica con un paciente de la misma clínica; deja de contar al terminar.
- **Paciente**: registro de la clínica que cuenta solo mientras esté vinculado.
- **Estudio**: pertenece a un paciente de esa clínica, tiene número visible por paciente y fecha de carga.

## Criterios de éxito

- **SC-001**: Con tres pacientes asignados (uno sin estudios) y siete estudios autorizados, el resumen muestra 3 pacientes, 7 estudios y exactamente 5 filas en orden estable; los tres grupos no autorizados (otra clínica, otro médico, asignación terminada) no alteran los totales ni aparecen en las filas.
- **SC-002**: Las dos situaciones sin estudios producen mensajes distintos y cifras verificables, y el vínculo doble conserva su resumen incluso con 0/0. Ninguna vista de paciente o administrador no médico consulta ni muestra el resumen.
- **SC-003**: En 375, 768 y 1440 px, en modo claro y oscuro, se leen ambos totales y todas las filas sin desplazamiento horizontal. Con teclado se puede enfocar y abrir cada enlace visible.

## Supuestos

- No hay fecha de realización persistida para usar en el resumen: se usa la fecha de carga visible en los estudios y se la nombra como tal. El desempate técnico no constituye una prioridad clínica.
- Cinco entradas es el límite de Inicio; no limita el historial disponible desde `Mis pacientes`.
- Se mantienen las rutas, permisos y vínculos existentes. No se requiere esquema, proceso, dato ni servicio nuevo.
