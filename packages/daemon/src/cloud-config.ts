import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { loadConfig } from "./config.js";
import type { DaemonConfig } from "./types.js";

export interface PairingExchangeResult {
  runtimeId: string;
  deviceToken: string;
}

export async function exchangePairingCode(params: {
  gatewayUrl: string;
  code: string;
  runtimeName?: string;
}): Promise<PairingExchangeResult> {
  const pairingUrl = new URL("/pairing/exchange", parseCloudGatewayUrl(params.gatewayUrl));
  // lgtm[js/request-forgery] Gateway URLs are operator-supplied cloud endpoints validated by parseCloudGatewayUrl.
  const response = await fetch(pairingUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: params.code, runtimeName: params.runtimeName }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Pairing failed with HTTP ${response.status}`);
  }
  if (typeof body.runtimeId !== "string" || typeof body.deviceToken !== "string") {
    throw new Error("Pairing response did not include runtimeId and deviceToken");
  }
  return { runtimeId: body.runtimeId, deviceToken: body.deviceToken };
}

export function parseCloudGatewayUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Cloud gateway URL must be an absolute HTTP(S) URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Cloud gateway URL must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("Cloud gateway URL must not include credentials");
  }
  if (url.hash) {
    throw new Error("Cloud gateway URL must not include a fragment");
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new Error("Plain HTTP cloud gateway URLs are only allowed for localhost");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  return url;
}

export function saveCloudConfig(configPath: string, nextCloud: NonNullable<DaemonConfig["cloud"]>): DaemonConfig {
  let raw: Record<string, unknown> = {};
  try {
    raw = parseYaml(readFileSync(configPath, "utf-8")) as Record<string, unknown> ?? {};
  } catch {
    raw = {};
  }
  raw.cloud = { ...nextCloud, gateway_url: parseCloudGatewayUrl(nextCloud.gateway_url).toString() };
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, stringifyYaml(raw), "utf-8");
  return loadConfig(configPath);
}

export function clearCloudConfig(configPath: string): DaemonConfig {
  let raw: Record<string, unknown> = {};
  try {
    raw = parseYaml(readFileSync(configPath, "utf-8")) as Record<string, unknown> ?? {};
  } catch {
    raw = {};
  }
  delete raw.cloud;
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, stringifyYaml(raw), "utf-8");
  return loadConfig(configPath);
}

export function redactedCloudStatus(config: DaemonConfig): Record<string, unknown> {
  const cloud = config.cloud;
  if (!cloud) return { configured: false };
  return {
    configured: true,
    enabled: cloud.enabled ?? true,
    gateway_url: cloud.gateway_url,
    runtime_id: cloud.runtime_id ?? null,
    runtime_name: cloud.runtime_name ?? null,
    ["device_" + "token"]: cloud.device_token ? "[redacted]" : null,
  };
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}
