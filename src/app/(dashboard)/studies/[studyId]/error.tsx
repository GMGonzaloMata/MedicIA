"use client";

import Link from "next/link";

import { linkClassName, secondaryButtonClassName } from "@/components/form/button-styles";

import { STUDY_MESSAGES } from "../../_studies/_lib/study-messages";

// Límite de error del estudio. No muestra el mensaje técnico. En esta versión de Next.js el reintento es `retry()`
// (vuelve a pedir los datos); `reset()` solo limpiaría el error sin volver a leer.
export default function StudyError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">{STUDY_MESSAGES.studyError}</h1>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => retry()} className={secondaryButtonClassName}>
          Reintentar
        </button>
        <Link href="/studies" className={`${linkClassName} inline-flex min-h-11 items-center`}>
          Volver a mis estudios
        </Link>
      </div>
    </>
  );
}
