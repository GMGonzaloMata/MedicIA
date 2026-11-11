"use client";

import { secondaryButtonClassName } from "@/components/form/button-styles";
import { ECG_LEAD_NAMES } from "@/modules/studies/domain/ecg-leads";

import type { ViewerAction, ViewerView } from "../../_lib/viewer-keys";
import { canPanBack, canPanForward, canZoomIn, canZoomOut, type ViewWindow } from "../../_lib/viewport";

interface ViewerControlsProps {
  view: ViewerView;
  lead: number;
  window: ViewWindow;
  onSelectLead: (lead: number) => void;
  onShowAll: () => void;
  onAction: (action: ViewerAction) => void;
}

const compactButton = `${secondaryButtonClassName} px-3`;

// Controles del visor. Todo lo que se hace con el teclado o con gestos también se puede hacer con estos botones.
export function ViewerControls({ view, lead, window, onSelectLead, onShowAll, onAction }: ViewerControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-base">
        <span className="font-medium">Derivación</span>
        <select
          value={lead}
          onChange={(event) => onSelectLead(Number(event.target.value))}
          className="min-h-11 rounded-control border border-input-border bg-card px-3 text-base text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {ECG_LEAD_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
      </label>

      {view === "ALL" ? (
        <button type="button" onClick={() => onSelectLead(lead)} className={compactButton}>
          Ampliar derivación
        </button>
      ) : (
        <>
          <button type="button" onClick={onShowAll} className={compactButton}>
            Ver las 12 derivaciones
          </button>
          <div role="group" aria-label="Zoom" className="flex flex-wrap gap-2">
            <button type="button" disabled={!canZoomIn(window)} onClick={() => onAction("ZOOM_IN")} className={compactButton}>
              Acercar
            </button>
            <button type="button" disabled={!canZoomOut(window)} onClick={() => onAction("ZOOM_OUT")} className={compactButton}>
              Alejar
            </button>
            <button type="button" disabled={!canZoomOut(window)} onClick={() => onAction("ZOOM_RESET")} className={compactButton}>
              Ver completo
            </button>
          </div>
          <div role="group" aria-label="Desplazamiento" className="flex flex-wrap gap-2">
            <button type="button" disabled={!canPanBack(window)} onClick={() => onAction("PAN_LEFT")} className={compactButton}>
              Anterior
            </button>
            <button type="button" disabled={!canPanForward(window)} onClick={() => onAction("PAN_RIGHT")} className={compactButton}>
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
