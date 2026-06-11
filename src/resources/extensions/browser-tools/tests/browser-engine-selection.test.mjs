import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jiti = require("jiti")(__dirname, { interopDefault: true, debug: false });

const { resolveBrowserEngineMode, resolveBrowserEngineResolution } = jiti("../engine/selection.ts");

function makeProject({ webApp }) {
  const dir = mkdtempSync(join(tmpdir(), "gsd-engine-selection-"));
  const pkg = webApp ? { dependencies: { react: "^18.0.0" } } : { name: "cli-tool" };
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  return dir;
}

function makeFakeCli() {
  const dir = mkdtempSync(join(tmpdir(), "gsd-fake-cli-"));
  const cliPath = join(dir, "gsd-browser");
  writeFileSync(cliPath, "#!/bin/sh\n");
  return cliPath;
}

describe("resolveBrowserEngineMode", () => {
  it("accepts the explicit engine modes", () => {
    assert.equal(resolveBrowserEngineMode({ GSD_BROWSER_ENGINE: "gsd-browser" }), "gsd-browser");
    assert.equal(resolveBrowserEngineMode({ GSD_BROWSER_ENGINE: "legacy" }), "legacy");
    assert.equal(resolveBrowserEngineMode({ GSD_BROWSER_ENGINE: "off" }), "off");
  });

  it("accepts compatibility aliases", () => {
    assert.equal(resolveBrowserEngineMode({ GSD_BROWSER_ENGINE: "playwright" }), "legacy");
    assert.equal(resolveBrowserEngineMode({ GSD_BROWSER_ENGINE: "false" }), "off");
  });

  it("rejects unknown engine modes", () => {
    assert.throws(
      () => resolveBrowserEngineMode({ GSD_BROWSER_ENGINE: "surprise" }),
      /Expected "gsd-browser", "legacy", or "off"/,
    );
  });
});

describe("resolveBrowserEngineResolution", () => {
  it("explicit overrides resolve with env source and skip the probe", () => {
    const resolution = resolveBrowserEngineResolution({ GSD_BROWSER_ENGINE: "gsd-browser" });
    assert.equal(resolution.engine, "gsd-browser");
    assert.equal(resolution.source, "env");
  });

  it("defaults to legacy Playwright when no project root is known", () => {
    const resolution = resolveBrowserEngineResolution({});
    assert.equal(resolution.engine, "legacy");
    assert.equal(resolution.source, "probe");
  });

  it("keeps legacy Playwright for non-browser-facing projects", () => {
    const cliPath = makeFakeCli();
    const resolution = resolveBrowserEngineResolution(
      { GSD_BROWSER_CLI_PATH: cliPath },
      makeProject({ webApp: false }),
    );
    assert.equal(resolution.engine, "legacy");
    assert.match(resolution.reason, /not browser-facing/);
  });

  it("prefers the managed gsd-browser engine for web apps when the CLI is provable", () => {
    const cliPath = makeFakeCli();
    const resolution = resolveBrowserEngineResolution(
      { GSD_BROWSER_CLI_PATH: cliPath },
      makeProject({ webApp: true }),
    );
    assert.equal(resolution.engine, "gsd-browser");
    assert.equal(resolution.source, "probe");
    assert.match(resolution.reason, /web app detected/);
  });

  it("falls back to legacy Playwright with a recorded reason when the CLI is unavailable", () => {
    const resolution = resolveBrowserEngineResolution(
      { GSD_BROWSER_CLI_PATH: "/nonexistent/gsd-browser" },
      makeProject({ webApp: true }),
    );
    assert.equal(resolution.engine, "legacy");
    assert.equal(resolution.source, "probe");
    assert.match(resolution.reason, /falling back to legacy Playwright/);
  });
});
