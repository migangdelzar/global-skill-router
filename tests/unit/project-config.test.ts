import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJsonPath = resolve(process.cwd(), "package.json");

describe("project runtime configuration", () => {
  it("targets Node 20 and uses Node 20 type declarations", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      engines?: { node?: string };
      devDependencies?: { "@types/node"?: string };
    };

    expect(packageJson.engines?.node).toBe(">=20.0.0 <21.0.0");
    expect(packageJson.devDependencies?.["@types/node"]).toMatch(/^\^20(?:\.|$)/);
  });
});
