import { describe, expect, it } from "vitest";

import { createS3Client } from "@/infrastructure/aws/s3/s3-client";

describe("cliente de S3", () => {
  it("se construye con la región configurada y sin credenciales en el código", async () => {
    const client = createS3Client({ region: "sa-east-1" });

    expect(await client.config.region()).toBe("sa-east-1");
  });
});
