import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { z } from "zod";

import type {
  IdentityProvider,
  VerifiedIdentity,
} from "@/modules/users/application/ports/out/identity-provider";
import { IdentityError } from "@/modules/users/domain/identity-errors";

import { loadCognitoConfig, type CognitoConfig } from "./config";
import { computeSecretHash } from "./secret-hash";

type CognitoClient = Pick<CognitoIdentityProviderClient, "send">;

// Verifica la firma, el emisor, el cliente y la vigencia del token de identidad. Devuelve el
// contenido como `unknown`: la forma se valida acá, no se confía en el tipo de la librería.
export interface IdTokenVerifier {
  verify(token: string): Promise<unknown>;
}

interface CognitoDependencies {
  client: CognitoClient;
  verifier: IdTokenVerifier;
}

const AUTH_FLOW = "USER_PASSWORD_AUTH";

// Errores por los que una operación "uniforme" (reenvío, recuperación) responde igual que si todo
// hubiera salido bien: sirven para no revelar si un correo tiene cuenta, o si ya está verificada.
const ABSORBED_ERRORS = new Set([
  "UserNotFoundException",
  "InvalidParameterException",
  "NotAuthorizedException",
  "LimitExceededException",
]);

const WRONG_CODE_ERRORS = new Set([
  "CodeMismatchException",
  "ExpiredCodeException",
  "UserNotFoundException",
  "NotAuthorizedException",
]);

// Cualquier fallo de credenciales se agrupa: correo inexistente, contraseña incorrecta, cuenta
// sin verificar, bloqueo temporal por intentos y desafíos que la aplicación no soporta.
const INVALID_CREDENTIALS_ERRORS = new Set([
  "NotAuthorizedException",
  "UserNotFoundException",
  "UserNotConfirmedException",
  "PasswordResetRequiredException",
]);

// Un parámetro inválido llega acá casi siempre por la política de contraseña, porque el resto de
// los datos ya se validó antes de llamar al proveedor.
const INVALID_PASSWORD_ERRORS = new Set(["InvalidPasswordException", "InvalidParameterException"]);

const idTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.union([z.literal(true), z.literal("true")]),
  name: z.string().min(1),
});

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

// Se registra solo el nombre interno del error: nunca el mensaje de AWS, la contraseña, el código
// ni el correo (spec FR-028).
function logFailure(operation: string, error: unknown): void {
  console.error(`[identity] ${operation} falló: ${errorName(error)}`);
}

function unavailable(operation: string, error: unknown): IdentityError {
  logFailure(operation, error);

  return new IdentityError("UNAVAILABLE");
}

