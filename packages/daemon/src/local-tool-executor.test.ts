import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalToolExecutor } from "./local-tool-executor.js";
import type { SessionManager } from "./session-manager.js";
import type { ProjectInfo } from "./types.js";

test("local tool executor rejects unsupported user-controlled tool names", async () => {
  const executor = new LocalToolExecutor({} as SessionManager, async () => []);

  await assert.rejects(
    executor.execute("constructor", {}),
    /Unsupported forwarded GSD MCP tool: constructor/,
  );
});

test("local tool executor rejects unadvertised project paths", async () => {
  const executor = new LocalToolExecutor({} as SessionManager, async () => []);

  await assert.rejects(
    executor.execute("gsd_progress", { projectDir: "/tmp/not-advertised" }),
    /Project is not advertised by the Local GSD Runtime: \/tmp\/not-advertised/,
  );
});

test("local tool executor resolves project aliases from scanned projects", async () => {
  const project: ProjectInfo = {
    name: "allowed-project",
    path: "/tmp/allowed-project",
    markers: ["git"],
    lastModified: Date.now(),
  };
  let startedProjectDir: string | undefined;
  const executor = new LocalToolExecutor({
    startSession: async ({ projectDir }: { projectDir: string }) => {
      startedProjectDir = projectDir;
      return "session-1";
    },
  } as SessionManager, async () => [project]);

  await executor.execute("gsd_execute", {
    projectDir: "/tmp/not-advertised",
  }, "allowed-project");

  assert.equal(startedProjectDir, project.path);
});
