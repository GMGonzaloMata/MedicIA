module "identity" {
  source = "../../modules/identity"

  environment = "dev"

  # La crea infra/bootstrap. Se escribe el ARN porque cada raíz tiene su propio estado.
  permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-boundary"
}

# Bucket privado para los artefactos de los modelos. No guarda datos de pacientes.
module "model_artifacts" {
  source = "../../modules/model-artifacts"

  environment = "dev"
  account_id  = "896618135592"
}