export function buildCognitoIdentityProvider(
  config: CognitoConfig,
  { client, verifier }: CognitoDependencies,
): IdentityProvider {
  const secretHashFor = (username: string) =>
    computeSecretHash({ username, clientId: config.clientId, clientSecret: config.clientSecret });

  async function resendCode(email: string): Promise<void> {
    await client.send(
      new ResendConfirmationCodeCommand({
        ClientId: config.clientId,
        Username: email,
        SecretHash: secretHashFor(email),
      }),
    );
  }

  return {
    async signUp({ email, password, fullName }) {
      try {
        await client.send(
          new SignUpCommand({
            ClientId: config.clientId,
            Username: email,
            Password: password,
            SecretHash: secretHashFor(email),
            UserAttributes: [
              { Name: "email", Value: email },
              { Name: "name", Value: fullName },
            ],
          }),
        );
      } catch (error) {
        const name = errorName(error);

        if (name === "UsernameExistsException") {
          // Cognito no reenvía el código al repetir el registro de una cuenta sin verificar.
          // Se reenvía acá y se absorbe el error si la cuenta ya estaba verificada, para responder
          // igual que ante un registro nuevo.
          try {
            await resendCode(email);
          } catch (resendError) {
            if (!ABSORBED_ERRORS.has(errorName(resendError))) {
              throw unavailable("signUp", resendError);
            }
          }

          return;
        }

        if (INVALID_PASSWORD_ERRORS.has(name)) {
          throw new IdentityError("INVALID_PASSWORD");
        }

        throw unavailable("signUp", error);
      }
    },

    async confirmSignUp({ email, code }) {
      try {
        await client.send(
          new ConfirmSignUpCommand({
            ClientId: config.clientId,
            Username: email,
            ConfirmationCode: code,
            SecretHash: secretHashFor(email),
          }),
        );
      } catch (error) {
        if (WRONG_CODE_ERRORS.has(errorName(error))) {
          throw new IdentityError("INVALID_CODE");
        }

        throw unavailable("confirmSignUp", error);
      }
    },

    async resendConfirmationCode({ email }) {
      try {
        await resendCode(email);
      } catch (error) {
        if (!ABSORBED_ERRORS.has(errorName(error))) {
          throw unavailable("resendConfirmationCode", error);
        }
      }
    },

    async signIn({ email, password }): Promise<VerifiedIdentity> {
      let idToken: string | undefined;

      try {
        const response = await client.send(
          new InitiateAuthCommand({
            AuthFlow: AUTH_FLOW,
            ClientId: config.clientId,
            AuthParameters: {
              USERNAME: email,
              PASSWORD: password,
              SECRET_HASH: secretHashFor(email),
            },
          }),
        );
        idToken = response.AuthenticationResult?.IdToken;
      } catch (error) {
        if (INVALID_CREDENTIALS_ERRORS.has(errorName(error))) {
          throw new IdentityError("INVALID_CREDENTIALS");
        }

        throw unavailable("signIn", error);
      }

      // Sin token hay un desafío (por ejemplo, cambio obligatorio de contraseña) que no se soporta.
      if (!idToken) {
        throw new IdentityError("INVALID_CREDENTIALS");
      }

      let verified: unknown;

      try {
        verified = await verifier.verify(idToken);
      } catch {
        throw new IdentityError("INVALID_CREDENTIALS");
      }

      const claims = idTokenClaimsSchema.safeParse(verified);

      if (!claims.success) {
        throw new IdentityError("INVALID_CREDENTIALS");
      }

      // Los tokens se descartan acá: no se guardan, no se registran ni salen del servidor.
      return {
        subject: claims.data.sub,
        email: claims.data.email.toLowerCase(),
        fullName: claims.data.name,
      };
    },

    async requestPasswordReset({ email }) {
      try {
        await client.send(
          new ForgotPasswordCommand({
            ClientId: config.clientId,
            Username: email,
            SecretHash: secretHashFor(email),
          }),
        );
      } catch (error) {
        if (!ABSORBED_ERRORS.has(errorName(error))) {
          throw unavailable("requestPasswordReset", error);
        }
      }
    },

    async confirmPasswordReset({ email, code, newPassword }) {
      try {
        await client.send(
          new ConfirmForgotPasswordCommand({
            ClientId: config.clientId,
            Username: email,
            ConfirmationCode: code,
            Password: newPassword,
            SecretHash: secretHashFor(email),
          }),
        );
      } catch (error) {
        const name = errorName(error);

        if (WRONG_CODE_ERRORS.has(name)) {
          throw new IdentityError("INVALID_CODE");
        }

        if (INVALID_PASSWORD_ERRORS.has(name)) {
          throw new IdentityError("INVALID_PASSWORD");
        }

        throw unavailable("confirmPasswordReset", error);
      }
    },
  };
}

// Conecta el adaptador con el SDK real y la verificación de tokens de AWS.
export function createCognitoIdentityProvider(env: Record<string, string | undefined>): IdentityProvider {
  const config = loadCognitoConfig(env);

  return buildCognitoIdentityProvider(config, {
    client: new CognitoIdentityProviderClient({ region: config.region }),
    verifier: CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      tokenUse: "id",
      clientId: config.clientId,
    }),
  });
}
