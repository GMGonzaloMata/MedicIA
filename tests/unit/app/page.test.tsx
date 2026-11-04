import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "@/app/page";

test("la página principal muestra su título", () => {
  render(<Home />);

  expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
});
