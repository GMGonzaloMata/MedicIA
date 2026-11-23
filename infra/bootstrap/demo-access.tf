# Políticas adicionales del operador. Administración las adjunta juntas; nunca automáticamente.
# Referencia por acción: servicereference.us-east-1.amazonaws.com/v1/{service}/{service}.json.
variable "demo_ami_arn" {
  description = "ARN exacto de AMI aprobada en la región; null no permite RunInstances sobre ninguna imagen. No buscar latest."
  type        = string
  default     = null

  validation {
    condition     = var.demo_ami_arn == null ? true : can(regex("^arn:aws:ec2:${var.region}::image/ami-[0-9a-f]+$", var.demo_ami_arn))
    error_message = "demo_ami_arn debe ser un ARN de imagen exacto en la región, sin comodines."
  }
}

locals {
  demo_ec2_types = ["vpc", "subnet", "route-table", "internet-gateway", "security-group", "security-group-rule", "elastic-ip", "instance", "volume", "network-interface"]
  demo_ec2_arns  = [for t in local.demo_ec2_types : "${local.demo_ec2_prefix}:${t}/*"]

  # Se agrega a la fuente única del plan; NUNCA agregar las escrituras de más abajo.
  demo_plan_read_statements = [
    {
      Sid    = "MetadataEc2"
      Effect = "Allow"
      # APIs sin resource scope; región restringida, no user-data ni consolas/passwords.
      Action    = ["ec2:DescribeInstances", "ec2:DescribeInstanceCreditSpecifications", "ec2:DescribeInstanceTypes", "ec2:DescribeImages", "ec2:DescribeVpcs", "ec2:DescribeSubnets", "ec2:DescribeAvailabilityZones", "ec2:DescribeRouteTables", "ec2:DescribeInternetGateways", "ec2:DescribeSecurityGroups", "ec2:DescribeSecurityGroupRules", "ec2:DescribeAddresses", "ec2:DescribeAddressesAttribute", "ec2:DescribeVolumes", "ec2:DescribeNetworkInterfaces", "ec2:DescribeTags"]
      Resource  = ["*"]
      Condition = { StringEquals = { "ec2:Region" = var.region } }
    },
    {
      Sid      = "MetadataVpc"
      Effect   = "Allow"
      Action   = ["ec2:DescribeVpcAttribute"]
      Resource = ["${local.demo_ec2_prefix}:vpc/*"]
    },
    {
      Sid       = "MetadataInstancia"
      Effect    = "Allow"
      Action    = ["ec2:DescribeInstanceAttribute"]
      Resource  = ["${local.demo_ec2_prefix}:instance/*"]
      Condition = local.demo_resource_tag
    },
    {
      Sid      = "MetadataRds"
      Effect   = "Allow"
      Action   = ["rds:DescribeDBInstances", "rds:DescribeDBSubnetGroups", "rds:DescribeDBParameterGroups", "rds:DescribeDBParameters", "rds:ListTagsForResource"]
      Resource = local.demo_rds_arns
    },
    {
      Sid      = "MetadataSecretos"
      Effect   = "Allow"
      Action   = ["secretsmanager:DescribeSecret", "secretsmanager:GetResourcePolicy"]
      Resource = local.demo_secret_arns
    },
    {
      Sid      = "MetadataRolWeb"
      Effect   = "Allow"
      Action   = ["iam:GetRole", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "iam:ListRolePolicies", "iam:ListRoleTags"]
      Resource = [local.demo_role_arn]
    },
    {
      Sid      = "MetadataPerfilWeb"
      Effect   = "Allow"
      Action   = ["iam:GetInstanceProfile", "iam:ListInstanceProfileTags"]
      Resource = [local.demo_profile_arn]
    },
  ]
}

