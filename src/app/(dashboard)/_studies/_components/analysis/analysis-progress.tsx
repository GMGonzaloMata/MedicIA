"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ANALYSIS_MESSAGES } from "../../_lib/analysis-messages";

const REFRESH_INTERVAL_MS = 3000;

// Se monta solo mientras hay un análisis en curso. Actualiza la pantalla cada pocos segundos para ver cuándo termina,
// se detiene si la pestaña está oculta y retoma al volver. Al terminar, la sección deja de renderizarlo y el intervalo
// se limpia al desmontarse.
export function AnalysisProgress() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const start = () => {
      if (timer === null) {
        timer = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        router.refresh();
        start();
      }
    };

    if (document.visibilityState !== "hidden") {
      start();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return (
    <div aria-live="polite">
      <p className="text-base">{ANALYSIS_MESSAGES.progress}</p>
    </div>
  );
}
