# Desplegar la app en la EC2 de la demo

Guía práctica para el responsable. Complementa `specs/009-ec2-rds-test/quickstart.md` y `contracts/deployment.md`
(que mandan si hay una diferencia). Los comandos de Terraform y de base de datos los ejecuta solo el responsable.

**Qué cambia respecto de hoy:** la EC2 actual se creó con `app_enabled=false` (solo SSM, puente a la base). Pasar a
`app_enabled=true` **reemplaza la instancia** por otra con Node, nginx y los servicios de la app. RDS, secretos y la IP
elástica se conservan. El ID de la instancia cambia: hay que actualizar el comando del túnel SSM.

## 1. Construir el paquete (Docker, desde Windows)

En la raíz del repo, con Docker Desktop abierto (PowerShell):

```powershell
New-Item -ItemType Directory -Force release-out | Out-Null
docker run --rm --platform linux/amd64 -v "${PWD}:/src:ro" -v "${PWD}/release-out:/out" node:24-bookworm `
  bash /src/infra/scripts/build-demo-release.sh demo-v1
```

Genera `release-out/demo-v1.tar.gz` y `demo-v1.tar.gz.sha256`, y prueba que `next start` arranque. Anotá el SHA-256 que
imprime al final: va en `release_sha256`. `release-out/` no se sube a git. Cada versión nueva lleva un nombre nuevo
(`demo-v2`, …): el host no acepta `latest`.

## 2. Subir el paquete al bucket de releases

```powershell
aws s3 cp release-out/demo-v1.tar.gz s3://medicia-releases-dev-896618135592/releases/demo-v1.tar.gz --region sa-east-1
```

Con una identidad que pueda escribir en `releases/*` (el operador de Terraform puede). `release_key` queda
`releases/demo-v1.tar.gz`.

## 3. Usuario de base limitado para la app

El host rechaza `postgres` y `medicia_admin`. Conectado a la base `medicia` por el túnel con `medicia_admin`:

```sql
CREATE ROLE medicia_app LOGIN PASSWORD '<contraseña-larga-sin-comillas>';
GRANT CONNECT ON DATABASE medicia TO medicia_app;
GRANT USAGE ON SCHEMA public TO medicia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO medicia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medicia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE medicia_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO medicia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE medicia_admin IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO medicia_app;
```

Las migraciones siguen corriéndose con `medicia_admin` (`prisma migrate deploy` por el túnel), nunca desde la EC2.

## 4. Cargar los secretos (a mano, fuera del chat y de Terraform)

Los dos secretos ya existen como metadatos (`medicia-dev-demo/app` y `medicia-dev-demo/duckdns`); falta su valor.
Armá los JSON en un archivo temporal fuera del repo y borralos al terminar.

`app.json` (la contraseña va codificada como URL; el host es el endpoint de RDS, sin cambios; el puerto 5432):

```json
{
  "DATABASE_URL": "postgresql://medicia_app:<contraseña-codificada>@<endpoint-rds>:5432/medicia?sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem",
  "COGNITO_CLIENT_SECRET": "<client secret de Cognito>",
  "SMTP_HOST": "<host>",
  "SMTP_PORT": "587",
  "SMTP_USER": "<usuario>",
  "SMTP_PASSWORD": "<contraseña>",
  "INVITATION_FROM_ADDRESS": "MedicIA <no-reply@tu-dominio>"
}
```

`duckdns.json`: `{ "token": "<token de duckdns.org>" }`.

```powershell
aws secretsmanager put-secret-value --secret-id medicia-dev-demo/app --secret-string file://app.json --region sa-east-1
aws secretsmanager put-secret-value --secret-id medicia-dev-demo/duckdns --secret-string file://duckdns.json --region sa-east-1
```

(Requiere una identidad con `PutSecretValue`: el operador de Terraform no la tiene.) Los valores salen de tu
`.env.local`; el cliente secreto de Cognito lo da `terraform output`.

## 5. DuckDNS

Registrá un subdominio en duckdns.org (por ejemplo `medicia-demo.duckdns.org`). El host actualiza solo el registro hacia
la IP elástica. Es el nombre de `public_hostname`.

## 6. tfvars privado (fuera del repo)

Además de todos los valores de tu `base-dev.tfvars`, el bloque `demo` pasa a modo activo:

```hcl
demo = {
  enabled                   = true
  app_enabled               = true
  ami_id                    = "<la misma AMI de hoy>"
  ami_evidence              = "<la misma evidencia de hoy>"
  engine_version            = "<la misma versión de hoy>"
  final_snapshot_identifier = "<el mismo snapshot de hoy>"
  public_hostname           = "medicia-demo.duckdns.org"
  release_key               = "releases/demo-v1.tar.gz"
  release_sha256            = "<sha256 del paso 1>"
  accept_acme_terms         = true
}
demo_acme_contact_email = "<tu correo, para avisos de Let's Encrypt>"
```

`accept_acme_terms = true` acepta los términos de Let's Encrypt a nombre tuyo. Conservá exactamente los demás valores
del bloque (si cambia la AMI o el snapshot, el plan propone reemplazar más cosas).

## 7. Plan y apply (responsable)

```powershell
terraform -chdir=infra/environments/dev init
terraform -chdir=infra/environments/dev validate
terraform -chdir=infra/environments/dev plan -var-file='<base-dev.tfvars>' -var-file='<demo.tfvars>' -out='<demo.tfplan>'
```

Revisá el plan completo. **Esperado:** reemplazo de `aws_instance` del host y cambios en la asociación de la IP elástica.
**Rechazalo** si borra o reemplaza RDS, Cognito, buckets o la base. Recién entonces `terraform ... apply '<demo.tfplan>'`.

## 8. Después del apply

1. Esperá unos minutos a que arranque. Si el primer arranque falló por la carrera de la IP elástica, la secuencia de
   recuperación (paso por paso, deteniéndote ante un error) está en `specs/009-ec2-rds-test/contracts/deployment.md`,
   sección «Gate EIP».
2. Con el ID de instancia nuevo (`terraform output`), conectate por SSM y revisá `systemctl status medicia.service`.
3. Abrí `https://medicia-demo.duckdns.org`: certificado válido, login, subida de un estudio, invitación por correo.

## Pendientes conocidos

- **Análisis con IA:** el punto de inferencia de SageMaker nace apagado (`models.echonext-mini.enabled = false`). Sin él,
  el análisis falla. Encenderlo cuesta unos 0,089 USD por hora.
- **Datos de ejemplo:** la base de la demo no trae clínicas ni usuarios; creá la tuya como siempre.
- **Cognito:** los correos de verificación los manda Cognito (límite diario del remitente por defecto).
- **Actualizar la app:** nuevo paquete (`demo-v2`) y cambiar `release_key`/`release_sha256`. Puede reemplazar la EC2.
- No hay SSH: todo se hace por SSM.
