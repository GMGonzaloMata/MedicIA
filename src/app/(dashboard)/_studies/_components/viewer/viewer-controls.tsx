"use client";

import { compactSecondaryButtonClassName } from "@/components/form/button-styles";
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

// Grupo de botones pegados, como una barra de herramientas.
const groupClassName = "flex flex-wrap gap-1 rounded-card bg-elevated p-1";
const groupButtonClassName = `${compactSecondaryButtonClassName} border-transparent bg-card disabled:bg-transparent`;

// Controles del visor. Todo lo que se hace con el teclado o con gestos también se puede hacer con estos botones.
export function ViewerControls({ view, lead, window, onSelectLead, onShowAll, onAction }: ViewerControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="font-label font-semibold text-muted">Derivación</span>
        <select
          value={lead}
          onChange={(event) => onSelectLead(Number(event.target.value))}
          className="min-h-11 rounded-control border border-input-border bg-card px-3 text-base font-semibold text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {ECG_LEAD_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
      </label>

      {view === "ALL" ? (
        <button type="button" onClick={() => onSelectLead(lead)} className={compactSecondaryButtonClassName}>
          Ampliar derivación
        </button>
      ) : (
        <>
          <button type="button" onClick={onShowAll} className={compactSecondaryButtonClassName}>
            Ver las 12 derivaciones
          </button>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <div role="group" aria-label="Zoom" className={groupClassName}>
              <button type="button" disabled={!canZoomIn(window)} onClick={() => onAction("ZOOM_IN")} className={groupButtonClassName}>
                Acercar
              </button>
              <button type="button" disabled={!canZoomOut(window)} onClick={() => onAction("ZOOM_OUT")} className={groupButtonClassName}>
                Alejar
              </button>
              <button type="button" disabled={!canZoomOut(window)} onClick={() => onAction("ZOOM_RESET")} className={groupButtonClassName}>
                Ver completo
              </button>
            </div>
            <div role="group" aria-label="Desplazamiento" className={groupClassName}>
              <button type="button" disabled={!canPanBack(window)} onClick={() => onAction("PAN_LEFT")} className={groupButtonClassName}>
                Anterior
              </button>
              <button type="button" disabled={!canPanForward(window)} onClick={() => onAction("PAN_RIGHT")} className={groupButtonClassName}>
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
