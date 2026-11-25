# Guía de validación: Vinculación de personal y pacientes a una clínica

Recorridos para comprobar la funcionalidad de punta a punta. Cada uno referencia su historia en [spec.md](spec.md). No contiene código: el detalle está en [contracts/](contracts/) y en [data-model.md](data-model.md).

## Requisitos

- Base local de `docker-compose.yml` con las migraciones aplicadas, **incluida la nueva** (la aplica el responsable con `prisma migrate`).
- `npm run seed:demo` ejecutado (crea dos clínicas, personal y pacientes de prueba). Si lo ejecutaste antes de esta funcionalidad, volvé a correrlo.
- En `.env.local`: `INVITATION_MAILER=fake`, `FAKE_MAIL_OUTBOX_FILE=.tmp/e2e-outbox.jsonl` y `APP_BASE_URL=http://localhost:3000`. Con `fake` no sale ningún correo.
- Dos clínicas de la siembra (A y B), cada una con un administrador, un médico y pacientes, para comprobar el aislamiento.

## Recorridos

### 1. El administrador incorpora a un médico (Historia 1)

1. Ingresá como administrador de la clínica A y abrí «Personal».
2. Invitá a un correo nuevo con el rol «médico».
3. **Esperado:** aparece una invitación pendiente; el archivo de salida del correo tiene una línea con el enlace.
4. Registrá una cuenta con ese correo, verificala, ingresá y abrí el enlace.
5. **Esperado:** la pantalla muestra la clínica A y el rol; al aceptar queda activa la clínica A con el rol de médico, y desaparece el aviso de falta de acceso.
6. Reabrí el mismo enlace. **Esperado:** mensaje único de invitación no válida.

### 2. Rechazos de la invitación (Historia 1 y 3)

- Invitá a un correo y abrí el enlace con una cuenta de **otro** correo. **Esperado:** invitación no válida.
- Revocá una invitación y usala. **Esperado:** invitación no válida.
- Invitá a un miembro activo con su mismo rol. **Esperado:** «ya pertenece a la clínica», sin duplicar.
- Invitá a un miembro activo con un rol que no tiene. **Esperado:** al aceptar suma el rol en la misma membresía.
- Con un usuario que **no es administrador**, intentá abrir `/clinic/staff` y llamar la acción por POST directo. **Esperado:** rechazo y ningún cambio.

### 3. Paciente: alta, asignación y vinculación (Historias 2 y 3)

1. Como administrador de A, abrí «Pacientes de la clínica» y registrá un paciente con su tipo y número de documento.
2. **Esperado:** se muestra un código `XXXXX-XXXXX` una sola vez, con el aviso de que no se podrá volver a ver.
3. Asigná el paciente a un médico de A. Ingresá como ese médico. **Esperado:** el paciente aparece en «Mis pacientes». Un segundo médico de A no lo ve.
4. Con una cuenta sin clínica, abrí `/link-patient` e ingresá el documento y el código.
5. **Esperado:** la cuenta queda vinculada como paciente de A y ve sus datos.
6. Repetí con un documento o código incorrecto. **Esperado:** el mismo mensaje en ambos casos.
7. Con un código válido, fallá 5 veces. **Esperado:** el código queda anulado; la clínica genera uno nuevo desde la lista.
8. **Esperado también:** un código usado, vencido o reemplazado se rechaza con el mismo mensaje.

### 4. Desactivar y reasignar (Historia 4)

1. Con una sesión del médico **abierta en otra ventana**, desactivalo desde «Personal».
2. **Esperado:** en su siguiente operación pierde el acceso a la clínica, sin esperar a que venza la sesión.
3. Como paciente asignado a ese médico, abrí «Mis estudios». **Esperado:** aviso de que su médico ya no está disponible.
4. Como administrador, comprobá que la asignación sigue vigente pero figura con el médico desactivado, y reasigná el paciente a otro médico. **Esperado:** el historial de la asignación anterior se conserva con fecha y autor.
5. Reactivá al médico. **Esperado:** recupera el acceso y a los pacientes cuyas asignaciones seguían vigentes.
6. Con un solo administrador activo, intentá desactivarlo. **Esperado:** `LAST_ADMIN`.

### 5. Aislamiento entre clínicas

Con administradores de A y de B, intentá, por POST directo, operar sobre identificadores de la otra clínica: revocar su invitación, desactivar a su miembro, ver sus pacientes, asignar o terminar una asignación suya. **Esperado:** `NOT_FOUND` en todos, sin revelar si existen, y ningún cambio en B.

### 6. Datos personales fuera de los registros

Ejecutá los recorridos con la salida de la aplicación capturada. **Esperado:** ninguna línea contiene correos, documentos, nombres, tokens ni códigos de vinculación.

## Comandos de prueba

- `npm run check` (tipos, lint, pruebas con cobertura y `build`).
- `npm run test:e2e` (los recorridos 1 a 4 están automatizados con el correo simulado).
- En Windows, la terminal debe tener Git Bash en el `PATH`: las pruebas de infraestructura lo necesitan.

## Comprobación manual con correo real

Solo con `INVITATION_MAILER=smtp` y las variables `SMTP_*` e `INVITATION_FROM_ADDRESS` en el entorno: enviá una invitación a una dirección propia y confirmá que llega con el enlace correcto. Es responsabilidad del responsable; ninguna prueba automatizada envía correos reales.

## Antes de desplegar a la demo

La migración se aplica en la base de RDS con el procedimiento de siempre, y las variables `INVITATION_MAILER`, `SMTP_*`, `INVITATION_FROM_ADDRESS` y `APP_BASE_URL` se agregan al secreto de la aplicación (`medicia-dev-demo/app`) por un canal privado.