resource "aws_iam_policy" "operator_demo" {
  name        = "medicia-${var.environment}-terraform-operator-demo"
  description = "Operador demo: IAM web acotado, RDS y metadatos de secretos/releases; sin valores secretos."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [for s in local.demo_plan_read_statements : s if !contains(["MetadataEc2", "MetadataVpc", "MetadataInstancia"], s.Sid)],
      [for s in local.plan_read_statements : merge(s, { Resource = [local.demo_releases_arn] }) if s.Sid == "LeerLosBucketsDeModelosYEstudios"],
      [
        {
          Sid       = "RolWebConSuLimite"
          Effect    = "Allow"
          Action    = ["iam:CreateRole", "iam:PutRolePolicy", "iam:PutRolePermissionsBoundary"]
          Resource  = [local.demo_role_arn]
          Condition = { StringEquals = { "iam:PermissionsBoundary" = local.demo_boundary_arn } }
        },
        {
          # Evita la vía genérica medicia-dev-* de la política previa.
          Sid       = "NuncaOtroLimiteWeb"
          Effect    = "Deny"
          Action    = ["iam:CreateRole", "iam:PutRolePolicy", "iam:PutRolePermissionsBoundary"]
          Resource  = [local.demo_role_arn]
          Condition = { StringNotEquals = { "iam:PermissionsBoundary" = local.demo_boundary_arn } }
        },
        {
          Sid       = "PasarSoloWebAEc2"
          Effect    = "Allow"
          Action    = ["iam:PassRole"]
          Resource  = [local.demo_role_arn]
          Condition = { StringEquals = { "iam:PassedToService" = "ec2.amazonaws.com" } }
        },
        {
          Sid      = "PerfilWeb"
          Effect   = "Allow"
          Action   = ["iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile", "iam:TagInstanceProfile", "iam:UntagInstanceProfile"]
          Resource = [local.demo_profile_arn]
        },
        {
          Sid      = "RdsDemo"
          Effect   = "Allow"
          Action   = ["rds:CreateDBInstance", "rds:ModifyDBInstance", "rds:DeleteDBInstance", "rds:CreateDBSubnetGroup", "rds:ModifyDBSubnetGroup", "rds:DeleteDBSubnetGroup", "rds:CreateDBParameterGroup", "rds:ModifyDBParameterGroup", "rds:DeleteDBParameterGroup", "rds:AddTagsToResource", "rds:RemoveTagsFromResource"]
          Resource = local.demo_rds_arns
        },
        {
          # RDS cifra el almacenamiento y el secreto master con las claves administradas por AWS (aws/rds y
          # aws/secretsmanager); quien crea la base necesita usarlas. IAM no permite nombrar una clave administrada,
          # por eso el límite es kms:ViaService (solo a través de RDS y Secrets Manager de la región) y la cuenta.
          # Sin Encrypt/Decrypt directos: no sirve para cifrar ni leer datos por fuera de esos servicios.
          Sid      = "KmsAdministradoParaRds"
          Effect   = "Allow"
          Action   = ["kms:CreateGrant", "kms:DescribeKey", "kms:Decrypt", "kms:GenerateDataKey", "kms:GenerateDataKeyWithoutPlaintext"]
          Resource = ["arn:aws:kms:${var.region}:${var.account_id}:key/*"]
          Condition = { StringEquals = {
            "kms:CallerAccount" = var.account_id
            "kms:ViaService"    = ["rds.${var.region}.amazonaws.com", "secretsmanager.${var.region}.amazonaws.com"]
          } }
        },
        {
          # El proveedor espera la creación con DescribeDBInstances, que IAM autoriza contra db:* y no contra
          # el nombre de la instancia. Solo lectura de metadatos; crear/modificar/borrar sigue limitado a medicia-dev-demo*.
          Sid      = "LeerInstanciasRds"
          Effect   = "Allow"
          Action   = ["rds:DescribeDBInstances"]
          Resource = ["arn:aws:rds:${var.region}:${var.account_id}:db:*"]
        },
        {
          # manage_master_user_password: RDS crea el secreto master (rds!db-*) en nombre de quien crea la base,
          # y exige que esa identidad pueda crearlo. Solo crear/etiquetar: sin leer ni escribir valores, y sin
          # alcanzar los secretos de la app. Borrarlo lo hace RDS al eliminar la base.
          Sid      = "SecretoMasterGestionadoPorRds"
          Effect   = "Allow"
          Action   = ["secretsmanager:CreateSecret", "secretsmanager:TagResource"]
          Resource = ["arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:rds!db-*"]
        },
        {
          # CreateSecret acepta valores en API: Terraform solo creará metadatos.
          # No UpdateSecret (también escribe valores), GetSecretValue ni PutSecretValue.
          Sid      = "CrearMetadatosSecretos"
          Effect   = "Allow"
          Action   = ["secretsmanager:CreateSecret", "secretsmanager:DeleteSecret", "secretsmanager:RestoreSecret", "secretsmanager:TagResource", "secretsmanager:UntagResource"]
          Resource = local.demo_secret_arns
        },
        {
          Sid      = "BucketReleases"
          Effect   = "Allow"
          Action   = ["s3:CreateBucket", "s3:DeleteBucket", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "s3:PutBucketPublicAccessBlock", "s3:PutBucketOwnershipControls", "s3:PutBucketTagging", "s3:PutBucketVersioning", "s3:PutEncryptionConfiguration", "s3:PutLifecycleConfiguration"]
          Resource = [local.demo_releases_arn]
        },
        {
          Sid      = "PublicarRelease"
          Effect   = "Allow"
          Action   = ["s3:PutObject"]
          Resource = ["${local.demo_releases_arn}/releases/*"]
        },
      ]
    )
  })
}

