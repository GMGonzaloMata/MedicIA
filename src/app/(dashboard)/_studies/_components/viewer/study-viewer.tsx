"use client";

import { useMemo, useReducer, useRef, type KeyboardEvent, type PointerEvent } from "react";

import { ECG_LEAD_NAMES } from "@/modules/studies/domain/ecg-leads";

import { actionForKey } from "../../_lib/viewer-keys";
import { initialViewerState, viewerReducer } from "../../_lib/viewer-state";
import { formatRange } from "../../_lib/viewport";
import { computeLeadScale } from "../../_lib/waveform-path";
import { LeadStrip } from "./lead-strip";
import { TimeAxis } from "./time-axis";
import { ViewerControls } from "./viewer-controls";

const ALL_VIEW_HEIGHT = 64;
const SINGLE_VIEW_HEIGHT = 256;

const KEYBOARD_HELP =
  "Con la gráfica enfocada: ← → desplazan, Inicio y Fin van a los extremos, + y − acercan y alejan, 0 muestra todo, ↑ ↓ cambian de derivación y Esc vuelve a las 12 derivaciones.";

// Visor de las 12 derivaciones (specs/007-visor-onda-ecg/contracts/viewer-ui.md). Recibe las derivaciones ya separadas
// desde el servidor; no conoce la clave del archivo ni las variables del estudio.
export function StudyViewer({ leads }: { leads: Float32Array[] }) {
  const [state, dispatch] = useReducer(viewerReducer, undefined, initialViewerState);
  const scales = useMemo(() => leads.map((samples) => computeLeadScale(samples)), [leads]);
  const pointers = useRef(new Map<number, { x: number }>());
  const chart = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const action = actionForKey(event, state.view);

    if (action) {
      event.preventDefault();
      dispatch({ type: "KEY", action });
    }
  }

  function chartWidth(): number {
    return chart.current?.getBoundingClientRect().width || 1;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);

    if (!previous) {
      return;
    }

    const others = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId);
    const other = others[0]?.[1];

    if (other) {
      // Pellizco: el factor es la relación entre la distancia nueva y la anterior; el ancla, el punto medio.
      const before = Math.abs(previous.x - other.x);
      const after = Math.abs(event.clientX - other.x);
      const left = chart.current?.getBoundingClientRect().left ?? 0;

      if (before > 0 && after > 0) {
        const middle = (event.clientX + other.x) / 2;
        dispatch({ type: "ZOOM", factor: after / before, anchor: (middle - left) / chartWidth() });
      }
    } else {
      dispatch({ type: "DRAG", fraction: (event.clientX - previous.x) / chartWidth() });
    }

    pointers.current.set(event.pointerId, { x: event.clientX });
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
  }

  return (
    <figure aria-label="Visor de la señal del electrocardiograma" className="flex flex-col gap-4">
      <ViewerControls
        view={state.view}
        lead={state.lead}
        window={state.window}
        onSelectLead={(lead) => dispatch({ type: "SELECT_LEAD", lead })}
        onShowAll={() => dispatch({ type: "SHOW_ALL" })}
        onAction={(action) => dispatch({ type: "KEY", action })}
      />

      {state.view === "ALL" ? (
        <ol className="flex flex-col gap-2">
          {leads.map((samples, index) => {
            const name = ECG_LEAD_NAMES[index] as string;

            return (
              <li key={name}>
                <button
                  type="button"
                  aria-label={`Ampliar la derivación ${name}`}
                  onClick={() => dispatch({ type: "SELECT_LEAD", lead: index })}
                  className="block w-full rounded-control text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <LeadStrip
                    samples={samples}
                    name={name}
                    window={state.window}
                    scale={scales[index] as (typeof scales)[number]}
                    viewHeight={ALL_VIEW_HEIGHT}
                    className="h-16"
                  />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div
          ref={chart}
          role="group"
          aria-label={`Gráfica de la derivación ${ECG_LEAD_NAMES[state.lead]}`}
          aria-keyshortcuts="ArrowLeft ArrowRight Home End + - 0 ArrowUp ArrowDown Escape"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{ touchAction: "pan-y" }}
          className="rounded-control outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <LeadStrip
            samples={leads[state.lead] as Float32Array}
            name={ECG_LEAD_NAMES[state.lead] as string}
            window={state.window}
            scale={scales[state.lead] as (typeof scales)[number]}
            viewHeight={SINGLE_VIEW_HEIGHT}
            className="h-64"
          />
        </div>
      )}

      <TimeAxis window={state.window} />

      {state.view === "SINGLE" ? (
        <>
          <p aria-live="polite" className="text-sm text-muted">
            {formatRange(state.window)}
          </p>
          <p className="text-sm text-muted">{KEYBOARD_HELP}</p>
        </>
      ) : (
        <p className="text-sm text-muted">Tocá una derivación para verla ampliada.</p>
      )}
    </figure>
  );
}
