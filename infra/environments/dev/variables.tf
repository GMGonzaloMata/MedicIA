# Composición opt-in; sin valores operativos inventados ni cambios al catálogo.
variable "demo" {
  description = "Demo opcional dev. AMI oficial AL2023 x86_64 fija con repos 2023.12.20261021/evidencia, PG17 menor, snapshot humanos; app_enabled=false permite provisionar sin hostname/release ni arranque app; true conserva requisitos previos."
  type = object({
    enabled                   = optional(bool, false)
    app_enabled               = optional(bool, true)
    environment               = optional(string, "dev")
    ami_id                    = optional(string, "")
    ami_evidence              = optional(string, "")
    engine_version            = optional(string, "")
    final_snapshot_identifier = optional(string, "")
    public_hostname           = optional(string, "")
    release_key               = optional(string, "")
    release_sha256            = optional(string, "")
    accept_acme_terms         = optional(bool, false)
  })
  default  = {}
  nullable = false

  validation {
    condition     = !var.demo.enabled || var.demo.app_enabled || !var.demo.accept_acme_terms
    error_message = "Infraestructura sola requiere accept_acme_terms=false."
  }
  validation {
    condition     = var.demo.environment == "dev"
    error_message = "La composición demo solo admite environment dev."
  }
  validation {
    condition     = !var.demo.enabled || can(regex("^ami-([0-9a-f]{8}|[0-9a-f]{17})$", var.demo.ami_id))
    error_message = "Al habilitar se requiere AMI AL2023 amd64 exacta aprobada, no latest."
  }
  validation {
    condition     = !var.demo.enabled || length(trimspace(var.demo.ami_evidence)) >= 16
    error_message = "Al habilitar se requiere referencia humana no sensible de evidencia AMI/prerrequisitos."
  }
  validation {
    condition     = !var.demo.enabled || can(regex("^17\\.(0|[1-9][0-9]*)$", var.demo.engine_version))
    error_message = "Al habilitar se requiere versión menor exacta PostgreSQL 17.x verificada por humano."
  }
  validation {
    condition = !var.demo.enabled || (
      length(var.demo.final_snapshot_identifier) <= 255 &&
      startswith(var.demo.final_snapshot_identifier, "medicia-dev-demo") &&
      can(regex("^[A-Za-z][A-Za-z0-9-]*$", var.demo.final_snapshot_identifier)) &&
      !strcontains(var.demo.final_snapshot_identifier, "--") && !endswith(var.demo.final_snapshot_identifier, "-")
    )
    error_message = "Al habilitar se requiere snapshot final único medicia-dev-demo*, máximo 255 caracteres, sin -- ni guion final."
  }
  validation {
    condition     = !var.demo.enabled || (!var.demo.app_enabled && var.demo.public_hostname == "") || can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.]duckdns[.]org$", var.demo.public_hostname))
    error_message = "Al habilitar se requiere hostname DuckDNS de un solo label minúsculo válido registrado por humano."
  }
  validation {
    condition = !var.demo.enabled || (!var.demo.app_enabled && var.demo.release_key == "") || (
      can(regex("^releases/[A-Za-z0-9][A-Za-z0-9/_.-]+[.]tar[.]gz$", var.demo.release_key)) &&
      !strcontains(var.demo.release_key, "..") && !strcontains(var.demo.release_key, "//") &&
      !can(regex("(?i)(^|[/_.-])latest([/_.-]|$)", var.demo.release_key))
    )
    error_message = "Al habilitar se requiere release_key versionada releases/*.tar.gz, sin latest/traversal/comodines."
  }
  validation {
    condition     = !var.demo.enabled || (!var.demo.app_enabled && var.demo.release_sha256 == "") || can(regex("^[0-9a-fA-F]{64}$", var.demo.release_sha256))
    error_message = "Al habilitar se requiere release_sha256 de exactamente 64 hexadecimales."
  }
}

variable "demo_acme_contact_email" {
  description = "Contacto operativo humano ACME; solo obligatorio con demo habilitada y aceptación explícita. No compartir valor real en chat."
  type        = string
  default     = ""
  sensitive   = true
  nullable    = false
  validation {
    condition = !(var.demo.enabled && var.demo.accept_acme_terms) || (
      length(var.demo_acme_contact_email) <= 254 &&
      var.demo_acme_contact_email == trimspace(var.demo_acme_contact_email) &&
      can(regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$", var.demo_acme_contact_email))
    )
    error_message = "Al aceptar términos se requiere contacto operativo ASCII válido, sin espacios ni controles."
  }
}

# Catálogo de modelos del entorno. Sumar un modelo es agregar una entrada acá,
# en un cambio que pasa por revisión (no se usan archivos .tfvars). Todo punto de inferencia nace apagado
# (enabled = false) y cobra por hora solo mientras está encendido. Ver specs/004-infra-sagemaker-modelos/contracts/model-catalog.md.
variable "models" {
  type = map(object({
    image_uri      = string
    model_data_key = string
    model_version  = string
    instance_type  = optional(string, "ml.t2.medium")
    enabled        = optional(bool, false)
  }))
  description = "Catálogo de modelos: nombre corto a entrada."

  default = {
    # EchoNext-Mini (005): 12 probabilidades de posibles hallazgos de cardiopatía estructural a partir de un ECG de
    # 12 derivaciones. Modelo de investigación: apoyo clínico, nunca diagnóstico. Nace apagado: enabled = true crea
    # el punto de inferencia, que cobra por hora (ml.t2.medium: 0,089 USD por hora en sa-east-1). Apagarlo es volver
    # a false. La imagen sale de medicia-ml y el artefacto del bucket de modelos, ambos con la versión 0.1.0.
    # Guía: infra/README.md, sección "Modelo EchoNext-Mini".
    echonext-mini = {
      image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-echonext-mini:0.1.0"
      model_data_key = "echonext-mini/0.1.0/model.tar.gz"
      model_version  = "0.1.0"
      instance_type  = "ml.t2.medium"
      enabled        = true
    }
  }
}
