import { describe, expect, it } from "vitest";

import { actionForKey } from "@/app/(dashboard)/_studies/_lib/viewer-keys";

describe("teclas del visor", () => {
  it.each([
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
  ])("en la vista ampliada, %s → %s", (key, action) => {
    expect(actionForKey({ key }, "SINGLE")).toBe(action);
  });

  it("en la vista de las 12 derivaciones ninguna tecla hace nada", () => {
    for (const key of ["ArrowLeft", "+", "-", "0", "ArrowUp", "Escape", "Home"]) {
      expect(actionForKey({ key }, "ALL")).toBeNull();
    }
  });

  it("ignora las demás teclas, incluidas Tab y las que son propiedades del objeto", () => {
    for (const key of ["Tab", "a", "Enter", " ", "constructor", "toString", "__proto__"]) {
      expect(actionForKey({ key }, "SINGLE")).toBeNull();
    }
  });
});
