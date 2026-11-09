module "identity" {
  source = "../../modules/identity"

  environment = "dev"

  # La crea infra/bootstrap. Se escribe el ARN porque cada raíz tiene su propio estado.
  permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-boundary"
}
