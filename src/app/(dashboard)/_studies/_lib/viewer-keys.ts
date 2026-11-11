export type ViewerView = "ALL" | "SINGLE";

export type ViewerAction =
  | "PAN_LEFT"
  | "PAN_RIGHT"
  | "GO_START"
  | "GO_END"
  | "ZOOM_IN"
  | "ZOOM_OUT"
  | "ZOOM_RESET"
  | "PREVIOUS_LEAD"
  | "NEXT_LEAD"
  | "BACK_TO_ALL";

// Un Map (y no un objeto) para que claves como «constructor» o «__proto__» no se confundan con propiedades.
const SINGLE_VIEW_KEYS = new Map<string, ViewerAction>([
  ["ArrowLeft", "PAN_LEFT"],
  ["ArrowRight", "PAN_RIGHT"],
  ["Home", "GO_START"],
  ["End", "GO_END"],
  ["+", "ZOOM_IN"],
  ["=", "ZOOM_IN"],
  ["-", "ZOOM_OUT"],
  ["0", "ZOOM_RESET"],
  ["ArrowUp", "PREVIOUS_LEAD"],
  ["ArrowDown", "NEXT_LEAD"],
  ["Escape", "BACK_TO_ALL"],
]);

// Tecla → acción del visor (specs/007-visor-onda-ecg/contracts/viewer-ui.md). Las teclas solo actúan en la vista
// ampliada; en la de las 12 derivaciones todas devuelven null y el navegador conserva su comportamiento.
export function actionForKey(event: { key: string }, view: ViewerView): ViewerAction | null {
  if (view !== "SINGLE") {
    return null;
  }

  return SINGLE_VIEW_KEYS.get(event.key) ?? null;
}
