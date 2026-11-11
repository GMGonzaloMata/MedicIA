import { describe, expect, it } from "vitest";

import {
  createInvitationMailer,
  loadAppBaseUrl,
} from "@/modules/users/infrastructure/adapters/create-invitation-mailer";

const SECRET = "valor-secreto-que-no-debe-aparecer";
const smtpEnv = {
  INVITATION_MAILER: "smtp",
  APP_BASE_URL: "https://medicia.example",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_USER: "medicia.proyecto@example.com",
  SMTP_PASSWORD: SECRET,
  INVITATION_FROM_ADDRESS: "medicia.proyecto@example.com",
};
const fakeEnv = {
  INVITATION_MAILER: "fake",
  APP_BASE_URL: "http://localhost:3000",
  FAKE_MAIL_OUTBOX_FILE: ".tmp/outbox.jsonl",
};

function messageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  return "";
}

describe("elección del adaptador de correo", () => {
  it("no tiene valor por defecto: sin INVITATION_MAILER, o con un valor desconocido, falla", () => {
    expect(() => createInvitationMailer({})).toThrow('INVITATION_MAILER debe ser "smtp" o "fake".');
    expect(() => createInvitationMailer({ ...fakeEnv, INVITATION_MAILER: "ses" })).toThrow(
      'INVITATION_MAILER debe ser "smtp" o "fake".',
    );
  });

  it("arma el adaptador SMTP con la configuración válida, sin conectarse", () => {
    expect(createInvitationMailer(smtpEnv)).toHaveProperty("send");
    expect(createInvitationMailer({ ...smtpEnv, SMTP_PORT: "587" })).toHaveProperty("send");
  });

  it.each([
    ["SMTP_HOST", { SMTP_HOST: "" }],
    ["SMTP_PORT", { SMTP_PORT: "25" }],
    ["SMTP_USER", { SMTP_USER: undefined }],
    ["SMTP_PASSWORD", { SMTP_PASSWORD: "" }],
    ["INVITATION_FROM_ADDRESS", { INVITATION_FROM_ADDRESS: "no-es-un-correo" }],
  ])("rechaza una configuración SMTP inválida y nombra %s", (variable, override) => {
    const message = messageOf(() => createInvitationMailer({ ...smtpEnv, ...override }));

    expect(message).toContain(variable);
  });

  it("los mensajes de configuración nombran las variables pero nunca sus valores", () => {
    const message = messageOf(() =>
      createInvitationMailer({ ...smtpEnv, SMTP_PORT: "25", INVITATION_FROM_ADDRESS: "malo", SMTP_PASSWORD: SECRET }),
    );

    expect(message).toContain("SMTP_PORT");
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain("malo");
  });

  it("arma el adaptador simulado y exige el archivo de salida", () => {
    expect(createInvitationMailer(fakeEnv)).toHaveProperty("send");
    expect(messageOf(() => createInvitationMailer({ ...fakeEnv, FAKE_MAIL_OUTBOX_FILE: "" }))).toContain(
      "FAKE_MAIL_OUTBOX_FILE",
    );
  });

  it("el adaptador simulado se rechaza en producción con una dirección pública, pero no con una local", () => {
    expect(() =>
      createInvitationMailer({ ...fakeEnv, NODE_ENV: "production", APP_BASE_URL: "https://medicia.example" }),
    ).toThrow('INVITATION_MAILER="fake" no se puede usar en producción.');
    expect(createInvitationMailer({ ...fakeEnv, NODE_ENV: "production" })).toHaveProperty("send");
  });
});

describe("dirección base de los links", () => {
  it("devuelve solo el origen, sin barra final ni ruta", () => {
    expect(loadAppBaseUrl({ APP_BASE_URL: "https://medicia.example/" })).toBe("https://medicia.example");
    expect(loadAppBaseUrl({ APP_BASE_URL: "https://medicia.example/algo?x=1" })).toBe("https://medicia.example");
  });

  it("exige una dirección válida", () => {
    expect(() => loadAppBaseUrl({})).toThrow("APP_BASE_URL debe ser una dirección válida.");
    expect(() => loadAppBaseUrl({ APP_BASE_URL: "medicia.example" })).toThrow("APP_BASE_URL debe ser una dirección válida.");
  });

  it("en producción exige https, salvo en la propia máquina", () => {
    expect(() => loadAppBaseUrl({ NODE_ENV: "production", APP_BASE_URL: "http://medicia.example" })).toThrow(
      "APP_BASE_URL debe usar https en producción.",
    );
    expect(loadAppBaseUrl({ NODE_ENV: "production", APP_BASE_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3000",
    );
    expect(loadAppBaseUrl({ NODE_ENV: "development", APP_BASE_URL: "http://medicia.example" })).toBe(
      "http://medicia.example",
    );
  });
});
