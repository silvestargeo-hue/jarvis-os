/**
 * Skill runner — how JARVIS decides to use skills and runs them.
 *
 * Flow per user message (called from AiTerminal before generation):
 *   1. FILTER   — enabled skills whose keywords/description plausibly match
 *   2. DECIDE   — the AI itself returns a JSON plan: which skill + arguments
 *   3. EXECUTE  — sandboxed fetch via executeSkill()
 *   4. INJECT   — results are appended to the system prompt as grounded data
 *
 * The AI is the decision-maker (so ANY installed skill works automatically,
 * even ones we've never seen), but the executor is sandboxed: it can only run
 * registered skills with declared args.
 */

import { executeSkill, listSkills, type SkillManifest } from "./index";
import { seedBuiltinSkills } from "./builtins";

export interface SkillRun {
  skillId: string;
  skillName: string;
  args: Record<string, string | number>;
  result: string;
  ok: boolean;
  error?: string;
}

let seeded = false;
export function ensureSkillsSeeded(): void {
  if (seeded) return;
  seedBuiltinSkills((s, src) => {
    // saveSkill lives in index.ts; avoid circular import by using dynamic call.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { saveSkill } = require("./index") as typeof import("./index");
    return saveSkill(s, src);
  });
  seeded = true;
}

/** Rough lexical pre-filter so we rarely spend a model call on obvious misses. */
function plausibleMatches(question: string, skills: SkillManifest[]): SkillManifest[] {
  const q = question.toLowerCase();
  return skills.filter((s) => {
    const words = s.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const descWords = s.description
      .toLowerCase()
      .match(/[a-z]{5,}/g)
      ?.slice(0, 24) ?? [];
    return words.some((w) => q.includes(w)) || descWords.some((w) => q.includes(w));
  });
}

/**
 * Ask the model which skill(s) to run. Returns [] when none apply.
 * Uses the same keyless/free model tier as chat (non-streaming, small).
 */
async function decideSkills(
  question: string,
  candidates: SkillManifest[],
  callModel: (messages: { role: "system" | "user" | "assistant"; content: string }[]) => Promise<string>
): Promise<Array<{ id: string; args: Record<string, string | number> }>> {
  if (!candidates.length) return [];
  const catalog = candidates
    .map(
      (s) =>
        `{"id":"${s.id}","args":[${s.args
          .map((a) => `{"name":"${a.name}","required":${a.required},"description":"${a.description.replace(/"/g, "'")}"}`)
          .join(",")}]}`
    )
    .join(",\n");

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a tool-use planner. Given a user request and a catalog of available skills, decide which skills to call. Respond with ONLY a JSON array (no markdown, no prose) like: [{\"id\":\"skillId\",\"args\":{\"argName\":\"value\"}}]. Include only skills genuinely needed. If none fit, respond [].",
    },
    {
      role: "user" as const,
      content: `User request: "${question}"\n\nSkill catalog:\n[${catalog}]\n\nJSON plan:`,
    },
  ];

  try {
    const raw = await callModel(messages);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const plan = JSON.parse(match[0]) as Array<{ id: string; args: Record<string, string | number> }>;
    return plan.filter((p) => p && typeof p.id === "string" && candidates.some((c) => c.id === p.id));
  } catch {
    return [];
  }
}

/** Execute one planned skill call. */
async function runOne(skill: SkillManifest, args: Record<string, string | number>): Promise<SkillRun> {
  // Fill missing required args with a sentinel so execution fails gracefully
  // instead of hitting the API with an empty interpolation.
  for (const a of skill.args) {
    if (a.required && (args[a.name] === undefined || args[a.name] === "")) {
      return { skillId: skill.id, skillName: skill.name, args, result: "", ok: false, error: `missing required arg '${a.name}'` };
    }
  }
  const res = await executeSkill(skill, args);
  return res.ok
    ? { skillId: skill.id, skillName: skill.name, args, result: res.result, ok: true }
    : { skillId: skill.id, skillName: skill.name, args, result: "", ok: false, error: res.error };
}

/**
 * Full auto-use pass for one user message.
 * `callModel` must provide a small non-streaming completion (any provider).
 * Returns executable results to inject into the chat prompt.
 */
export async function runSkillsForMessage(
  question: string,
  callModel: (messages: { role: "system" | "user" | "assistant"; content: string }[]) => Promise<string>
): Promise<{ runs: SkillRun[]; contextBlock: string }> {
  ensureSkillsSeeded();
  const enabled = listSkills().filter((s) => s.enabled !== false);
  if (!enabled.length) return { runs: [], contextBlock: "" };

  const candidates = plausibleMatches(question, enabled);
  if (!candidates.length) return { runs: [], contextBlock: "" };

  const plan = await decideSkills(question, candidates, callModel);
  if (!plan.length) return { runs: [], contextBlock: "" };

  const runs: SkillRun[] = [];
  for (const p of plan.slice(0, 3)) {
    const skill = candidates.find((c) => c.id === p.id);
    if (!skill) continue;
    runs.push(await runOne(skill, p.args ?? {}));
  }

  const okRuns = runs.filter((r) => r.ok);
  if (!okRuns.length) {
    const errs = runs.map((r) => `${r.skillName}: ${r.error}`).join("; ");
    return { runs, contextBlock: "" };
  }

  const contextBlock =
    "Live tool results (from the operator's installed skills — use these as ground truth):\n\n" +
    okRuns
      .map(
        (r) =>
          `[${r.skillName}] args=${JSON.stringify(r.args)}\n${r.result}`
      )
      .join("\n\n");

  return { runs, contextBlock };
}
