/**
 * Browser Automation Engine resolution (ADR-037).
 *
 * The engine choice behind the canonical `browser_*` tools is a runtime
 * decision with a recorded reason, not a static default:
 *   - An explicit `GSD_BROWSER_ENGINE` override is honored verbatim.
 *   - Otherwise, browser-facing projects prefer the managed gsd-browser engine
 *     when the availability probe can prove a CLI exists, and fall back to
 *     legacy Playwright with the failure reason recorded.
 *   - Non-browser-facing projects keep legacy Playwright (browser tools are
 *     incidental there; the managed daemon is not worth its startup risk).
 */
import { resolveGsdBrowserCliAvailability } from "../../shared/gsd-browser-cli.js";
import { detectWebApp } from "../web-app-detect.js";

export type BrowserEngineMode = "gsd-browser" | "legacy" | "off";

export interface BrowserEngineResolution {
  engine: BrowserEngineMode;
  /** "env" = explicit GSD_BROWSER_ENGINE override; "probe" = default path decided by availability. */
  source: "env" | "probe";
  reason: string;
}

const probeResolutionByProjectRoot = new Map<string, BrowserEngineResolution>();

function parseExplicitEngineMode(raw: string): BrowserEngineMode {
  const normalized = raw.toLowerCase();
  if (normalized === "gsd-browser" || normalized === "gsd_browser" || normalized === "gsdbrowser") {
    return "gsd-browser";
  }
  if (normalized === "legacy" || normalized === "playwright") return "legacy";
  if (normalized === "off" || normalized === "none" || normalized === "disabled" || normalized === "0" || normalized === "false") {
    return "off";
  }

  throw new Error(`Invalid GSD_BROWSER_ENGINE="${raw}". Expected "gsd-browser", "legacy", or "off".`);
}

export function resolveBrowserEngineResolution(
  env: NodeJS.ProcessEnv = process.env,
  projectRoot?: string,
): BrowserEngineResolution {
  const raw = env.GSD_BROWSER_ENGINE?.trim();
  if (raw) {
    return { engine: parseExplicitEngineMode(raw), source: "env", reason: `GSD_BROWSER_ENGINE=${raw}` };
  }

  if (!projectRoot) {
    return { engine: "legacy", source: "probe", reason: "no project root to probe; using legacy Playwright" };
  }

  // The probe touches the filesystem (and at worst one short subprocess), so
  // the ambient-env resolution is cached per project root for process life.
  const cacheable = env === process.env;
  const cached = cacheable ? probeResolutionByProjectRoot.get(projectRoot) : undefined;
  if (cached) return cached;

  let resolution: BrowserEngineResolution;
  if (!detectWebApp(projectRoot)) {
    resolution = {
      engine: "legacy",
      source: "probe",
      reason: "project is not browser-facing; using legacy Playwright",
    };
  } else {
    const availability = resolveGsdBrowserCliAvailability(env);
    resolution = availability.available
      ? {
          engine: "gsd-browser",
          source: "probe",
          reason: `web app detected and managed gsd-browser engine available (${availability.detail})`,
        }
      : {
          engine: "legacy",
          source: "probe",
          reason: `web app detected but gsd-browser unavailable (${availability.detail}); falling back to legacy Playwright`,
        };
  }

  if (cacheable) probeResolutionByProjectRoot.set(projectRoot, resolution);
  return resolution;
}

export function resolveBrowserEngineMode(
  env: NodeJS.ProcessEnv = process.env,
  projectRoot?: string,
): BrowserEngineMode {
  return resolveBrowserEngineResolution(env, projectRoot).engine;
}

export function _resetBrowserEngineResolutionForTest(): void {
  probeResolutionByProjectRoot.clear();
}
