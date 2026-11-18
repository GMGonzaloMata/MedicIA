# Modelo de datos: Resumen clínico

Vista de solo lectura de registros existentes; no introduce tablas, campos ni transiciones.

- **Clínica y membresía médica activas**: identificadores requeridos y derivados del contexto autorizado. Una membresía con ambos roles se evalúa como médico, no como administrador.
- **Paciente asignado**: paciente de esa clínica, `status = LINKED`, con alguna asignación de esa clínica y membresía cuyo `endedAt` sea nulo. Se cuenta el paciente, no las filas de asignación. El nombre puede ser nulo en el contrato de lectura; se usa el rótulo existente para ese caso.
- **Estudio autorizado**: de la misma clínica y de un paciente asignado según el criterio anterior. El número requerido se asigna por paciente. La fecha de carga y el ID son requeridos; ambos se ordenan descendentemente y el ID desempata. No se filtra por cargador ni por análisis.
- **Proyección**: dos totales enteros no negativos, más una lista de 0 a 5 filas con solo ID de estudio (destino), número, fecha de carga y nombre del paciente. Nunca se devuelve ID de paciente ni otros campos de identidad o acceso privado.
