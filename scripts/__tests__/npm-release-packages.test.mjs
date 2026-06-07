// Project/App: gsd-pi
// File Purpose: Guard the npm release publish set against the drift that left
// @opengsd/cloud-mcp-gateway and @opengsd/daemon unpublished for two releases.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  getRequiredNpmPackageNames,
  getOrderedWorkspacePublishList,
  getEnginePackageNames,
  getRootPackageName,
} = require("../lib/npm-release-packages.cjs");

test("required npm set includes the previously-missing leaf packages", () => {
  const names = getRequiredNpmPackageNames();
  // The exact packages whose absence caused the broken releases.
  assert.ok(names.includes("@opengsd/cloud-mcp-gateway"), "cloud-mcp-gateway must be published");
  assert.ok(names.includes("@opengsd/daemon"), "daemon must be published");
});

test("required npm set = root + engines + every publishConfig workspace package", () => {
  const names = getRequiredNpmPackageNames();
  for (const expected of [
    getRootPackageName(),
    ...getEnginePackageNames(),
    "@opengsd/contracts",
    "@opengsd/rpc-client",
    "@opengsd/mcp-server",
    "@opengsd/cloud-mcp-gateway",
    "@opengsd/daemon",
  ]) {
    assert.ok(names.includes(expected), `${expected} must be in the required npm set`);
  }
});

test("bundled @gsd/* packages are NOT published", () => {
  const names = getRequiredNpmPackageNames();
  for (const bundled of [
    "@gsd/pi-coding-agent",
    "@gsd/pi-ai",
    "@gsd/pi-tui",
    "@gsd/agent-core",
    "@gsd/native",
  ]) {
    assert.ok(!names.includes(bundled), `${bundled} ships bundled and must not be published`);
  }
});

test("workspace packages are ordered so dependencies publish first", () => {
  const order = getOrderedWorkspacePublishList().map((p) => p.name);
  const idx = (name) => order.indexOf(name);
  // daemon depends on contracts, mcp-server, rpc-client
  assert.ok(idx("@opengsd/contracts") < idx("@opengsd/daemon"));
  assert.ok(idx("@opengsd/rpc-client") < idx("@opengsd/daemon"));
  assert.ok(idx("@opengsd/mcp-server") < idx("@opengsd/daemon"));
  // cloud-mcp-gateway depends on mcp-server; mcp-server depends on contracts + rpc-client
  assert.ok(idx("@opengsd/mcp-server") < idx("@opengsd/cloud-mcp-gateway"));
  assert.ok(idx("@opengsd/contracts") < idx("@opengsd/mcp-server"));
  assert.ok(idx("@opengsd/rpc-client") < idx("@opengsd/mcp-server"));
});
