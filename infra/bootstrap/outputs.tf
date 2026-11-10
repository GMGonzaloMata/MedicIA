output "models_bucket_name" {
  description = "Nombre del bucket de artefactos de modelos que crea infra/environments/dev."
  value       = local.models_bucket_name
}

output "operator_policy_arn" {
  description = "ARN de la política del operador. Se adjunta a terraform-dev para reemplazar AdministratorAccess."
  value       = aws_iam_policy.operator.arn
}

output "plan_role_arn" {
  description = "ARN del rol de solo lectura que asume el plan de CI. Es el valor de la variable de GitHub INFRA_PLAN_ROLE_ARN."
  value       = aws_iam_role.plan.arn
}

output "region" {
  description = "Región de AWS del entorno."
  value       = var.region
}

output "sagemaker_boundary_policy_arn" {
  description = "ARN de la política límite del rol de ejecución de SageMaker."
  value       = aws_iam_policy.sagemaker_boundary.arn
}

output "state_bucket_arn" {
  description = "ARN del bucket que guarda el estado remoto."
  value       = aws_s3_bucket.state.arn
}

output "state_bucket_name" {
  description = "Nombre del bucket que guarda el estado remoto. Es el valor del backend de las demás raíces."
  value       = aws_s3_bucket.state.bucket
}
