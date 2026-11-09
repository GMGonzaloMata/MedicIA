# Contrato: pantallas y acciones

**Plan**: [../plan.md](../plan.md) | **Spec**: [../spec.md](../spec.md)

Las pantallas están en español y las rutas en inglés (R14). Cada acción es una Server Action delgada: valida la forma de la entrada con `zod`, llama al caso de uso, escribe o borra la cookie y redirige. Las acciones viven en `src/app/**/_actions/`.

Todas las acciones que requieren sesión comienzan llamando a `requireClinicContextForAction()` o a la comprobación de sesión que corresponda ([access-context.md](access-context.md)).

## Mensajes

Los mensajes son un conjunto cerrado, para que ningún error de AWS ni de la base llegue a la persona (FR-029). Cada mensaje de error se asocia a un campo o al formulario y se comunica con texto e ícono, no solo con color.

- **Credenciales:** "El correo o la contraseña no son correctos." Es el único mensaje de ingreso fallido, para cualquier causa (FR-009, FR-010).
- **Código:** "El código no es correcto o ya venció."
- **Registro y reenvío:** "Si el correo puede registrarse, te enviamos un código de verificación." Se muestra siempre.
- **Recuperación:** "Si existe una cuenta con ese correo, te enviamos un código para restablecer la contraseña." Se muestra siempre.
- **Contraseña:** "La contraseña debe tener entre 8 y 128 caracteres, con al menos una mayúscula." Al elegirla se pide repetirla y, si no coinciden, "Las contraseñas no coinciden."
- **Clínica no disponible:** "No podés usar esa clínica en este momento." Para una clínica ajena, inexistente o ya no vigente, sin distinguirlas (FR-022).
- **Servicio:** "No pudimos completar la operación. Intentá de nuevo en unos minutos."

Cuando una sesión vence, la persona llega a `/sign-in` sin un mensaje aparte: no hay forma de distinguir una sesión vencida de una que nunca existió sin revelar información, y la spec solo pide llevarla a iniciar sesión.

## Pantallas públicas (grupo `(auth)`)

- **`/sign-in`**
  - **Campos:** correo, contraseña. Acepta `?next=` (R9).
  - **Contiene siempre:** enlace a `/forgot-password`, a `/sign-up` y "¿No verificaste tu correo?" hacia `/verify-email` (R4).
  - **Si ya hay sesión vigente:** redirige a donde corresponda según el contexto.
- **`/sign-up`**
  - **Campos:** nombre completo, correo, contraseña.
  - **Paso 2 en la misma pantalla:** tras enviar, pide el código. El correo queda en el estado del formulario, no en la URL.
  - **Al verificar:** lleva a `/sign-in` con el aviso "Tu cuenta quedó verificada. Ya podés ingresar."
- **`/verify-email`**
  - **Campos:** correo, código. Botón para pedir un código nuevo.
  - **Para:** quien dejó el registro a medias o volvió desde el enlace de `/sign-in`.
- **`/forgot-password`**
  - **Campo:** correo. Responde siempre con el mensaje de recuperación.
  - **Siguiente paso:** lleva a `/reset-password`.
- **`/reset-password`**
  - **Campos:** correo, código, contraseña nueva.
  - **Al terminar:** lleva a `/sign-in` con el aviso "Cambiaste tu contraseña. Ingresá con la nueva."

## Pantallas protegidas (grupo `(dashboard)`)

- **`/select-clinic`**
  - **Contenido:** lista de clínicas disponibles (nombre y tipo de vínculo). Cada opción es un botón de envío.
  - **Sin clínicas disponibles:** redirige a `/no-access`.
  - **Una sola clínica:** no se muestra; se activa sola (FR-019).
- **`/no-access`**
  - **Contenido:** estado vacío. Explica que necesita una invitación de una clínica, y que si ya la tenía puede haber dejado de estar vigente (sin afirmar que nunca tuvo acceso, spec US2 escenario 5). Botón "Cerrar sesión".
  - **Si aparece una clínica disponible:** redirige a `/select-clinic` o al inicio.
- **`/`** (inicio provisional)
  - **Contenido:** nombre de la clínica activa y tipo de vínculo siempre visibles, selector para cambiar de clínica y botón de cierre de sesión. Se reemplaza en las funcionalidades siguientes.
  - **Sin contexto `ready`:** redirige según [access-context.md](access-context.md).

El nombre de la clínica activa y el selector están en el encabezado de todas las pantallas protegidas (FR-020), dentro de un `<Suspense>`.

## Acciones

- **`signUp`**
  - **Entrada:** `fullName`, `email`, `password`.
  - **Resultado:** siempre el mensaje de registro; cambia al paso del código. Solo falla por forma inválida (campo por campo) o por servicio no disponible.
- **`confirmAccount`**
  - **Entrada:** `email`, `code`.
  - **Resultado:** redirige a `/sign-in` con aviso, o error de código.
- **`resendConfirmationCode`**
  - **Entrada:** `email`.
  - **Resultado:** siempre el mensaje de registro.
- **`signIn`**
  - **Entrada:** `email`, `password`, `next` opcional.
  - **Resultado:** crea la sesión, escribe la cookie y redirige:
    - una sola clínica disponible → activa y va a `next` (si es válido) o a `/`;
    - varias → `/select-clinic`;
    - ninguna → `/no-access`.
  - **Error:** el mensaje de credenciales.
- **`signOut`**
  - **Entrada:** ninguna.
  - **Resultado:** revoca la sesión, borra la cookie y redirige a `/sign-in`. Funciona aunque la sesión ya no sea vigente.
- **`requestPasswordReset`**
  - **Entrada:** `email`.
  - **Resultado:** siempre el mensaje de recuperación y paso a `/reset-password`.
- **`resetPassword`**
  - **Entrada:** `email`, `code`, `newPassword`.
  - **Resultado:** cambia la contraseña, invalida las sesiones anteriores (R8) y redirige a `/sign-in` con aviso, o error de código o contraseña.
- **`selectClinic`**
  - **Entrada:** `relationship`, un valor opaco `STAFF:<id>` o `PATIENT:<id>`. No recibe `tenantId`.
  - **Resultado:** comprueba que el vínculo sea de la persona y esté vigente, lo activa y redirige a `/`. Si no, el mensaje de clínica no disponible.

## Redirecciones del `proxy`

`src/proxy.ts` es solo optimista (R6): si la ruta es protegida y no hay cookie, redirige a `/sign-in?next=<ruta>`. Las rutas públicas son las del grupo `(auth)`. No consulta la base de datos. Excluye los recursos estáticos con un `matcher` negativo, como indica la guía.

## Interfaz

- Los formularios usan `useActionState` y muestran el estado de envío.
- Cumplen la constitución VII: tokens semánticos de `memory/design.md`, modo claro y oscuro, móvil, tablet y escritorio, foco visible, navegación por teclado y errores con texto además de color.
- Las contraseñas usan `autocomplete` apropiado (`current-password`, `new-password`) y el código `autocomplete="one-time-code"`.
- Los textos usan mayúscula inicial solo en la primera palabra, según `memory/coding-standards.md`.
