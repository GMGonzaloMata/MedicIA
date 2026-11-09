terraform {
  backend "s3" {
    # Bucket creado por infra/bootstrap. Cada raíz tiene su propia clave de estado.
    bucket = "medicia-tfstate-dev-896618135592"
    key    = "environments/dev/terraform.tfstate"
    region = "sa-east-1"

    # El estado contiene secretos: se cifra siempre.
    encrypt = true

    # Bloqueo nativo de S3 (Terraform 1.10 o posterior). No hace falta una tabla de DynamoDB.
    use_lockfile = true
  }
}
