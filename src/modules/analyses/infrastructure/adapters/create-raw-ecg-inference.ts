import "server-only";
import type { RawEcgInference } from "../../application/ports/out/raw-ecg-inference";
import { createHttpRawEcgInference } from "./http-raw-ecg-inference";

/** Los hashes son una declaración verificada del operador, no descubrimiento ni healthcheck. */
export function createRawEcgInference(): RawEcgInference | null {
  const endpoint = process.env.E022_INFERENCE_ENDPOINT;
  const modelSha256 = process.env.E022_MODEL_SHA256;
  const preprocessingSha256 = process.env.E022_PREPROCESSING_SHA256;
  if (!endpoint || !modelSha256 || !preprocessingSha256) return null;
  const isLocalSynthetic = process.env.PDF_E022_LOCAL_SYNTHETIC === "1" &&
    ["development", "test"].includes(process.env.NODE_ENV ?? "");
  try {
    return createHttpRawEcgInference({ endpoint, modelSha256, preprocessingSha256, allowLoopbackHttpForTests: isLocalSynthetic });
  } catch {
    return null;
  }
}
