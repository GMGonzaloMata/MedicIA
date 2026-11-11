# Quickstart: validar la gestión de usuarios

**Funcionalidad**: `010-gestion-usuarios-clinica`

Guía para comprobar que la funcionalidad anda de punta a punta. No es una suite de pruebas.

## Requisitos

- Base de datos local con la migración `add_clinic_user_events` aplicada (la ejecuta el responsable; ver [data-model.md](data-model.md)).
- `.env.local` con `IDENTITY_PROVIDER=fake`, `INVITATION_MAILER=fake`, `FAKE_MAIL_OUTBOX_FILE` y `APP_BASE_URL=http://localhost:3000`.
- Una clínica de demostración: `npm run seed:demo`. Deja dos clínicas, A y B, con su administrador, médicos y pacientes (ver el script; los correos terminan en `@demo.medicia.test`).
- Para probar contra Cognito real hace falta, además, aplicar el cambio de Terraform de [contracts/identity-and-mail.md](contracts/identity-and-mail.md).

## Verificaciones automáticas

```text
npm run check
npm run test:e2e
```

Las pruebas de integración usan la base local de Docker. Las de extremo a extremo usan el proveedor de identidad y el correo simulados; mantené libre el puerto 3000.

## Recorrido manual

1. **Lista (US1).** Ingresá como administrador y abrí `/users`. Comprobá las dos pestañas, la paginación y que no aparece nadie de otra clínica. Ingresá como médico: no ves `/users`, y en `/patients` ves solo tus pacientes asignados.
2. **Alta con correo nuevo (US2).** En `/users/new` dá de alta un paciente con un correo que no tenga cuenta. Abrí el archivo del correo simulado: hay un aviso con la dirección `/verify-email`. Usá el código `000000`, elegí una contraseña e ingresá: la persona queda en la clínica sin haber usado un link.
3. **Alta con cuenta existente (US2).** Dá de alta a una persona que ya tenga cuenta (por ejemplo, otro paciente de la demostración): queda vinculada, su contraseña no cambia y el mensaje es idéntico al de un correo nuevo.
4. **Alta de un médico.** Con un médico ingresado, dá de alta un paciente: aparece en `/patients` del médico. Probá un documento o una matrícula repetidos: se rechaza con un mensaje claro.
5. **Reenvío.** Antes de que la persona nueva ingrese, usá «Reenviar acceso» y verificá el segundo aviso. Después de ingresar, la acción ya no está.
6. **Asignación (US3).** Como administrador, asigná un médico a un paciente sin médico y verificá que el médico lo ve. Quitalo (con confirmación): el médico deja de verlo.
7. **Baja (US4).** Con el médico ingresado en otra ventana, desactivalo como administrador: en su siguiente acción pierde el acceso a la clínica. Reactivalo: lo recupera con sus pacientes asignados. Revocá y reactivá un paciente.
8. **Reglas.** Intentá desactivarte a vos mismo y desactivar al único administrador: se rechaza.

## Qué debe verse en la base

- Un `clinic_user_events` por cada alta, asignación, baja, reactivación y reenvío, con quién lo hizo.
- Ninguna asignación terminada por una baja o una revocación.
- Un solo vínculo y una sola cuenta tras dos altas simultáneas del mismo correo (prueba de integración).

## Cerrar

El responsable ejecuta `npx prisma migrate dev` y `npx prisma generate` (migración nueva), aplica Terraform si va a usar Cognito real, hace el commit y vuelve a correr `npm run seed:demo` si cambió el escenario.