resource "aws_iam_policy" "operator_demo_network" {
  name        = "medicia-${var.environment}-terraform-operator-demo-network"
  description = "Operador demo: EC2 y red etiquetados, sin afectar redes ajenas. Separada por cuota IAM."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [for s in local.demo_plan_read_statements : s if contains(["MetadataEc2", "MetadataVpc", "MetadataInstancia"], s.Sid)],
      [
        {
          Sid       = "CrearRedDemo"
          Effect    = "Allow"
          Action    = ["ec2:CreateVpc", "ec2:CreateSubnet", "ec2:CreateRouteTable", "ec2:CreateInternetGateway", "ec2:CreateSecurityGroup", "ec2:AllocateAddress"]
          Resource  = [for t in ["vpc", "subnet", "route-table", "internet-gateway", "security-group", "elastic-ip"] : "${local.demo_ec2_prefix}:${t}/*"]
          Condition = local.demo_request_tag
        },
        {
          # Recursos existentes en las operaciones multi-resource, no los nuevos.
          Sid       = "UsarRedDemo"
          Effect    = "Allow"
          Action    = ["ec2:CreateSubnet", "ec2:CreateRouteTable", "ec2:CreateSecurityGroup", "ec2:RunInstances"]
          Resource  = [for t in ["vpc", "subnet", "security-group"] : "${local.demo_ec2_prefix}:${t}/*"]
          Condition = local.demo_resource_tag
        },
        {
          Sid       = "CrearDiscosDemo"
          Effect    = "Allow"
          Action    = ["ec2:RunInstances"]
          Resource  = ["${local.demo_ec2_prefix}:volume/*"]
          Condition = local.demo_request_tag
        },
        {
          # aws_instance no etiqueta la interfaz de red primaria, así que no puede exigirse aws:RequestTag.
          # Queda confinada igualmente: solo nace en la subred y el grupo con la etiqueta Deployment de UsarRedDemo.
          Sid       = "CrearEniDemo"
          Effect    = "Allow"
          Action    = ["ec2:RunInstances"]
          Resource  = ["${local.demo_ec2_prefix}:network-interface/*"]
          Condition = { StringEquals = { "ec2:Region" = var.region } }
        },
        {
          Sid      = "CrearInstanciaDemo"
          Effect   = "Allow"
          Action   = ["ec2:RunInstances"]
          Resource = ["${local.demo_ec2_prefix}:instance/*"]
          Condition = { StringEquals = {
            "aws:RequestTag/Deployment" = "ec2-rds-demo"
            "ec2:InstanceType"          = "t3.small"
            "ec2:MetadataHttpTokens"    = "required"
            "ec2:InstanceProfile"       = local.demo_profile_arn
          } }
        },
        {
          Sid       = "EtiquetarAlCrear"
          Effect    = "Allow"
          Action    = ["ec2:CreateTags"]
          Resource  = local.demo_ec2_arns
          Condition = { StringEquals = { "ec2:CreateAction" = ["CreateVpc", "CreateSubnet", "CreateRouteTable", "CreateInternetGateway", "CreateSecurityGroup", "AllocateAddress", "RunInstances", "AuthorizeSecurityGroupIngress", "AuthorizeSecurityGroupEgress"] } }
        },
        {
          Sid       = "GestionarRedDemo"
          Effect    = "Allow"
          Action    = ["ec2:DeleteVpc", "ec2:DeleteSubnet", "ec2:DeleteRouteTable", "ec2:DeleteInternetGateway", "ec2:DeleteSecurityGroup", "ec2:ReleaseAddress", "ec2:AttachInternetGateway", "ec2:DetachInternetGateway", "ec2:CreateRoute", "ec2:DeleteRoute", "ec2:AssociateRouteTable", "ec2:DisassociateRouteTable", "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress", "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress", "ec2:ModifySecurityGroupRules", "ec2:ModifyVpcAttribute", "ec2:ModifySubnetAttribute", "ec2:AssociateAddress", "ec2:DisassociateAddress", "ec2:TerminateInstances", "ec2:ModifyInstanceAttribute", "ec2:ModifyInstanceMetadataOptions", "ec2:CreateTags", "ec2:DeleteTags"]
          Resource  = local.demo_ec2_arns
          Condition = local.demo_resource_tag
        },
        {
          # La ENI primaria no lleva etiqueta (aws_instance no la etiqueta), así que GestionarRedDemo no la alcanza.
          # AssociateAddress/DisassociateAddress autorizan cada recurso por separado: la misma llamada sigue
          # exigiendo que la EIP lleve la etiqueta Deployment, por lo que solo opera con EIPs de la demo.
          Sid       = "EipEnEniDemo"
          Effect    = "Allow"
          Action    = ["ec2:AssociateAddress", "ec2:DisassociateAddress"]
          Resource  = ["${local.demo_ec2_prefix}:network-interface/*"]
          Condition = { StringEquals = { "ec2:Region" = var.region } }
        },
        {
          Sid       = "CrearReglasDemo"
          Effect    = "Allow"
          Action    = ["ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress"]
          Resource  = ["${local.demo_ec2_prefix}:security-group-rule/*"]
          Condition = local.demo_request_tag
        },
        ], var.demo_ami_arn == null ? [] : [
        {
          Sid      = "ImagenAprobada"
          Effect   = "Allow"
          Action   = ["ec2:RunInstances"]
          Resource = [var.demo_ami_arn]
        },
      ]
    )
  })
}
