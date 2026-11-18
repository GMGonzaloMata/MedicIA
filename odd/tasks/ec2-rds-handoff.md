# Desplegar EC2 y RDS privada en AWS

Guía para el responsable de AWS de MedicIA. El objetivo inicial es **crear EC2 y PostgreSQL en RDS, acceder por Session Manager y comprobar la conexión privada a la base**. La aplicación web y los modelos se activan después.

> **Código implementado no significa infraestructura desplegada.** El agente no ejecutó `terraform apply`. No comprobamos qué recursos existen hoy en la cuenta: el responsable debe revisar su inventario y el plan antes de aplicar.

## 1. Qué está listo y qué falta

| Estado | Evidencia o acción pendiente |
| --- | --- |
| Código Terraform implementado | [PR #10 a `main`](https://github.com/GMGonzaloMata/MedicIA/pull/10), correcciones publicadas en `1457e1ea7d0610a39589a5e10de3b5c3d152e0c5`. |
| CI aprobada para ese commit | Check general, pruebas Linux de infraestructura, E2E, comprobaciones estáticas de Terraform y plan de solo lectura: todos aprobados. [CI](https://github.com/GMGonzaloMata/MedicIA/actions/runs/44169684477) · [Infraestructura](https://github.com/GMGonzaloMata/MedicIA/actions/runs/44169684696). No certifican las correcciones posteriores descritas abajo. |
| Correcciones posteriores a la revisión completa | Implementadas y comprobadas localmente; revisión estática independiente favorable. Pendientes de commit/push humanos y de CI sobre el nuevo commit. |
| Integración a `main` | El PR estaba en borrador en la última comprobación. Revisar y aprobar su integración por separado. Crear o integrar el PR no ejecuta `terraform apply` en el workflow de infraestructura. |
| Autorización para desplegar | Pendiente: permisos efectivos, cuenta, inventario, AMI, versión PostgreSQL, presupuesto y revisión humana del plan exacto. Un plan exitoso en CI no demuestra que se haya habilitado la configuración EC2/RDS de esta guía. |
| EC2/RDS operativas | No comprobado: falta aplicación humana del plan aprobado y comprobación real de arranque, SSM, conexión y TLS. |

Las revisiones estáticas anteriores fueron favorables. La ejecución dinámica independiente previa no pudo realizarse por restricciones del entorno; esa limitación no se considera cerrada automáticamente por CI. El responsable debe resolver la aceptación pendiente antes de autorizar el despliegue. El historial técnico está en [el registro de infraestructura](ec2-rds-activation.md); no es un paso para copiar en una terminal.

**Quién hace qué:** el responsable del repositorio ejecuta los commits y decide la integración; un administrador AWS prepara y aprueba los permisos; el responsable del despliegue revisa y aplica el plan. El agente no ejecuta `apply`, cambios de estado ni comandos de Prisma.

### Correcciones posteriores al CI publicado

La revisión completa encontró tres defectos, ya corregidos en la copia local con pruebas de regresión. **Antes de integrar el PR, publicar estas correcciones y comprobar CI sobre el nuevo commit.** No confundir el resultado anterior de `1457e1e` con la validación de este candidato.

1. **Paquete de aplicación:** el [empaquetador](../../infra/scripts/package-demo.sh) ahora admite rutas largas representables por ustar (`prefix` hasta 155 bytes y `name` hasta 100). Conserva los controles de rutas, enlaces, tamaños y checksum. No eliminar dependencias necesarias de Next para fabricar un paquete.
2. **Conexión PostgreSQL:** el [validador runtime](../../infra/modules/demo-host/templates/runtime.sh.tftpl) rechaza claves de consulta `user`, `password`, `host` y `port`, incluidos nombres codificados, antes de publicar la configuración. Se conservan las validaciones de usuario limitado, destino y TLS.
3. **DNS:** el [script de DuckDNS](../../infra/modules/demo-host/templates/dns.sh.tftpl) transmite los argumentos al control interno y los rechaza antes de leer el token o ejecutar red. **No admite `--dry-run` ni otros argumentos**; una invocación válida sin argumentos sí actualiza DNS.

Evidencia local: RED observado para cada regla; 201 pruebas aprobadas, dos pruebas exclusivas de Linux omitidas en Windows y lint sin errores. El padre repitió runtime/empaquetado: 164 aprobadas y las mismas dos omisiones. La revisión estática independiente no encontró bloqueos introducidos; su ejecución dinámica sigue no disponible. Esto no prueba todavía arranque real de Next, comportamiento POSIX, conexión DB/TLS ni aceptación AWS.

Además queda por validar la interacción de etiquetas de la interfaz de red con los permisos efectivos de creación EC2: es una incertidumbre, **no un `AccessDenied` confirmado**. No probarla ampliando permisos ni aplicando recursos a ciegas. La secuencia siguiente requiere resolver las aprobaciones de despliegue; no es autorización para saltarlas.

## 2. Preparar herramientas, acceso y presupuesto

Antes de planificar, confirmar:

- Checkout del **commit aprobado** de este PR; después de integrarlo, usar `main` actualizado. No mezclar cambios locales ajenos ni desplegar desde una copia incompleta.
- Terraform **1.15.1**, proveedor AWS **6.72.0** y archivos `.terraform.lock.hcl` versionados. Son las versiones usadas por este trabajo; no ejecutar `init -upgrade` ni actualizar dependencias como parte del despliegue.
- Credenciales temporales/perfil AWS autorizado en la terminal del responsable, sin copiarlas al repositorio ni al chat. La configuración existente fija **cuenta `896618135592` y región `sa-east-1`**; el administrador debe confirmar que ese es el destino correcto. Una restricción en el código no acredita la identidad de las credenciales utilizadas.
- Acceso al backend S3 **existente**, cifrado y con bloqueo. No cambiar el backend, migrar el estado ni usar un estado local nuevo para eludir errores.
- Administrador: revisar e instalar por el procedimiento existente los permisos y el límite de permisos necesarios. El rol de CI que puede hacer `plan` no demuestra que el responsable pueda crear recursos. **Ante `AccessDenied`, detenerse y revisar la autorización; no ampliar permisos a ciegas.** Ver [acceso y presupuesto](../../infra/README.md).
- Inventario de recursos que ya existen y a quién pertenecen. Conservar los valores actuales del entorno `dev`, Cognito, almacenamiento y catálogo de modelos.
- Presupuesto aprobado con precios vigentes de `sa-east-1`, duración, responsable y fecha/procedimiento de cierre. Incluir EC2, EBS, IPv4 pública/EIP, RDS, almacenamiento/backups, secretos, logs y transferencia según el uso. Esta guía **no contiene una cotización aprobada**.

Recursos previstos: EC2 AL2023 x86_64 `t3.small`, EBS cifrado de 20 GiB y EIP; RDS PostgreSQL 17.x `db.t4g.micro`, Single-AZ y 20 GiB; red dedicada sin NAT Gateway ni ALB. El plan completo, no esta lista resumida, determina los cambios reales y sus costos.

## 3. Elegir infraestructura sin aplicación

Para este primer despliegue usar explícitamente:

```hcl
enabled           = true
app_enabled       = false
accept_acme_terms = false
```

Estos campos pertenecen al objeto `demo` del ejemplo siguiente.

| Configuración | Resultado esperado |
| --- | --- |
| `demo.enabled=false` | No se crean los módulos demo. Es el valor por defecto; no usarlo como procedimiento para borrar una base existente. |
| `demo.enabled=true`, `app_enabled=false` | Se crean los recursos y se preparan paquetes, Node, certificados CA y demás prerrequisitos; el bootstrap habilita/inicia SSM y termina antes de configurar la aplicación/proxy/DNS/ACME. |
| `demo.enabled=true`, `app_enabled=true` **o campo omitido** | Se solicita el modo con aplicación: exige hostname, paquete y checksum reales e intenta activar el runtime. No usarlo para este primer paso. |

**No hace falta esperar a los modelos ni a la aceptación completa del flujo PDF para preparar infraestructura.** Sí hacen falta las dependencias existentes, los permisos y las entradas reales. `app_enabled=false` no elimina los efectos de instalar paquetes ni garantiza que SSM ya funcione; eso se comprueba después del arranque.

## 4. Preparar las entradas privadas

Conservar el archivo privado de valores base de `dev`. Crear **otro archivo privado**, fuera de Git, para la configuración demo; no reemplazar el archivo base con este ejemplo.

Cada `<...>` es un marcador que el responsable debe sustituir por un valor real aprobado. No ejecutar comandos mientras queden marcadores.

```hcl
demo = {
  enabled                   = true
  app_enabled               = false
  ami_id                    = "<ID_AMI_OFICIAL_REGIONAL_APROBADO>"
  ami_evidence              = "<REFERENCIA_VERIFICABLE_DE_EDITOR_ID_REGION_ARQUITECTURA_Y_RELEASE>"
  engine_version            = "<VERSION_MENOR_POSTGRESQL_17_APROBADA>"
  final_snapshot_identifier = "<SNAPSHOT_UNICO_CON_PREFIJO_medicia-dev-demo>"
  accept_acme_terms         = false
}
```

Comprobar cada entrada:

- **AMI:** oficial AWS Amazon Linux 2023, x86_64, disponible en `sa-east-1`, con ID fijo y evidencia verificable del editor/origen. El bootstrap exige `system-release` y repos **`2023.12.20261021`**. No alcanza con elegir cualquier AMI denominada AL2023 ni con escribir un texto que pase la validación. No usar `latest`, una AMI personalizada o instalaciones manuales para sortear el control.
- **PostgreSQL:** versión menor concreta `17.x` disponible para la configuración RDS elegida y aprobada por el responsable; no inventar disponibilidad.
- **Snapshot final:** identificador único que empiece por `medicia-dev-demo`, hasta 255 caracteres, sin `--` ni guion final. No reutilizar un identificador ya ocupado.
- **Aplicación:** omitir `public_hostname`, `release_key` y `release_sha256` en este modo. Si se completan, sus validaciones siguen vigentes. No inventar un dominio ni un paquete para pasar el plan.

Las referencias de secretos y dependencias existentes deben ser válidas. Terraform no debe recibir valores secretos de la aplicación. Mantener privados tanto los archivos de variables como los planes guardados.

## 5. Generar y revisar el plan — responsable AWS

Desde la raíz del repositorio y con el perfil autorizado activo. Los comandos se ejecutan **uno por uno**, deteniéndose ante cualquier error. Las rutas son ejemplos: reemplazarlas por rutas privadas reales. En PowerShell pueden usarse rutas como `C:/ruta-privada/base-dev.tfvars` dentro de las mismas comillas.

```sh
terraform version
terraform -chdir=infra/environments/dev init
terraform -chdir=infra/environments/dev validate
terraform -chdir=infra/environments/dev plan -var-file='/ruta/privada/base-dev.tfvars' -var-file='/ruta/privada/demo.tfvars' -out='/ruta/privada/demo.tfplan'
```

**No aplicar todavía.** Revisar todo el plan generado, incluida cualquier modificación de recursos anteriores. El archivo puede contener información sensible: no subirlo a Git, al chat ni a artefactos públicos.

Lista de aprobación:

- [ ] Cuenta, región, backend, commit y ambos archivos privados son los correctos.
- [ ] El plan incluye realmente EC2/RDS demo; no es un plan exitoso con `demo.enabled=false`.
- [ ] No cambia ni destruye recursos ajenos, Cognito, buckets de estudios/modelos, usuarios/claves o backend.
- [ ] Cada creación, modificación, reemplazo y eliminación está entendida y aprobada.
- [ ] Se mantienen cifrado, backups, protecciones de borrado y snapshot final de RDS.
- [ ] Costos, cuotas, AMI, motor PostgreSQL y permisos efectivos están aprobados.
- [ ] Una segunda persona revisó **ese plan exacto** y autorizó su aplicación.

No usar `-target`, desactivar el bloqueo ni cambiar de backend para conseguir un plan aparentemente más simple. Si cambian el código o las entradas, generar y revisar un plan nuevo.

## 6. Aplicar únicamente el plan aprobado — responsable AWS

**Solo después de completar la lista anterior**, el responsable ejecuta:

```sh
terraform -chdir=infra/environments/dev apply '/ruta/privada/demo.tfplan'
```

Pasar un plan guardado ejecuta sus acciones sin pedir una segunda confirmación interactiva: la aprobación humana debe existir **antes** de ese comando. No copiarlo como parte de un bloque automático de preparación.

Si falla, conservar la salida de forma privada, determinar qué recursos se crearon y revisar el siguiente plan. No repetir `apply` a ciegas, borrar recursos, modificar el estado ni quitar protecciones para continuar.

Un `apply` exitoso tampoco demuestra que el sistema operativo, SSM o PostgreSQL estén operativos. Completar la siguiente sección.

## 7. Comprobar EC2 y acceder a RDS sin hacerla pública

### 7.1 Identificar recursos y comprobar SSM

El responsable puede consultar el output específico:

```sh
terraform -chdir=infra/environments/dev output demo
```

Conservar los identificadores de instancia, EIP y base, hostname/puerto de RDS y referencias de secretos. Este output no entrega valores secretos. `public_hostname`, `public_url` y `release_key` deben ser `null` en modo infraestructura: **es esperado, no una falla**.

En la consola AWS, en `sa-east-1`:

1. Confirmar EC2 en ejecución y sus comprobaciones de estado satisfactorias; comprobar la EIP y las rutas previstas.
2. Abrir **Systems Manager → Session Manager → Start session** y seleccionar la instancia. También se puede usar **EC2 → instancia → Connect → Session Manager**.
3. Si la instancia no aparece o la sesión falla, detenerse: revisar permisos, conectividad, instalación/estado del agente SSM y logs de inicialización. No abrir SSH ni instalar paquetes a mano para ocultar un fallo del bootstrap.
4. Confirmar que terminó la preparación de prerrequisitos. En este modo no deben esperarse las unidades web ni una URL pública funcionando.

### 7.2 Abrir un túnel privado a PostgreSQL

RDS debe estar disponible, con `publicly_accessible=false`; el puerto 5432 acepta solo el grupo de seguridad de la aplicación. **No abrir 22, 3000 ni 5432 a Internet**, ni temporalmente.

Para conectarse desde la computadora del responsable mediante EC2, hacen falta AWS CLI, el complemento local de Session Manager, SSM Agent compatible con túneles a hosts remotos y autorización sobre la instancia/documento de sesión. Esto **no presupone** que el perfil actual ya tenga dichos permisos.

Ejemplo de una sola línea para PowerShell, adaptado de la documentación oficial de AWS; reemplazar todos los marcadores y mantener la terminal abierta:

```powershell
aws ssm start-session --profile "<PERFIL_AWS_AUTORIZADO>" --region sa-east-1 --target "<INSTANCE_ID>" --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters "host=<HOSTNAME_RDS_REAL>,portNumber=5432,localPortNumber=15432"
```

Este comando abre una sesión/túnel; no crea la base ni usuarios. EC2 debe poder resolver y alcanzar el hostname privado de RDS. El puerto local 15432 debe estar libre. Ante una denegación, solicitar revisión al administrador; no ampliar políticas ni cambiar grupos de seguridad por cuenta propia.

Configurar el cliente PostgreSQL autorizado para usar el túnel **sin perder la validación del certificado contra el hostname real de RDS**. Exigir `sslmode=verify-full` y el bundle CA de RDS confiable. Apuntar simplemente a `localhost` puede provocar un error de nombre de certificado: no resolverlo desactivando TLS o la verificación. El administrador debe configurar correctamente el destino de red del túnel y el nombre TLS en el cliente elegido.

Las credenciales se obtienen por el canal privado autorizado de Secrets Manager, nunca por outputs públicos, Git o chat. El responsable privilegiado prepara un usuario PostgreSQL limitado para la aplicación; **no usar el usuario maestro como usuario de la app**. Las referencias de secretos de aplicación no implican que ya se hayan cargado sus valores. Las migraciones y la preparación de usuarios quedan a cargo del responsable, no del bootstrap.

### 7.3 Criterios para dar por preparada la infraestructura

- [ ] Sesión SSM real sobre la EC2 correcta y prerrequisitos completos.
- [ ] Conexión privada real a PostgreSQL con usuario autorizado.
- [ ] TLS valida CA y hostname; comprobaciones negativas controladas rechazan CA o hostname incorrectos, sin desactivar la seguridad del servicio.
- [ ] RDS no pública; cifrado, backup de 7 días y protecciones de borrado conservados.
- [ ] Identificadores, evidencias de aceptación y costo/responsables registrados en el lugar privado del equipo.

No usar datos reales de pacientes para estas comprobaciones. Si falta alguno de estos resultados, informar qué falló: no declarar infraestructura operativa solo por tener CI o `apply` en verde.

## 8. Activar la aplicación más adelante

Es un paso separado. Preparar el paquete real Linux x64/Node 24, checksum, hostname DuckDNS, configuración y permisos de Cognito/S3/inferencia, secretos por canal privado, usuario DB limitado y migraciones humanas. Ver [quickstart](../../specs/009-ec2-rds-test/quickstart.md) y [procedimiento de activación](../../specs/009-ec2-rds-test/contracts/deployment.md).

Para el runtime, `DATABASE_URL` debe contener el hostname real de RDS y **exactamente un** `sslmode=verify-full` y un `sslrootcert=/etc/pki/rds/global-bundle.pem`. La aceptación de HTTPS/ACME requiere dominio válido, consentimiento explícito y contacto; no simular un modelo disponible para completar el arranque.

**Activar no es una operación en sitio.** Se mantiene `user_data_replace_on_change=true`: cambiar `app_enabled`, release o hostname, o adoptar la configuración nueva incluso con el valor por defecto, puede reemplazar EC2, interrumpir SSM/web y perder estado local/certificados. Revisar otro plan completo, prever el arranque y la reasociación de la EIP. RDS mantiene sus protecciones, pero el plan real sigue siendo obligatorio.

`app_enabled=false` no es un botón de apagado ni un rollback sin interrupción. Volver atrás en Git no revierte AWS ni la base. No borrar datos, manipular el estado ni quitar protecciones como recuperación. La recuperación runtime/DNS/ACME del procedimiento enlazado solo corresponde después de activar la aplicación, no al host de infraestructura sin esas unidades.

## Referencias

- [Entradas del entorno](../../infra/environments/dev/variables.tf), [outputs](../../infra/environments/dev/outputs.tf), [acceso y costos](../../infra/README.md).
- [Especificación y aceptación pendiente](../../specs/009-ec2-rds-test/tasks.md), [dependencias para la demo completa](../../specs/009-ec2-rds-test/contracts/inference-readiness.md).
- [AWS: iniciar sesiones y túneles a hosts remotos](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html#sessions-remote-port-forwarding). AWS exige SSM Agent 3.1.1374.0 o posterior para esa modalidad y el complemento Session Manager en el cliente. La sintaxis documentada no demuestra que los permisos de esta cuenta estén aprobados.

**Separación final:** revisar/integrar el PR → aprobar entradas, permisos y costos → revisar el plan privado → aplicar por el responsable → comprobar EC2/SSM/RDS → activar la app en otro paso.
