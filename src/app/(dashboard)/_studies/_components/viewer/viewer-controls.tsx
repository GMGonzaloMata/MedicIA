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

// Todo mide 36 px de alto: el selector, los botones sueltos y cada grupo con su relleno. Los botones amplían su área
// táctil con un pseudo-elemento.
const buttonClassName = compactSecondaryButtonClassName.replace("border-border", "border-input-border");
const groupClassName = "flex flex-wrap gap-0.5 rounded-control bg-elevated p-0.5";
const groupButtonClassName =
  "relative inline-flex h-8 items-center whitespace-nowrap rounded-[calc(var(--radius-control)-2px)] px-3 text-sm font-semibold text-foreground outline-offset-2 transition-colors after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] hover:bg-card focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

// Controles del visor. Todo lo que se hace con el teclado o con gestos también se puede hacer con estos botones.
export function ViewerControls({ view, lead, window, onSelectLead, onShowAll, onAction }: ViewerControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        <span className="font-label font-semibold text-muted">Derivación</span>
        <select
          value={lead}
          onChange={(event) => onSelectLead(Number(event.target.value))}
          className="h-9 rounded-control border border-input-border bg-card px-2.5 text-sm font-semibold text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {ECG_LEAD_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
      </label>

      {view === "ALL" ? (
        <button type="button" onClick={() => onSelectLead(lead)} className={buttonClassName}>
          Ampliar derivación
        </button>
      ) : (
        <>
          <button type="button" onClick={onShowAll} className={buttonClassName}>
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
