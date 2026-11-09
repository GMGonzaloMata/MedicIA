"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getUsersModule } from "@/modules/users/composition";
import { ClinicUnavailableError } from "@/modules/users/domain/clinic-errors";

import { getAccessContext } from "../../_lib/access";
import { AUTH_MESSAGES } from "../../_lib/auth-messages";
import { readSessionToken } from "../../_lib/session-cookie";

export interface SelectClinicState {
  message?: string;
}

// Valor opaco del botón: `STAFF:<id>` o `PATIENT:<id>`. Nunca lleva un `tenantId`.
const relationshipSchema = z.object({
  relationship: z.string().regex(/^(STAFF|PATIENT):/),
});

function parseRelationship(
  value: string,
): { kind: "STAFF" | "PATIENT"; relationshipId: string } | null {
  const separatorIndex = value.indexOf(":");
  const kind = value.slice(0, separatorIndex);
  const relationshipId = value.slice(separatorIndex + 1);

  if ((kind !== "STAFF" && kind !== "PATIENT") || !z.uuid().safeParse(relationshipId).success) {
    return null;
  }

  return { kind, relationshipId };
}

export async function selectClinic(
  previousState: SelectClinicState | undefined,
  formData: FormData,
): Promise<SelectClinicState> {
  // La acción se puede invocar con un POST directo: comprueba la sesión por su cuenta.
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    redirect("/sign-in");
  }

  const parsed = relationshipSchema.safeParse({ relationship: formData.get("relationship") });
  const relationship = parsed.success ? parseRelationship(parsed.data.relationship) : null;

  if (!relationship) {
    return { message: AUTH_MESSAGES.clinicUnavailable };
  }

  try {
    await getUsersModule().selectActiveClinic({
      token: await readSessionToken(),
      ...relationship,
    });
  } catch (error) {
    if (error instanceof ClinicUnavailableError) {
      return { message: AUTH_MESSAGES.clinicUnavailable };
    }

    console.error(`[acceso] error inesperado: ${error instanceof Error ? error.name : "UnknownError"}`);

    return { message: AUTH_MESSAGES.unavailable };
  }

  // El encabezado (parte del layout) muestra la clínica activa: sin esto el router conservaría el
  // layout anterior y seguiría mostrando la clínica que se acaba de dejar.
  revalidatePath("/", "layout");
  redirect("/");
}
