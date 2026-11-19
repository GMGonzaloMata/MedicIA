"use client";

import { useEffect, useRef, useState } from "react";

import { secondaryButtonClassName } from "@/components/form/button-styles";

import { STUDY_MESSAGES } from "../_lib/study-messages";

interface PdfDropzoneProps {
  selectedFile: File | null;
  error: string | null;
  maxBytes: number;
  disabled: boolean;
  onChange: (file: File | null, error: string | null) => void;
}

export function PdfDropzone({ selectedFile, error, maxBytes, disabled, onChange }: PdfDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);

  useEffect(() => {
    // Evita abrir el archivo si se suelta fuera del destino, solo mientras esta carga PDF está montada.
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);

  function selectFiles(files: File[]) {
    if (disabled || files.length === 0) return;
    const file = files[0];
    const message = files.length > 1 ? STUDY_MESSAGES.pdfMultiple
      : !/\.pdf$/i.test(file.name) ? STUDY_MESSAGES.pdfExtension
      : file.size === 0 ? STUDY_MESSAGES.fileMissing
      : file.size > maxBytes ? STUDY_MESSAGES.fileTooLarge : null;
    setIsRemoved(false);
    onChange(message ? null : file, message);
    // El archivo fuente vive en el formulario, no en FileList: permite volver a elegir el mismo PDF.
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section
      aria-label="Carga de PDF"
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={(event) => { event.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setIsDragging(false);
      }}
      onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectFiles(Array.from(event.dataTransfer.files)); }}
      className={`flex min-w-0 flex-col gap-3 rounded-panel border-2 border-dashed p-4 sm:p-6 ${isDragging && !disabled ? "border-primary bg-elevated" : "border-input-border bg-card"}`}
    >
      <label htmlFor="study-file" className="font-label text-sm font-medium text-foreground">Archivo del electrocardiograma</label>
      <p className="text-base font-medium text-foreground">{isDragging && !disabled ? "Soltá el PDF acá" : "Arrastrá un PDF o elegilo desde tu dispositivo"}</p>
      <input
        ref={inputRef} id="study-file" type="file" accept=".pdf" multiple disabled={disabled}
        aria-describedby={`study-file-hint pdf-availability${error ? " study-feedback" : ""}`}
        aria-invalid={error ? true : undefined}
        onChange={(event) => selectFiles(Array.from(event.target.files ?? []))}
        className="sr-only"
        tabIndex={-1}
      />
      <div aria-live="polite" aria-atomic="true" className="min-w-0 text-sm text-foreground">
        {selectedFile ? <><p className="break-words [overflow-wrap:anywhere] font-medium">{selectedFile.name}</p><p className="text-muted">{selectedFile.size.toLocaleString("es-AR")} bytes</p></> : <p>{isRemoved ? STUDY_MESSAGES.pdfRemoved : "Ningún PDF seleccionado."}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button ref={pickerRef} type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className={secondaryButtonClassName} aria-describedby={`study-file-hint pdf-availability${error ? " study-feedback" : ""}`}>
          {selectedFile ? "Reemplazar PDF" : "Elegir PDF"}
        </button>
        {selectedFile ? <button type="button" disabled={disabled} className={secondaryButtonClassName} onClick={() => {
          onChange(null, null); setIsRemoved(true);
          if (inputRef.current) inputRef.current.value = "";
          pickerRef.current?.focus();
        }}>Quitar PDF</button> : null}
      </div>
      <p id="study-file-hint" className="text-sm text-muted">{STUDY_MESSAGES.pdfFileHint}</p>
      <p id="pdf-availability" className="text-sm text-muted">{STUDY_MESSAGES.pdfNotEnabled}</p>
    </section>
  );
}
