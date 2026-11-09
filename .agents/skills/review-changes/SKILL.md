---
name: review-changes
description: Revisar los cambios de MedicIA con los subagentes de arquitectura, seguridad, interfaz e infraestructura que correspondan. Usar al terminar una implementación, cuando se invoque esta skill o cuando se pida revisar los cambios contra las reglas del proyecto. No reemplaza una auditoría de seguridad completa.
---

# Revisar cambios

## 1. Delimitar el cambio

Listá los archivos con `git diff --name-only HEAD` y `git ls-files --others --exclude-standard`. Si no hay ninguno, usá `git diff --name-only origin/main...HEAD`. Si tampoco hay cambios, informalo y terminá.

## 2. Elegir los revisores

Usá solo los que correspondan según los archivos:

- **Arquitectura:** cualquier `.ts` o `.tsx` en `src/`, o cambios en `prisma/`.
- **Seguridad:** `src/modules/`, `src/infrastructure/`, `src/app/api/`, archivos `route.ts`, Server Actions, `prisma/`, o cualquier cambio de autenticación, carga de archivos, logs o variables de entorno. Si hay dudas, incluilo.
- **Interfaz:** `.tsx` o `.css` en `src/app/` o `src/components/`.
- **Infraestructura:** cualquier archivo en `infra/` o con extensión `.tf`, `.tfvars` o `.tftest.hcl`, y los cambios de CI que ejecuten Terraform. Si el cambio toca permisos, secretos o el estado, incluí también al revisor de seguridad.

Si solo cambiaron pruebas, documentación o configuración de herramientas, indicá que no corresponde ningún revisor y terminá.

## 3. Ejecutarlos

Lanzá los revisores elegidos en paralelo, con estos nombres:

- **Arquitectura:** `architecture-reviewer` en Claude Code y `architecture_reviewer` en Codex.
- **Seguridad:** `security-reviewer` en Claude Code y `security_reviewer` en Codex.
- **Interfaz:** `interface-reviewer` en Claude Code y `interface_reviewer` en Codex.
- **Infraestructura:** `infra-reviewer` en Claude Code y `infra_reviewer` en Codex.

Pasales solo la lista de archivos y la referencia de git. No les pases tus conclusiones ni tu opinión sobre el cambio, para que su mirada sea independiente.

## 4. Consolidar

Uní las respuestas ordenadas por severidad y eliminá los duplicados. Comprobá cada hallazgo bloqueante en el código antes de informarlo. No agregues hallazgos propios como si fueran de un revisor.

## 5. Actuar

- **Si esta skill se usa dentro de `speckit-implement` o `simple-task`:** corregí los hallazgos bloqueantes que estén dentro del alcance, ejecutá `npm run check` y repetí una sola vez el revisor afectado. Informá lo que quede pendiente.
- **Si se invocó directamente:** informá los hallazgos sin corregir nada, salvo que se pida.

Si un revisor no se puede ejecutar, indicalo. No lo cuentes como una revisión sin hallazgos.
