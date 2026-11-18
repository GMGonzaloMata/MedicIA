# Alineación y verificación PDF/NPZ
Rama integration/pdf-ecg-rebrand, base 5e5d570. Mantener originales y datos; sin commits del agente.
## Specs
S1: «corregir la interpretación clínica y recuperar pruebas confiables para PDF y .npz»; contrato specs/010-pdf-unified-report/contracts/study-and-report-ui.md.
S2: «dejar en verde lint, unitarias y npm run check».
S3: «carga → visor → solicitud explícita → resultado del modelo», «incluido el rechazo de acceso desde otra clínica».
S4: «comprobaría el respaldo de los archivos locales ignorados por Git y retiraría los originales» solo tras verificación y autorización destructiva exacta.
## Tasks
T1 S1: Informe, solicitante y recuperación de selección inaccesible. Worker. Commit: responsable.
T2 S1: Pruebas E2E de carga PDF/NPZ y movimiento reducido. Worker. Commit: responsable.
T3 S2: Resolver lint y fallos unitarios sin debilitar contratos ni usar estado privado. Inline tras T1/T2. Commit: responsable.
T4 S2/S3: Verificación independiente, check y E2E aislados; modelo local sintético, sujeto a disponibilidad/guardas.
T5 S4: Comprobar conservación; no eliminar antes de autorización y respaldo.
## Log
L1: okey hace eso
L2: Acepta la propuesta inmediatamente anterior. Sin datos reales, sin usar la demo ni ejecutar Prisma reservado, no repetir preflight agotado. Verificaciones previas: 48 lint, 73 unitarias fallidas, puerto de pruebas no disponible.
L3: T2 implementation present; Playwright listed 129 cases across 13 files but browser assertions not executed. T2 browser verification deferred to T4. T1 started.
L4: T1 implementada. RED 9 fallos → GREEN 77/77 en 4 archivos. T3 se divide por área: T3a extracción y lint TypeScript asociado; T3b preparación del runtime E022 y lint del launcher, sin caché privada ni ejecución del modelo. El padre revisa el resto y ejecuta el control global.
L5: «asigna otro puerto para solucionar eso». Windows excluye 55433. PostgreSQL 17 dedicado, solo loopback 15433, datos temporales. Verificación TCP: usuario y base medicia_test, 0 tablas al crear. Guard 7/7; puerto anterior rechazado. Guía sin dependencia del checkout hermano. Migración reservada al responsable.
L6: T3 verificado: typecheck y lint exit 0; 1419/1419 unitarias en 94 archivos. T2 navegador, T4 check completo/E2E e inferencia, T5 respaldo siguen pendientes. Sin commit de los cambios posteriores a 5e5d570.
L7: Pausa solicitada: «busca un checkpoint porque necesto apagar la pc». HEAD observado 5e5d570; implementación posterior en disco, sin staging/commit del agente. Next y eslint-config-next 16.4.5, deps y Chromium locales (PLAYWRIGHT_BROWSERS_PATH=0). npm run check pasó (1594/1594 y build). Última corrida completa E2E terminada: 115 pasaron/4 fallaron/10 omitidos. Redirección corregida y verificada 3/3. Se ajustó el setup del selector PDF para confirmar interactividad antes de Enter; job-39 detenido a pedido, sin resultado final. Pendientes E2E, PDF sintético→modelo local y respaldo antes de retirar originales. PostgreSQL de prueba medicia-pdf-ecg-test-15433 usa tmpfs: tras apagar, arrancar contenedor, verificar identidad/puerto 127.0.0.1:15433/medicia_test y esquema, pedir migrate deploy al responsable si faltan migraciones. No usar demo. No reintentar preflight histórico agotado.
L8: Reanudado en c79862e. Base de pruebas 15433 migrada por el responsable. T2 verificado: selector PDF con Enter y foco tras quitarlo en desktop/tablet/mobile; la prueba registra filechooser antes de Tab, sin cambiar producción. E2E final: 119 pasaron, 10 omitidas, 0 fallos (129). T4 parcial: backend sintético previo registró E022 real, no aceptación app+modelo; servidores históricos reader/model detenidos tras apagado. Sin nuevas importaciones, arranques de modelo ni acciones contra volúmenes. Confirmar identidad/procedencia antes de reactivar servicios exactos con autorización, mantener BD de pruebas 15433. T5 pendiente.
L9: Aceptación real desde Next+Chromium desktop, lector 18081 y E022 18080: 1/1 PASS (job-6, 32.9 s), PDF sintético → visor → solicitud explícita → informe parcial persistido al recargar, rechazo desde otra clínica. TEST 15433, identidad y almacenamiento simulados, sin pacientes reales. S3 técnicamente observado, no validación clínica. Último check del árbol ampliado en curso. T5 bloqueante: el lector activo usa bind mount de extractor.py desde el worktree original Trabajo-lucho-pdf-ecg/node_modules/.cache/medicia-pdf-header-fix; conservarlo hasta migrar/verificar esa dependencia y respaldar estado ignorado. No borrar ni retirar worktrees ni volúmenes.
