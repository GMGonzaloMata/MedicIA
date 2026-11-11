interface SelectFieldProps {
  id: string;
  name: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  // Controlado (con `onChange`) o no (con `defaultValue`).
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  errors?: string[];
}

// Lista desplegable con etiqueta y error, con el mismo aspecto que `FormField`. Usa el control nativo: funciona
// con teclado y lectores de pantalla sin trabajo extra.
export function SelectField({ id, name, label, options, value, defaultValue, onChange, errors }: SelectFieldProps) {
  const hasErrors = errors !== undefined && errors.length > 0;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-label text-sm font-medium text-foreground">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        aria-invalid={hasErrors || undefined}
        aria-describedby={hasErrors ? errorId : undefined}
        className="min-h-11 w-full rounded-control border border-input-border bg-card px-3 text-base text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring aria-[invalid=true]:border-danger"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hasErrors ? (
        <p id={errorId} className="text-sm text-danger">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
