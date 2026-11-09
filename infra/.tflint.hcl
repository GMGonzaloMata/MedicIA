# Configuración de tflint para todo `infra/`. Se ejecuta en CI (flujo infra.yml) y,
# si está instalado, en la máquina local con `tflint --init` y `tflint --recursive`.

# Reglas del propio lenguaje de Terraform, incluidas en tflint.
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

# Reglas específicas de AWS. Versión exacta: se actualiza en un cambio aparte (FR-015).
plugin "aws" {
  enabled = true
  version = "0.50.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

rule "terraform_naming_convention" {
  enabled = true
}

rule "terraform_documented_variables" {
  enabled = true
}

rule "terraform_documented_outputs" {
  enabled = true
}

rule "terraform_typed_variables" {
  enabled = true
}

rule "terraform_required_version" {
  enabled = true
}
