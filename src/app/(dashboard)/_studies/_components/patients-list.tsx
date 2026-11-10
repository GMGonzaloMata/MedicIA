import Link from "next/link";

import { linkClassName } from "@/components/form/button-styles";
import type { PatientSummary } from "@/modules/studies/domain/study";

import { STUDY_MESSAGES } from "../_lib/study-messages";

const DOCUMENT_LABELS = { DNI: "DNI", PASSPORT: "Pasaporte", OTHER: "Documento" } as const;

function patientName(patient: PatientSummary): string {
  return patient.fullName ?? STUDY_MESSAGES.patientWithoutName;
}

function studyCountLabel(count: number): string {
  return count === 1 ? "1 estudio" : `${count} estudios`;
}

// Pacientes asignados al médico: tabla en pantallas anchas y tarjetas apiladas en el móvil. Cada uno lleva a
// su pantalla de estudios.
export function PatientsList({ patients }: { patients: PatientSummary[] }) {
  if (patients.length === 0) {
    return <p className="text-base text-muted">{STUDY_MESSAGES.noPatients}</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-base">
          <caption className="sr-only">Pacientes asignados, por nombre</caption>
          <thead>
            <tr className="border-b border-border text-sm text-muted">
              <th scope="col" className="px-3 py-2 font-medium">Paciente</th>
              <th scope="col" className="px-3 py-2 font-medium">Documento</th>
              <th scope="col" className="px-3 py-2 font-medium">Estudios</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.id} className="border-b border-border">
                <th scope="row" className="px-3 py-3 font-semibold">
                  <Link href={`/patients/${patient.id}`} className={`${linkClassName} inline-flex min-h-11 items-center`}>
                    {patientName(patient)}
                  </Link>
                </th>
                <td className="px-3 py-3">
                  {DOCUMENT_LABELS[patient.documentType]} {patient.documentNumber}
                </td>
                <td className="px-3 py-3">{studyCountLabel(patient.studyCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {patients.map((patient) => (
          <li key={patient.id} className="flex flex-col gap-1 rounded-control border border-border bg-card p-4">
            <Link href={`/patients/${patient.id}`} className={`${linkClassName} inline-flex min-h-11 items-center text-lg`}>
              {patientName(patient)}
            </Link>
            <p className="text-sm text-muted">
              {DOCUMENT_LABELS[patient.documentType]} {patient.documentNumber}
            </p>
            <p className="text-sm">{studyCountLabel(patient.studyCount)}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
