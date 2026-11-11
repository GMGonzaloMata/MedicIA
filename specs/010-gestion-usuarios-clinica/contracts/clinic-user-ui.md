# Contrato: pantallas

**Funcionalidad**: `010-gestion-usuarios-clinica` | Español rioplatense. Lenguaje claro, sin jerga.

Reglas comunes (FR-031): tokens semánticos de color, modo claro y oscuro, móvil, tablet y escritorio sin desbordes, teclado y foco visible, estados comunicados con texto además de color, errores en una región `aria-live`. Las acciones de baja y de quitar una asignación piden confirmación con un diálogo accesible (foco al abrir y al cerrar, `Escape` cancela).

## `/users` (administrador)

- Dos pestañas: **Personal** y **Pacientes**. La activa va en la dirección (`?tab=staff|patients&page=N`); cada pestaña se pagina de a 25.
- **Personal:** por integrante, nombre, correo, roles, estado (Activo o Desactivado, con texto), y para médicos especialidad y matrícula. Acciones: Desactivar o Reactivar, y Reenviar acceso (solo si aún no ingresó). No muestra acciones sobre uno mismo.
- **Pacientes:** por paciente, nombre (o «Sin nombre» con su documento), documento, estado (Vinculado, Revocado, Pendiente) y los médicos asignados. Acciones: Asignar médico (elige entre los médicos activos), Quitar médico (confirmación), Revocar o Reactivar, y Reenviar acceso.
- Vacío: texto que explica cómo dar de alta a alguien, con el enlace al alta.
- Cada resultado se muestra como mensaje claro (por ejemplo «No se puede desactivar al único administrador de la clínica»), sin datos internos.

## `/users/new` (administrador y médico)

- Formulario de alta. Un administrador elige el tipo, Médico o Paciente; un médico solo ve Paciente.
- Campos comunes: correo y nombre completo. Paciente: tipo y número de documento. Médico: matrícula y especialidad.
- Al enviar: confirma el alta con el mismo mensaje exista o no la cuenta, indica si el aviso por correo no pudo enviarse (con el botón Reintentar) y, si lo hizo un médico, que el paciente quedó asignado a él.
- Nunca pide ni muestra una contraseña.

## `/patients/[patientId]` (médico, 006)

Se suma un único botón «Reenviar acceso», visible solo si el paciente tiene asignado al médico de forma vigente y todavía no ingresó. Usa la acción `resendAccess` de esta funcionalidad; no cambia nada más de la pantalla de la 006.

## Inicio

El administrador ve un enlace «Usuarios» (`/users`). El médico ve «Dar de alta a un paciente» (`/users/new`). Un paciente no ve ninguno.

## Accesos y redirecciones

Sin sesión, redirige al ingreso. Sin permiso (paciente, médico en `/users`), muestra la pantalla de acceso denegado de siempre, sin datos.

## Acciones de servidor (`(dashboard)/_users/_actions`)

`enrollMember`, `resendAccess`, `assignDoctor`, `unassignDoctor` y `changeMemberStatus`. Cada una arma el actor desde el contexto de acceso, valida la entrada con `zod`, delega en el caso de uso y devuelve un estado serializable. Ninguna contiene lógica de negocio ni recibe la clínica del formulario. Las acciones que cambian una fila revalidan `/users`.
