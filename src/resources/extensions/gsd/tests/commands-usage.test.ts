import test from "node:test";
import assert from "node:assert/strict";

import {
  formatUsageReport,
  scanSessionTokenTotals,
  handleUsage,
} from "../commands-usage.ts";

test("scanSessionTokenTotals aggregates assistant usage and tool calls", () => {
  const totals = scanSessionTokenTotals([
    {
      type: "message",
      message: {
        role: "user",
      },
    },
    {
      type: "message",
      message: {
        role: "assistant",
        usage: {
          input: 1000,
          output: 200,
          cacheRead: 500,
          cacheWrite: 100,
          totalTokens: 1800,
          cost: { total: 0.05 },
        },
        content: [{ type: "toolCall" }, { type: "text" }],
      },
    },
  ]);

  assert.equal(totals.userMessages, 1);
  assert.equal(totals.assistantMessages, 1);
  assert.equal(totals.input, 1000);
  assert.equal(totals.output, 200);
  assert.equal(totals.cacheRead, 500);
  assert.equal(totals.cacheWrite, 100);
  assert.equal(totals.total, 1800);
  assert.equal(totals.cost, 0.05);
  assert.equal(totals.toolCalls, 1);
});

test("formatUsageReport shows context percent and remaining tokens", () => {
  const report = formatUsageReport({
    modelLabel: "claude-code/claude-sonnet-4-6",
    contextUsage: {
      tokens: 50_000,
      contextWindow: 200_000,
      percent: 25,
    },
    sessionTotals: scanSessionTokenTotals([]),
  });

  assert.match(report, /Model: claude-code\/claude-sonnet-4-6/);
  assert.match(report, /In context: 50\.0k tokens \(25\.0%\)/);
  assert.match(report, /Remaining: 150\.0k tokens/);
});

test("formatUsageReport explains unknown context after compaction", () => {
  const report = formatUsageReport({
    modelLabel: "openai/gpt-5",
    contextUsage: {
      tokens: null,
      contextWindow: 200_000,
      percent: null,
    },
    sessionTotals: scanSessionTokenTotals([]),
  });

  assert.match(report, /In context: unknown \(after compaction/);
});

test("handleUsage emits JSON when --json is passed", async () => {
  const messages: string[] = [];
  const ctx = {
    model: { provider: "claude-code", id: "claude-sonnet-4-6", contextWindow: 200_000 },
    getContextUsage: () => ({ tokens: 10_000, contextWindow: 200_000, percent: 5 }),
    sessionManager: { getEntries: () => [] },
    ui: {
      notify(message: string) {
        messages.push(message);
      },
    },
  };

  await handleUsage("--json", ctx as any);

  assert.equal(messages.length, 1);
  const parsed = JSON.parse(messages[0]!);
  assert.equal(parsed.model, "claude-code/claude-sonnet-4-6");
  assert.equal(parsed.contextUsage.tokens, 10_000);
  assert.equal(parsed.sessionTotals.input, 0);
});
