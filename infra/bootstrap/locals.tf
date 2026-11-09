locals {
  # El sufijo con el ID de la cuenta evita choques: los nombres de bucket son globales en AWS.
  state_bucket_name = "medicia-tfstate-${var.environment}-${var.account_id}"

  # Se arma con el nombre, que se conoce al planificar, y no con un atributo del bucket.
  # Así la política se puede decodificar en las pruebas.
  state_bucket_arn = "arn:aws:s3:::${local.state_bucket_name}"
}
