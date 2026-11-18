# Quickstart: validación por unidad y evidencia del corte A

El plan no demuestra funcionamiento. Solo T001–T003 tienen evidencia de implementación pura abajo; los comandos de secciones posteriores siguen propuestos **para cuando existan sus pruebas y el padre autorice superficies y ejecución**. No hay prueba de carga PDF ni inferencia real.

## 1. Primera unidad segura: publicación del informe

T001–T003 ejecutados bajo autorización del padre: dominio en `src/modules/analyses/domain/unified-report.ts` y pruebas en `tests/unit/modules/analyses/domain/unified-report.test.ts`. Sin DB, Next, archivos clínicos, servicios ni parámetros científicos. API y forma privada/publicada en [data-model.md](data-model.md#valor-de-dominio-implementado-en-t003).

### Runner aislado aprobado

Este worktree no tiene dependencias instaladas. Se utilizó el CLI existente del worktree infra en modo solo lectura, sin instalar/copiar/enlazar node_modules. Configuraciones plain-object, sin imports, bajo `node_modules/.cache/medicia-pdf-domain/`: root explícito del worktree PDF, `envDir: false`, Node, un worker y watch desactivado. Alias explícitos de Vitest/Zod a las dependencias existentes y `@` al src local; loader nativo sin bundle de configuración. El config focal incluye solo la prueba nueva; el de preservación incluye exactamente esa prueba, `findings.test.ts` y `analysis-errors.test.ts`. Cache/informes dentro de la superficie ignorada autorizada.

No se cargó `vitest.config.mts`, configuración de app ni archivos env; no usar aquí el npm test por defecto. NODE_OPTIONS se elimina solo del proceso del runner. Comandos ejecutados en primer plano, con límite de 30 s por llamada:

```bash
env -u NODE_OPTIONS node 'C:/Users/lucho/orca/workspaces/MedicIA/Trabajo-lucho/node_modules/vitest/vitest.mjs' run --config node_modules/.cache/medicia-pdf-domain/vitest.config.mjs --configLoader native
env -u NODE_OPTIONS node 'C:/Users/lucho/orca/workspaces/MedicIA/Trabajo-lucho/node_modules/vitest/vitest.mjs' run --config node_modules/.cache/medicia-pdf-domain/vitest.preserve.config.mjs --configLoader native
env -u NODE_OPTIONS node 'C:/Users/lucho/orca/workspaces/MedicIA/Trabajo-lucho/node_modules/typescript/bin/tsc' --project node_modules/.cache/medicia-pdf-domain/tsconfig.focused.json
```

Cada ejecución guardó stdout, stderr y código de salida en la cache autorizada. TypeScript usa strict/noEmit, archivos explícitos, sin incremental ni plugins/config de Next. El runner de preservación habilita V8 existente, solo para `unified-report.ts`, con umbral mínimo de 80 % de líneas por archivo; no modifica dependencias.

### Evidencia observada y vínculo al candidato

| Ejecución | Exit | Resultado | Tiempo del runner | Prefijo de logs |
|-----------|------|-----------|-------------------|-----------------|
| RED inicial | 1 | Módulo nuevo ausente; 1 suite fallida, 0 tests recolectados, no fallas de aserción ejecutadas. | 1,04 s | `red` |
| GREEN inicial | 0 | 103 PASS / 1 archivo. | 761 ms | `green` |
| Tipos iniciales | 0 | stdout/stderr vacíos. | No registrado | `types` |
| Reanudación, hashes del checkpoint idénticos | 1 | 114 PASS, 1 FAIL: aceptaba clave omitida `echonext: undefined`. Doce casos nuevos aún no habían corrido al apagar. | 477 ms | `resume` |
| GREEN final tras una corrección de presencia de claves | 0 | 115 PASS / 1 archivo. | 352 ms | `final-focused` |
| PRESERVE + cobertura | 0 | 126 PASS / 3 archivos: 115 nuevos y 11 legacy. Líneas 100 % (65/65), funciones 100 % (9/9), ramas 98,11 % (52/53), sentencias 98,63 % (72/73). | 873 ms | `preserve` |
| Tipos finales | 0 | stdout/stderr vacíos; candidato final. | No registrado | `final-types` |

Logs: `node_modules/.cache/medicia-pdf-domain/<prefijo>.{stdout.log,stderr.log,exit.txt}`. Fallas previas preservadas; sin timeout, reintento automático ni proceso activo. Cobertura: `coverage/coverage-summary.json`. Una corrección usada, sin reiniciar presupuesto tras el apagado.

SHA-256 finales en `final-source.sha256`:

- Dominio: `c0efda88be39cb82e09a741a469b9d2f550b1818b33ec2086883d5fd72d53d95`.
- Test: `2fdf251a87478a347fc6023809e78da9010c44db09a21fb5eb6f00535c52f7f5`.

Cubierto: snapshot inmutable, omisión sin ejecución/error, E022 pendiente/éxito/fallo, rechazo vacío, los 16 pares de estados, cero/uno/dos éxitos, ninguna contribución durante WAITING/NONE, fechas/procedencias y asociación al pedido, contrato completo 12+1 sin fusión, límites [0,1] y rechazo íntegro de respuestas desconocidas/extra/inválidas sin mutar la entrada. El orden/valores y compuesto legacy se conservan. Las contribuciones tienen estructura equivalente; la jerarquía visual S9 requiere la futura UI.

No se cambió código compartido: el diferencial base/cambio no aplica en este corte. No se ejecutaron npmcheck, integración, E2E, navegador o modelos; siguen siendo gates de sus unidades. El dominio no implementa autorización, CAS, vencimientos ni persistencia. El padre conserva revisión/disposición y cierre ODD. Siguiente tarea recomendada: T004, resolver M1 de muestras no observadas antes de implementar el codec T005.

## 2. Contratos y carga sin servicios reales

Tras sus tareas, ejecutar de a un comando en primer plano:

```text
npm run test:unit -- tests/unit/modules/studies/domain/pdf-study-format.test.ts
npm run test:unit -- tests/unit/modules/studies/application/upload-pdf-study.test.ts
npm run test:unit -- tests/unit/modules/analyses/application/request-integrated-analysis.test.ts
```

Fakes explícitos, bytes sintéticos y reloj controlado; ningún endpoint real. Observar mensajes/códigos y efectos: rechazo no cambia listas, contadores, objetos o invocaciones; acceso denegado ocurre antes de leer bytes. Probar límites exactos de tamaño, versiones, esquema y máscara según contratos; mantener la ruta NPZ anterior.

## 3. Persistencia e interfaz

Antes de integración, el responsable debe disponer de una **DB de prueba aislada** y aprobar schema/SQL. Solo él ejecuta `npx prisma migrate deploy` y `npx prisma generate` contra ese entorno; no ejecutar desde esta tarea. Las pruebas integration existentes tienen preparación de DB y no son seguras por el solo nombre del comando.

Tras autorización explícita y fixtures preparados:

```text
npm run test:integration -- tests/integration/analyses/integrated-analysis.test.ts
npm run test:integration -- tests/integration/study-storage/pdf-study-access.test.ts
npm run check
npm run test:e2e -- tests/e2e/pdf-unified-report.spec.ts
```

Resultados exigidos: acceso cruzado rechazado en carga, onda, original, análisis y eliminación; concurrencia real crea una fila; ambas respuestas concurrentes se conservan; vencimiento no elimina éxitos ni admite escritura tardía; original privado y limpieza completa; historial NPZ/ecg1 intacto. UI a 375/768/1280, claro/oscuro, teclado/foco, sin resultados del pedido mientras WAITING ni exposición en DTOs. E2E usa servicios simulados explícitos, no prueba científica.

Antes de integración de código, check completo y E2E deben pasar y la lógica nueva/modificada alcanzar 80 % por archivo. Registrar salidas y fallas exactas; no convertir una falla de entorno no observada en fallo conocido de base. Revisión independiente de riesgos coordinada por el padre en cortes B/C y D/E.

## 4. Comprobación diferencial de contratos compartidos

Cuando se cambie helper/parser/DTO compartido, usar **un solo script temporal no comprometido**, autorizado por el padre, contra base anterior y cambio con las mismas entradas sintéticas. Comparar código de salida, stdout/stderr y respuesta pública serializada de: carga NPZ, lectura ecg1/visor, inferencia legacy, historial/selección y rechazo de pedidos simultáneos/eliminación. Aplicar también el nuevo formato/capacidad a caminos legacy para detectar cambios no pedidos. Cualquier diferencia no autorizada se corrige y se fija mediante test normal; ningún test comprometido lee git o un commit fijo.

Scratch fuera del worktree, sin copiar secretos, datos o dependencias. El script de prueba elimina su propio scratch al terminar; no crearlo ni ejecutarlo en T1. El padre aprueba script/runner y baseline antes del corte que toque código compartido.

## 5. Recorrido local real condicionado

G1/G3/G4 cerrados permiten prueba autorizada de extracción + E022 con EchoNext explícitamente no disponible: solo la ejecución E022, publicación PARTIAL al terminar válida y omisión Mini NOT_AVAILABLE sin ejecución, error o espera. G2 adicional permite evaluar EchoNext contra la preparación de referencia y, si ambas ejecuciones son válidas, COMPLETE. Registrar referencias, resultados agregados y limitaciones, nunca datos clínicos individuales.

No se dan comandos para instalar dependencias, cargar joblib/pickle, iniciar Docker/servidores, acceder a AWS o ejecutar código externo: requieren otra autorización concreta. No usar pacientes reales. No declarar resuelto G2 por encontrar un README, un hash o una transformación E022 con otra entrada. S5 conserva la secuencia del responsable y su compañero; ningún test autoriza merge, despliegue o publicación.
