"use client";

import { useMemo, useReducer, type KeyboardEvent } from "react";

import type { StudyWaveformV2 } from "@/modules/studies/application/use-cases/get-study-waveform";
import { ECG_LEAD_NAMES } from "@/modules/studies/domain/ecg-leads";

import { actionForKey } from "../../_lib/viewer-keys";
import { initialViewerState, viewerReducer } from "../../_lib/viewer-state";
import { formatRange, TOTAL_SAMPLES, type ViewWindow } from "../../_lib/viewport";
import { TimeAxis } from "./time-axis";
import { ViewerControls } from "./viewer-controls";

type PdfLead = StudyWaveformV2["leads"][number];
const PDF_SAMPLES = 5000;
// El estado compartido expresa una ventana temporal de diez segundos. Solo mapeamos sus límites;
// no se reduce la señal PDF a las 2500 muestras del visor histórico.
const WINDOW_RATIO = PDF_SAMPLES / TOTAL_SAMPLES;
const KEYBOARD_HELP =
  "Con la gráfica enfocada: ← → desplazan, Inicio y Fin van a los extremos, + y − acercan y alejan, 0 muestra todo, ↑ ↓ cambian de derivación y Esc vuelve a las 12 derivaciones.";

function amplitudeBounds(leads: StudyWaveformV2["leads"]): { top: number; height: number } {
  let min = -1;
  let max = 1;
  for (const lead of leads) {
    for (let i = 0; i < lead.samples.length; i += 1) {
      const sample = lead.samples[i];
      if (lead.observed[i] && sample !== undefined) {
        min = Math.min(min, sample);
        max = Math.max(max, sample);
      }
    }
  }
  const padding = (max - min) * 0.05;
  return { top: -max - padding, height: max - min + padding * 2 };
}

function PdfLeadStrip({ lead, window, bounds, expanded }: {
  lead: PdfLead;
  window: ViewWindow;
  bounds: { top: number; height: number };
  expanded: boolean;
}) {
  const start = window.start * WINDOW_RATIO;
  const end = (window.start + window.span) * WINDOW_RATIO;
  const drawing = useMemo(() => {
    const commands: string[] = [];
    const isolated: { x: number; y: number }[] = [];
    for (let i = start; i < end; i += 1) {
      const sample = lead.samples[i];
      if (!lead.observed[i] || sample === undefined) continue;
      // M reinicia tras cada hueco, incluso si hay varios ceros placeholder consecutivos.
      commands.push(`${i === start || !lead.observed[i - 1] ? "M" : "L"}${i},${-sample}`);
      if ((i === start || !lead.observed[i - 1]) && (i === end - 1 || !lead.observed[i + 1])) {
        isolated.push({ x: i, y: -sample });
      }
    }
    return { path: commands.join(" "), isolated };
  }, [lead, start, end]);

  return (
    <div className="min-w-0 rounded-control border border-border bg-card p-2">
      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted">
        <span className="font-medium text-foreground">{lead.name}</span>
        {drawing.path ? <span>Amplitud en microvoltios (uV)</span> : <span>Sin muestras observadas</span>}
      </div>
      <svg
        role="img"
        aria-label={`Derivación ${lead.name}, señal cruda del PDF`}
        viewBox={`${start} ${bounds.top} ${end - start - 1} ${bounds.height}`}
        preserveAspectRatio="none"
        className={`block w-full text-primary ${expanded ? "h-64" : "h-16"}`}
      >
        {drawing.path ? <path d={drawing.path} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /> : null}
        {drawing.isolated.map(({ x, y }) => (
          <circle key={x} cx={x} cy={y} r="1" fill="currentColor" stroke="currentColor" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </div>
  );
}

/** Visor de señal cruda: misma navegación y tokens, sin reutilizar el dibujo continuo/normalizado de ecg1. */
export function PdfStudyViewer({ leads }: { leads: StudyWaveformV2["leads"] }) {
  const [state, dispatch] = useReducer(viewerReducer, undefined, initialViewerState);
  const bounds = useMemo(() => amplitudeBounds(leads), [leads]);
  // El orden visual del selector es estable; cada nombre sigue unido a sus propias muestras y máscara.
  const ordered = useMemo(() => ECG_LEAD_NAMES.flatMap((name) => {
    const lead = leads.find((item) => item.name === name);
    return lead ? [lead] : [];
  }), [leads]);
  const selected = ordered[state.lead];

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const action = actionForKey(event, state.view);
    if (action) {
      event.preventDefault();
      dispatch({ type: "KEY", action });
    }
  }

  return (
    <figure aria-label="Visor de la señal cruda del PDF" className="flex min-w-0 flex-col gap-4">
      <figcaption className="space-y-2 text-sm text-muted">
        <p>Señal cruda del PDF: 12 derivaciones, 500 Hz, 10 segundos, amplitud en microvoltios (uV).</p>
        <p>Los huecos son tramos no observados, no amplitud cero. Se conservan las muestras sin remuestreo, normalización ni interpolación.</p>
        <p>Escala visual compartida entre derivaciones; no es una escala clínica calibrada ni una interpretación del ECG.</p>
      </figcaption>
      <ViewerControls
        view={state.view} lead={state.lead} window={state.window}
        onSelectLead={(lead) => dispatch({ type: "SELECT_LEAD", lead })}
        onShowAll={() => dispatch({ type: "SHOW_ALL" })}
        onAction={(action) => dispatch({ type: "KEY", action })}
      />
      {state.view === "ALL" ? (
        <ol className="flex min-w-0 flex-col gap-2">
          {ordered.map((lead, index) => (
            <li key={lead.name} className="min-w-0">
              <button
                type="button" aria-label={`Ampliar la derivación ${lead.name}`}
                onClick={() => dispatch({ type: "SELECT_LEAD", lead: index })}
                className="block w-full rounded-control text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <PdfLeadStrip lead={lead} window={state.window} bounds={bounds} expanded={false} />
              </button>
            </li>
          ))}
        </ol>
      ) : selected ? (
        <div
          role="group" aria-label={`Gráfica de la derivación ${selected.name}`}
          aria-keyshortcuts="ArrowLeft ArrowRight Home End + - 0 ArrowUp ArrowDown Escape"
          tabIndex={0} onKeyDown={onKeyDown}
          className="min-w-0 rounded-control outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <PdfLeadStrip lead={selected} window={state.window} bounds={bounds} expanded />
        </div>
      ) : null}
      <TimeAxis window={state.window} />
      {state.view === "SINGLE" ? (
        <>
          <p aria-live="polite" className="text-sm text-muted">{formatRange(state.window)}</p>
          <p className="text-sm text-muted">{KEYBOARD_HELP}</p>
        </>
      ) : <p className="text-sm text-muted">Tocá una derivación para verla ampliada.</p>}
    </figure>
  );
}
