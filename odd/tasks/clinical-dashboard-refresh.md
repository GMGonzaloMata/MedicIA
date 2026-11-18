# Rediseño clínico de Inicio y sidebar
Rama integration/pdf-ecg-rebrand. Implementación visual en la app en 3110, no maqueta; sin cambios de permisos ni de datos.
## Specs
S1: «redisño de la sidebar y el dashboard» y «utiliza la skill que te pase» (UI Taste de Uizze).
S2: «hacelo con la tipografia con la que veniamos trbaajando» (Literata local).
S3: «ahora tiene un estilo muy neon que no me gusta, es decir , no parece una pagina de un centro medico».
S4: «la seccion de inicio tiene que ser un dashboard informativo no una seccion para ir a mis pacientes»; «debe ser un dashboard con informacion para el medico».
## Tasks
T1 S1–S3: Implementar sidebar e Inicio con identidad editorial clínica. Worker; sin commit.
T2 S1–S3: Verificar UI real y navegación sin modificar la cuenta abierta; capturas escritorio/móvil. Parent; sin commit.
T3 S4: Especificar e implementar resumen real del médico (totales de pacientes asignados y sus estudios, últimos estudios por fecha). Solo clínica y asignaciones activas; sin migraciones; conservar sidebar y los otros roles.
T4 S4: Verificar aislamiento, exactitud, estados vacíos y presentación. No truncar medicia_test usada por el usuario en 3110.
## Log
L1: bien ahora empecemos por el redisño de la sidebar y el dashboard utiliza la skill que te pase y hacelo con la tipografia con la que veniamos trbaajando, fijate que ahora tiene un estilo muy neon que no me gusta, es decir , no parece una pagina de un centro medico
L2: T1 y T2 verificados en la app local. 38/38 pruebas focalizadas; lint focal y tsc aprobados. Chromium: 1440 y 375 px, ambos temas, título con Literata y sin overflow, Inicio activo, navegación real a Mis pacientes. Capturas en node_modules/.cache/ui-preview/clinical-*.png. No se corrieron check/E2E completos en la base que está usando la demo interactiva; sin commit.
L3: me gusta pero la seccion de inicio tiene que ser un dashboard informativo no una seccion para ir a mis pacientes, asi que mejora eso, debe ser un dashboard con informacion para el medico
L4: S4 implementado con conteos y cinco estudios recientes. 25 unitarias, tipos y lint focalizados aprobados. Navegador contra app viva, datos sintéticos separados: 3/3 (desktop/tablet/mobile), 0/0 → 1/0 → 1/1, enlace al visor, sin vaciar la demo. Revisión independiente en curso; no ejecutar resetDatabase sobre la base de la sesión interactiva.
L5: T3/T4: revisión independiente sin fuga observada; PostgreSQL aislado 2/2 (alcance, revocación, límite y orden), build aprobado, Playwright 122 aprobadas/10 omitidas. TypeScript y lint aprobados. El check de Linux no quedó verde (85 fallos); se actualizó una expectativa de Inicio y ambas suites afectadas pasaron 104/104 en Windows. No hay nueva medición completa de cobertura. Commit reservado al responsable.
