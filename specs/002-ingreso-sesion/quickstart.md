# Guía de validación: Ingreso y sesión

**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

Cómo comprobar que la funcionalidad cumple la spec. Los comandos de Prisma los ejecuta el responsable del proyecto.

## Requisitos previos

1. La base local levantada: `docker compose up -d`.
2. `.env.local` con `DATABASE_URL` (ya existe) y las variables nuevas para el proveedor simulado:
   - `IDENTITY_PROVIDER=fake`
   - Sin ninguna variable `COGNITO_*` (el proveedor simulado no inicia si están definidas).
3. La migración de esta funcionalidad aplicada y el cliente de Prisma regenerado:
   - `npx prisma migrate dev --name session_table`
   - `npx prisma generate`
4. Dependencias nuevas instaladas (aprobadas por el responsable).

## Verificación automática

- `npm run check`: tipos, lint, pruebas con cobertura y compilación.
- `npm run test:integration`: reglas de la tabla de sesiones y revalidación, contra PostgreSQL real.
- `npm run test:e2e`: recorridos completos en escritorio, tablet y móvil, con el proveedor simulado.

## Qué comprueba cada prueba de integración

Cada una intenta violar la regla y espera el rechazo, nombrando la restricción que la rechaza.

- **Una sesión no apunta al vínculo de otra persona:** crear una sesión de la cuenta A con la membresía o el paciente de la cuenta B es rechazado por la clave foránea compuesta (FR-024, SC-003).
- **Una sesión tiene a lo sumo un vínculo activo:** completar los dos campos es rechazado.
- **El identificador de la cookie es único y tiene 64 caracteres.**
- **Los vencimientos son coherentes:** `expiresAt`, `lastActivityAt` y `revokedAt` no pueden ser anteriores a `createdAt`.
- **Revalidación:** con una sesión abierta, suspender la clínica, desactivar la membresía o revocar al paciente hace que el contexto pase a `no-clinic` en la lectura siguiente (FR-025, SC-002).
- **Vencimientos:** una sesión pasada la inactividad o el tiempo absoluto se resuelve como `anonymous`.
- **Cierre:** una sesión revocada se resuelve como `anonymous`, y otra sesión de la misma persona sigue vigente (FR-011, FR-021).
- **Cambio de contraseña:** adelantar `sessionsValidFrom` invalida todas las sesiones anteriores y no la creada después (FR-016, SC-005).
- **Clínica ajena:** elegir una clínica de la que la persona no forma parte, o que está suspendida, es rechazado con el mismo error (FR-022, SC-003).
- **Lista de clínicas:** solo aparecen vínculos vigentes en clínicas activas (FR-017).

## Recorridos de punta a punta (E2E)

1. **Registro:** `/sign-up` → código `000000` → mensaje de cuenta verificada → `/sign-in` (US1).
2. **Primer ingreso sin clínica:** ingresar con la cuenta nueva → `/no-access` con el mensaje de invitación (US2).
3. **Una clínica:** con un vínculo creado en la base, ingresar entra directo a `/` mostrando la clínica (US2).
4. **Varias clínicas:** ingresar muestra `/select-clinic`; elegir una; cambiar a otra desde el encabezado (US2).
5. **Ruta protegida:** abrir `/` sin sesión redirige a `/sign-in?next=/`; tras ingresar vuelve a `/`. Un `next` externo (`https://...` o `//host`) se ignora (US3).
6. **Pérdida de acceso en caliente:** con la sesión abierta, suspender la clínica en la base y recargar lleva a `/no-access` o a la selección (US3).
7. **Cierre de sesión:** `signOut` lleva a `/sign-in` y la ruta protegida deja de abrirse (US4).
8. **Recuperación:** `/forgot-password` → código `000000` → nueva contraseña → una sesión abierta en otro contexto del navegador deja de valer (US4).
9. **Mensajes uniformes:** el ingreso con un correo inexistente y con una contraseña incorrecta muestran el mismo texto (SC-004).
10. **Interfaz:** cada pantalla se ve y se usa con teclado en escritorio, tablet y móvil, en modo claro y oscuro (FR-030).

## Verificación manual con Cognito real

Solo cuando el grupo de usuarios de desarrollo esté creado (contrato en [contracts/identity-provider.md](contracts/identity-provider.md)):

1. Reemplazar en `.env.local` `IDENTITY_PROVIDER=fake` por `cognito` y cargar las variables `COGNITO_*`.
2. Registrarse con un correo propio y comprobar que llega el código.
3. Verificar, ingresar y comprobar el estado vacío.
4. Comprobar los puntos marcados **a verificar** en [research.md](research.md): llamadas sin credenciales de AWS, respuesta ante una cuenta sin verificar, y cookie `Secure` en `http://localhost`.
5. Probar la recuperación de contraseña y que las otras sesiones se cierran.
