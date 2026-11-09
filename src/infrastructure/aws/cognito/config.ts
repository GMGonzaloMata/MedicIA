import { z } from "zod";

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  clientSecret: string;
}

const cognitoEnvironmentSchema = z.object({
  COGNITO_REGION: z.string().min(1),
  COGNITO_USER_POOL_ID: z.string().min(1),
  COGNITO_CLIENT_ID: z.string().min(1),
  COGNITO_CLIENT_SECRET: z.string().min(1),
});

// Valida las variables de entorno de Cognito. El error nombra las variables que faltan o son
// inválidas, nunca sus valores: una de ellas es un secreto.
export function loadCognitoConfig(env: Record<string, string | undefined>): CognitoConfig {
  const parsed = cognitoEnvironmentSchema.safeParse(env);

  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];

    throw new Error(`Faltan o son inválidas las variables de Cognito: ${names.join(", ")}.`);
  }

  return {
    region: parsed.data.COGNITO_REGION,
    userPoolId: parsed.data.COGNITO_USER_POOL_ID,
    clientId: parsed.data.COGNITO_CLIENT_ID,
    clientSecret: parsed.data.COGNITO_CLIENT_SECRET,
  };
}
