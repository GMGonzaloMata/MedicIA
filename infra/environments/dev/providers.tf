provider "aws" {
  region = "sa-east-1"

  # Evita aplicar por error en otra cuenta, por ejemplo la segunda cuenta del responsable.
  allowed_account_ids = ["896618135592"]

  default_tags {
    tags = {
      Project     = "medicia"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}
