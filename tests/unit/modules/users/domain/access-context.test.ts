import { describe, expect, it } from "vitest";

import { ANONYMOUS_CONTEXT } from "@/modules/users/domain/access-context";

describe("ANONYMOUS_CONTEXT", () => {
  it("no lleva cuenta ni clínica", () => {
    expect(ANONYMOUS_CONTEXT).toEqual({ status: "anonymous" });
  });
});
