# Fase 2 del arranque: este archivo se copia a backend.tf DESPUÉS de crear el bucket (fase 1)
# y se migra el estado con:
#
#   terraform -chdir=infra/bootstrap init -migrate-state
#
# Antes de esa copia, el estado del arranque vive en un archivo local ignorado por git,
# porque el bucket que lo va a guardar todavía no existe. Ver specs/003-infra-base-cognito/research.md (R5).
#
# Para recrear todo desde cero, se quita backend.tf y se vuelve a la fase 1 (ver infra/README.md).

terraform {
  backend "s3" {
    bucket = "medicia-tfstate-dev-896618135592"
    key    = "bootstrap/terraform.tfstate"
    region = "sa-east-1"

    # El estado contiene secretos: se cifra siempre.
    encrypt = true

    # Bloqueo nativo de S3 (Terraform 1.10 o posterior). No hace falta una tabla de DynamoDB.
    use_lockfile = true
  }
}
