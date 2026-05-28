import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeSessionContext,
  buildContextBreakdown,
  formatContextReport,
  parseSystemPromptSections,
} from "../commands-context.ts";

const PROVIDER = "openai" as const;

test("parseSystemPromptSections splits pi base, skills catalog, and GSD blocks", () => {
  const systemPrompt = [
    "You are Pi.",
    "<available_skills>",
    "  <skill><name>frontend-design</name><description>UI</description></skill>",
    "  <skill><name>tdd</name><description>Tests</description></skill>",
    "</available_skills>",
    "[SYSTEM CONTEXT — GSD]",
    "GSD core instructions here.",
    "GSD Skill Preferences",
    "prefer_skills: [\"tdd\"]",
    "[KNOWLEDGE — Rules from KNOWLEDGE.md]",
    "Always write tests.",
    "[PROJECT CODEBASE — File structure]",
    "src/index.ts",
  ].join("\n");

  const sections = parseSystemPromptSections(systemPrompt, PROVIDER);
  const labels = sections.map((section) => section.label);

  assert.ok(labels.includes("Pi base prompt"));
  assert.ok(labels.includes("Available skills catalog"));
  assert.ok(labels.includes("GSD system prompt"));
  assert.ok(labels.includes("Skill preferences"));
  assert.ok(labels.includes("Knowledge rules"));
  assert.ok(labels.includes("Codebase map"));

  const skills = sections.find((section) => section.label === "Available skills catalog");
  assert.equal(skills?.detail, "2 skills");
});

test("analyzeSessionContext buckets injections, tool results, and loaded skills", () => {
  const result = analyzeSessionContext([
    {
      type: "message",
      message: {
        role: "custom",
        customType: "gsd-memory",
        content: "Memory block about auth patterns",
      },
    },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            name: "read",
            arguments: { path: "/home/user/.agents/skills/tdd/SKILL.md" },
          },
          {
            type: "toolCall",
            name: "subagent",
            arguments: { task: "scout the repo" },
          },
        ],
      },
    },
    {
      type: "message",
      message: {
        role: "toolResult",
        content: "skill file contents here",
      },
    },
  ], PROVIDER);

  assert.ok(result.conversationSections.some((section) => section.label === "Memory injection"));
  assert.ok(result.conversationSections.some((section) => section.label === "Tool results"));
  assert.deepEqual(result.skills.loaded, ["tdd"]);
  assert.equal(result.subagentSpawns, 1);
});

test("formatContextReport lists skills and subagents", () => {
  const report = buildContextBreakdown({
    modelLabel: "claude-code/claude-sonnet-4-6",
    provider: "claude-code",
    contextUsage: { tokens: 80_000, contextWindow: 200_000, percent: 40 },
    systemPrompt: [
      "Pi base",
      "<available_skills><skill><name>review</name></skill></available_skills>",
      "[SYSTEM CONTEXT — GSD]",
      "core",
    ].join("\n"),
    entries: [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "subagent", arguments: {} }],
        },
      },
    ],
  });

  const output = formatContextReport(report);
  assert.match(output, /Context Breakdown/);
  assert.match(output, /Available \(1\): review/);
  assert.match(output, /Subagent spawns this session: 1/);
});

test("buildContextBreakdown supports --json shape via handleContext data", () => {
  const report = buildContextBreakdown({
    modelLabel: null,
    provider: PROVIDER,
    contextUsage: undefined,
    systemPrompt: "",
    entries: [],
  });

  assert.deepEqual(report.skills, {
    available: [],
    loaded: [],
    prefer: [],
    avoid: [],
  });
  assert.equal(report.subagentSpawns, 0);
});
