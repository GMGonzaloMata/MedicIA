# Guía de validación: Link de vinculación a una clínica

**Funcionalidad**: `009-link-vinculacion`

Sirve para comprobar de punta a punta que la funcionalidad anda, con el correo simulado y sin enviar nada real. Los pasos marcados como "responsable" los ejecuta el dueño del proyecto desde su terminal (comandos reservados de Prisma).

## Requisitos previos

- La base local de Docker levantada (`docker compose up -d`) y las migraciones aplicadas.
- **Responsable**: la migración de esta funcionalidad (`data-model.md`, sección "Migración"): `npx prisma migrate dev --create-only --name add_invitations`, pegar a mano el SQL de los `CHECK` y el índice parcial, `npx prisma migrate dev` y `npx prisma generate`.
- Variables en `.env.local` (ninguna es un secreto):
  - `INVITATION_MAILER=fake`
  - `APP_BASE_URL=http://localhost:3000`
  - `FAKE_MAIL_OUTBOX_FILE=` una ruta local fuera de git, por ejemplo `.tmp/outbox.jsonl`
  - Las de ingreso que ya usa la 002 (proveedor de identidad simulado).
- Datos de prueba: `npm run seed:demo` crea una clínica, un administrador, médicos y pacientes.

## Escenario 1: el administrador invita a un médico (historia 1)

1. Ingresar como el administrador de la clínica de prueba y abrir `/invitations`.
2. Elegir "Médico", cargar un correo nuevo y una matrícula, y enviar.
3. Esperado: confirmación "Enviamos la invitación"; la lista muestra el link como pendiente con vencimiento a 7 días. El link no aparece en pantalla.
4. En el archivo del correo simulado hay una línea con el link `…/invite/<token>`.
5. Abrir el link en una ventana privada: va a `/sign-in` (con el aviso de la invitación). Crear la cuenta con ese correo, verificarla con el código y volver a ingresar.
6. Esperado: el ingreso lleva a `/invitation`, que dice "<Clínica> te invitó como médico". Cargar la misma matrícula y una especialidad.
7. Esperado: queda vinculada y entra a la clínica. En `/` aparece "Mis pacientes". Reabrir el mismo link da "no es válida".

## Escenario 2: el administrador invita a un paciente con cuenta existente (historia 2)

1. Invitar como paciente (tipo de documento y número) a un correo que ya tiene cuenta en la plataforma.
2. Abrir el link, iniciar sesión y cargar el mismo documento.
3. Esperado: vinculada como paciente, sin ningún médico asignado.
4. Repetir con un documento distinto al ingresar: "Los datos no coinciden. Te quedan 4 intentos." Con cinco errores, el link se invalida.

## Escenario 3: el médico invita a un paciente (historia 3)

1. Ingresar como médico y abrir `/invitations` (solo ofrece "Paciente").
2. Invitar a un correo nuevo con su documento y completar el recorrido del escenario 1 con el paciente.
3. Esperado: el paciente aparece en "Mis pacientes" de ese médico y no en la lista de otro médico de la clínica.

## Escenario 4: control de los links (historia 4)

1. Generar un link y revocarlo desde la lista. Abrirlo después: "no es válido".
2. Abrir un link con una cuenta de otro correo: "no es válido", sin datos de la clínica.
3. Invitar dos veces al mismo correo: la primera queda revocada y solo la segunda sirve.
4. Invitar a `fail@invitations.test`: "No pudimos enviar el correo" y el botón "Reintentar".

## Escenario 5: segunda clínica (historia 5)

1. Con una cuenta que ya pertenece a la clínica A, aceptar un link de la clínica B.
2. Esperado: queda activa la B; al volver a ingresar, la selección de clínica de la 002 ofrece las dos.

## Pruebas automáticas

- `npm run check`: tipos, lint, pruebas con cobertura mínima del 80 % por archivo y compilación. Debe terminar sin errores.
- `npm run test:integration`: requiere la base local. Incluye la aceptación simultánea del mismo link (exactamente un éxito), una persona con un link de médico y otro de paciente a la vez (un solo vínculo), el reemplazo concurrente y el rechazo desde otra clínica.
- `npm run test:e2e`: recorre los escenarios 1 a 3 con el correo simulado leyendo `FAKE_MAIL_OUTBOX_FILE`.

## Cuando se use el correo real (Gmail por SMTP)

Todo esto lo prepara el responsable:
1. Crear una cuenta de Google **dedicada al proyecto** (no la personal), activar la verificación en dos pasos y generar una **contraseña de aplicación**.
2. En `.env.local` (fuera de git): `INVITATION_MAILER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` y `INVITATION_FROM_ADDRESS` con la dirección de esa cuenta, `SMTP_PASSWORD` con la contraseña de aplicación, y `APP_BASE_URL` con la dirección pública real (`https` en producción).
3. Repetir el escenario 1 con un destinatario real y comprobar que el correo llega (y mirar también la carpeta de spam) y que el link abre `/invitation`.
4. Si la contraseña se filtra o se deja de usar, revocarla desde la cuenta de Google.

## Qué no se pudo verificar sin el entorno real

El envío por SMTP y la entrega del correo (bandeja de entrada o spam) solo se pueden comprobar con el paso anterior: con el correo simulado se verifica el contenido, el link y el flujo, no la entrega. Queda como verificación manual del responsable. El límite diario de Gmail y un posible bloqueo de Google por envíos automáticos tampoco se pueden probar de antemano.

## Resultados

Ejecutado con el correo simulado (`INVITATION_MAILER=fake`) y el proveedor de identidad simulado, sobre la base local.

Automático:
- `npm run check`: tipos, lint, pruebas unitarias y de integración, cobertura por archivo y build, en verde.
- Integración contra la base: aceptación simultánea del mismo link (un solo vínculo), intentos incorrectos simultáneos (no pasan de 5), rechazo desde otra clínica al generar, listar, revocar y aceptar, link vencido, revocado, reemplazado, usado, de clínica suspendida y de emisor desactivado, reutilización del paciente revocado, asignación al médico sin duplicados, y segunda clínica con selección de las dos.
- Extremo a extremo (`tests/e2e/invitations.spec.ts`, 10 pruebas en escritorio, tablet y móvil; la de anchos de pantalla y modo oscuro solo en escritorio): escenarios 1 a 4 completos. En una corrida de toda la suite fallaron 4 pruebas de las funcionalidades 007 y 008 (proyecto móvil) por datos de clínica que desaparecieron durante la corrida; al repetirlas solas pasaron las 9 que corren.

A mano (responsable), con el correo simulado:
- Escenario 1 (administrador invita a un médico): comprobado en el navegador hasta recibir el correo simulado; el recorrido completo y los escenarios 2 a 5 los cubre la prueba extremo a extremo.

Pendiente del responsable:
- Prueba con Gmail real: escenario 1 con un destinatario verdadero y `INVITATION_MAILER=smtp`; comprobar que el correo llega y que no cae en spam.
- Revocar la contraseña de aplicación de Gmail si deja de usarse.
