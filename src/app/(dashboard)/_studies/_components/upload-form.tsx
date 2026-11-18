"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { MAX_UPLOAD_BYTES } from "@/modules/studies/domain/ecg-study";
import { describeRejection } from "@/modules/studies/domain/study-errors";

import { uploadPdfStudyAction } from "../_actions/upload-pdf-study";
import { uploadStudyAction, type UploadStudyState } from "../_actions/upload-study";
import { STUDY_MESSAGES, savedMessage } from "../_lib/study-messages";
import { PdfDropzone } from "./pdf-dropzone";

interface UploadFormProps {
  // Solo lo envía un médico: el estudio queda a nombre de ese paciente. Un paciente no lo envía.
  patientId?: string;
  maxBytes: number;
}

type UploadFormat = "PDF" | "NPZ";
const controlClassName = "min-h-11 w-full rounded-control border border-input-border bg-card px-3 py-2 text-base text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";

export function UploadForm({ patientId, maxBytes }: UploadFormProps) {
  const [format, setFormat] = useState<UploadFormat>("PDF");

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="study-format" className="font-label text-sm font-medium text-foreground">Formato del archivo</label>
        <select id="study-format" value={format} onChange={(event) => setFormat(event.target.value === "NPZ" ? "NPZ" : "PDF")} className={controlClassName}>
          <option value="PDF">PDF Mortara</option>
          <option value="NPZ">NPZ (compatibilidad)</option>
        </select>
      </div>
      {/* Cambiar de formato descarta archivo y resultado previos, sin mezclar las acciones. */}
      <UploadFileForm key={format} format={format} patientId={patientId} maxBytes={Math.min(maxBytes, MAX_UPLOAD_BYTES)} />
    </div>
  );
}

function UploadFileForm({ format, patientId, maxBytes }: UploadFormProps & { format: UploadFormat }) {
  const [studyType, setStudyType] = useState("");
  const [tooLarge, setTooLarge] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const submit = async (previous: UploadStudyState, formData: FormData): Promise<UploadStudyState> => {
    setShowResult(true);
    if (formData.get("type") !== "ECG") {
      return { ok: false, code: "TYPE_UNSUPPORTED", message: describeRejection("TYPE_UNSUPPORTED") };
    }
    if (format === "PDF") {
      if (!selectedFile) {
        setSelectionError(selectionError ?? STUDY_MESSAGES.fileMissing);
        return undefined;
      }
      // Una sola fuente para drop y selector: reemplaza cualquier FileList nativo, sin duplicar archivos.
      formData.set("file", selectedFile);
    }
    const file = formData.get("file");
    if (file instanceof File && file.size > maxBytes) {
      return { ok: false, code: "FILE_TOO_LARGE", message: STUDY_MESSAGES.fileTooLarge };
    }
    try {
      return await (format === "PDF" ? uploadPdfStudyAction(previous, formData) : uploadStudyAction(previous, formData));
    } catch {
      // No mostramos detalles de transporte ni afirmamos que un envío interrumpido haya terminado.
      return { ok: false, code: "UNAVAILABLE", message: STUDY_MESSAGES.uploadUnavailable };
    }
  };
  const [state, action, isPending] = useActionState<UploadStudyState, FormData>(submit, undefined);
  useEffect(() => {
    if (!isPending && (selectionError || (showResult && state))) feedbackRef.current?.focus();
  }, [isPending, selectionError, showResult, state]);

  return (
    <form
      action={action}
      onSubmit={(event) => { if (isPending) event.preventDefault(); }}
      aria-busy={isPending}
      className="dashboard-context min-w-0"
    >
      {patientId ? <input type="hidden" name="patientId" value={patientId} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="study-type" className="font-label text-sm font-medium text-foreground">Tipo de estudio</label>
        <select id="study-type" name="type" required disabled={isPending} value={studyType} onChange={(event) => { setStudyType(event.target.value); setShowResult(false); }} className={controlClassName}>
          <option value="">Elegí un tipo de estudio</option>
          <option value="ECG">Electrocardiograma (ECG)</option>
        </select>
      </div>
      {format === "PDF" ? (
        <PdfDropzone selectedFile={selectedFile} error={selectionError} maxBytes={maxBytes} disabled={isPending} onChange={(file, error) => {
          setSelectedFile(file); setSelectionError(error); setShowResult(false);
        }} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="study-file" className="font-label text-sm font-medium text-foreground">Archivo del electrocardiograma</label>
          <input
            id="study-file" name="file" type="file" accept=".npz" required disabled={isPending}
            aria-describedby="study-file-hint"
            onChange={(event) => { setTooLarge((event.target.files?.[0]?.size ?? 0) > maxBytes); setShowResult(false); }}
            className={controlClassName}
          />
          <p id="study-file-hint" className="text-sm text-muted">Un archivo .npz de hasta 2 MB con la onda de 12 derivaciones (2500 muestras) y 7 variables ya estandarizadas.</p>
        </div>
      )}
      <div id="study-feedback" ref={feedbackRef} tabIndex={-1} aria-live="polite" className="flex flex-col gap-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
        {isPending ? <p role="status" className="text-sm text-muted">{STUDY_MESSAGES.uploadPending}</p> : null}
        {!isPending && selectionError ? <FormMessage tone="error">{selectionError}</FormMessage> : null}
        {!isPending && tooLarge ? <FormMessage tone="error">{STUDY_MESSAGES.fileTooLarge}</FormMessage> : null}
        {!isPending && showResult && state?.ok === true ? <FormMessage tone="success">{savedMessage(state.number)}</FormMessage> : null}
        {!isPending && showResult && !selectionError && state?.ok === false ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      </div>
      <div><SubmitButton pendingLabel="Enviando estudio…">Subir estudio</SubmitButton></div>
    </form>
  );
}
