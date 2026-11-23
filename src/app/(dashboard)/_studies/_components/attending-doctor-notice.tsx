import "server-only";

import { getTenantsModule } from "@/modules/tenants/composition";
import type { DoctorAvailability } from "@/modules/tenants/domain/member-lifecycle";

import { STUDY_MESSAGES } from "../_lib/study-messages";

// Aviso para el paciente cuando todos sus médicos asignados están desactivados. La consulta recibe la clínica y el
// paciente del contexto autenticado y devuelve solo un estado: nunca nombres ni datos del médico. Si la consulta
// falla, no se muestra nada: un aviso de más sería peor que no tenerlo, y no debe tirar la pantalla de estudios.
export async function AttendingDoctorNotice({ tenantId, patientId }: { tenantId: string; patientId: string }) {
  let availability: DoctorAvailability | null = null;

  try {
    // Dentro del `try`: obtener el módulo también puede fallar (por ejemplo, por configuración).
    availability = await getTenantsModule().getAttendingDoctorAvailability({ tenantId, patientId });
  } catch (error) {
    // Solo el nombre del error: nunca datos de la persona.
    console.error(`[estudios] no se pudo consultar la disponibilidad del médico: ${error instanceof Error ? error.name : "UnknownError"}`);
  }

  if (availability !== "UNAVAILABLE") {
    return null;
  }

  return (
    <div role="status" className="rounded-control border-2 border-primary bg-elevated px-4 py-3 text-base">
      {STUDY_MESSAGES.doctorUnavailable}
    </div>
  );
}
