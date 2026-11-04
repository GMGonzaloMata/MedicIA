import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sin los globales de Vitest, Testing Library no limpia el DOM entre pruebas por sí sola.
afterEach(cleanup);
