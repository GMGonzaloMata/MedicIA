export type RelationshipKind = "STAFF" | "PATIENT";

// Una opción de la lista de clínicas. No lleva el `tenantId`: al navegador solo llega el
// identificador del vínculo, y la clínica se deduce de él en el servidor.
export type AvailableClinic =
  | {
      kind: "STAFF";
      relationshipId: string;
      tenantName: string;
      isClinicAdmin: boolean;
      isDoctor: boolean;
    }
  | { kind: "PATIENT"; relationshipId: string; tenantName: string };
