provider "aws" {
  region = var.region

  # Evita aplicar por error en otra cuenta, por ejemplo la segunda cuenta del responsable.
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      Project     = "medicia"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
