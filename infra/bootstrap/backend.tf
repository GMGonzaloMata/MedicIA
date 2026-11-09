# Backend remoto del arranque (fase 2). Es idéntico a backend.tf.example.
#
# Este archivo solo puede existir cuando el bucket del estado ya está creado. En una cuenta nueva,
# hay que quitarlo, hacer la fase 1 con estado local y volver a copiar backend.tf.example como
# backend.tf para migrar el estado:
#
#   terraform -chdir=infra/bootstrap init -migrate-state
#
# Ver infra/README.md ("Arranque en dos fases" y "Recreación desde cero") y
# specs/003-infra-base-cognito/research.md (R5).

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
