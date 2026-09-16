/**
 * JARVIS Skills — extensible AI capabilities.
 *
 * A skill is a small, sandboxed tool the AI can call automatically when a
 * request needs it. Skills come from three sources:
 *   BUILT-IN  — shipped with the app (weather, wiki, github, fx, dict, hn)
 *   GITHUB    — pasted raw URL to a JSON skill file (auto-fetched + validated)
 *   MANUAL    — pasted JSON, stored locally
 *
 * Security model: skills run client-side in a restricted fetch executor —
 * GET/POST only, size/time capped, response truncated. Manifests are strictly
 * validated at import; anything malformed is rejected. The AI never sees raw
 * network access — only named skills with typed parameters.
 */

export type HttpMethod = "GET" | "POST";

export interface SkillArg {
  name: string;
  type: "string" | "number";
  description: string;
  required: boolean;
}

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  /** When true the runner auto-invokes this skill without asking. */
  autoUse?: boolean;
  args: SkillArg[];
  execution: {
    type: "http";
    url: string; // may reference {{argName}} placeholders
    method: HttpMethod;
    headers?: Record<string, string>;
    /** JSON body template for POST — values reference {{argName}}. */
    body?: Record<string, string>;
    /** Dot-path to extract the useful payload (e.g. "current.temperature_2m"). */
    responsePath?: string;
    timeoutMs?: number;
  };
  source?: "builtin" | "github" | "manual";
  installedAt?: number;
  enabled?: boolean;
}

// ── Validation ───────────────────────────────────────────────────────────────

const MAX_ARGS = 8;

export function validateSkill(raw: unknown): { ok: true; skill: SkillManifest } | { ok: false; error: string } {
  try {
    const s = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
    if (!s || typeof s !== "object") return { ok: false, error: "not a JSON object" };

    const id = String(s.id ?? "").trim();
    const name = String(s.name ?? "").trim();
    const description = String(s.description ?? "").trim();
    if (!/^[a-z0-9][a-z0-9-_]{1,40}$/i.test(id)) return { ok: false, error: "id must be 2-40 chars [a-z0-9-_]" };
    if (!name || name.length > 60) return { ok: false, error: "name required (≤60 chars)" };
    if (!description || description.length > 400) return { ok: false, error: "description required (≤400 chars)" };

    const ex = s.execution as Record<string, unknown> | undefined;
    if (!ex || typeof ex !== "object") return { ok: false, error: "execution object required" };
    if (ex.type !== "http") return { ok: false, error: "only execution.type 'http' is supported" };

    let url: URL;
    try {
      url = new URL(String(ex.url));
    } catch {
      return { ok: false, error: "execution.url must be a valid absolute URL" };
    }
    if (!["http:", "https:"].includes(url.protocol)) return { ok: false, error: "url must be http(s)" };

    const method = String(ex.method ?? "GET").toUpperCase();
    if (!["GET", "POST"].includes(method)) return { ok: false, error: "method must be GET or POST" };

    const argsRaw = Array.isArray(s.args) ? s.args : [];
    if (argsRaw.length > MAX_ARGS) return { ok: false, error: `max ${MAX_ARGS} args` };
    const args: SkillArg[] = argsRaw.map((a: any) => ({
      name: String(a?.name ?? "").trim(),
      type: a?.type === "number" ? "number" : "string",
      description: String(a?.description ?? "").slice(0, 200),
      required: Boolean(a?.required),
    }));
    const argNames = new Set<string>();
    for (const a of args) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,30}$/.test(a.name)) return { ok: false, error: `bad arg name: ${a.name}` };
      if (argNames.has(a.name)) return { ok: false, error: `duplicate arg: ${a.name}` };
      argNames.add(a.name);
    }
    // url/body can only reference declared args (no surprise interpolation).
    const referenced = [...String(ex.url).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    for (const r of referenced) {
      if (!argNames.has(r)) return { ok: false, error: `url references undeclared arg {{${r}}}` };
    }
    if (ex.body && typeof ex.body === "object") {
      for (const v of Object.values(ex.body as Record<string, unknown>)) {
        for (const m of String(v).matchAll(/\{\{(\w+)\}\}/g)) {
          if (!argNames.has(m[1])) return { ok: false, error: `body references undeclared arg {{${m[1]}}}` };
        }
      }
    }

    const skill: SkillManifest = {
      id,
      name,
      description,
      autoUse: s.autoUse !== false,
      args,
      execution: {
        type: "http",
        url: String(ex.url),
        method: method as HttpMethod,
        headers: (ex.headers as Record<string, string> | undefined) ?? undefined,
        body: (ex.body as Record<string, string> | undefined) ?? undefined,
        responsePath: typeof ex.responsePath === "string" ? ex.responsePath : undefined,
        timeoutMs: typeof ex.timeoutMs === "number" ? Math.min(ex.timeoutMs, 15_000) : 10_000,
      },
    };
    return { ok: true, skill };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid skill JSON" };
  }
}

// ── Registry (localStorage-backed) ───────────────────────────────────────────

const REGISTRY_KEY = "jarvis.skills.v1";

function readRegistry(): Record<string, SkillManifest> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SkillManifest>;
    // Drop anything that no longer validates (schema may have evolved).
    const valid: Record<string, SkillManifest> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const check = validateSkill(v);
      if (check.ok) valid[k] = { ...check.skill, source: v.source ?? "manual", enabled: v.enabled !== false };
    }
    return valid;
  } catch {
    return {};
  }
}

function writeRegistry(reg: Record<string, SkillManifest>): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
}

export function listSkills(): SkillManifest[] {
  return Object.values(readRegistry());
}

export function getSkill(id: string): SkillManifest | null {
  return readRegistry()[id] ?? null;
}

export function saveSkill(skill: SkillManifest, source: SkillManifest["source"]): { ok: true } | { ok: false; error: string } {
  const check = validateSkill(skill);
  if (!check.ok) return check;
  const reg = readRegistry();
  reg[check.skill.id] = {
    ...check.skill,
    source,
    enabled: skill.enabled !== false,
    installedAt: skill.installedAt ?? Date.now(),
  };
  writeRegistry(reg);
  return { ok: true };
}

export function removeSkill(id: string): void {
  const reg = readRegistry();
  delete reg[id];
  writeRegistry(reg);
}

export function setSkillEnabled(id: string, enabled: boolean): void {
  const reg = readRegistry();
  if (reg[id]) {
    reg[id].enabled = enabled;
    writeRegistry(reg);
  }
}

/**
 * Install from a GitHub URL. Accepts:
 *   - raw file URLs (raw.githubusercontent.com, gist raw)
 *   - github.com blob URLs (converted to raw automatically)
 */
export async function installSkillFromUrl(rawUrl: string): Promise<{ ok: true; skill: SkillManifest } | { ok: false; error: string }> {
  try {
    let url = rawUrl.trim();
    // github.com/user/repo/blob/branch/path → raw
    const blob = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (blob) url = `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`;
    // gist.github.com/user/<id> → raw
    const gist = url.match(/^https?:\/\/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)$/);
    if (gist) url = `https://gist.githubusercontent.com/${gist[1]}/raw`;

    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return { ok: false, error: `fetch failed: HTTP ${res.status}` };
    const text = await res.text();
    const check = validateSkill(text);
    if (!check.ok) return check;
    const save = saveSkill({ ...check.skill, source: "github" }, "github");
    return save.ok ? { ok: true, skill: { ...check.skill, source: "github" } } : { ok: false, error: save.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "install failed" };
  }
}

// ── Bulk import (skills.md, JSON files, NDJSON) ────────────────────────────

export interface BulkImportReport {
  installed: string[];
  failed: Array<{ name: string; error: string }>;
  skipped: number;
}

/**
 * Extract every plausible JSON object from a mixed-format document.
 * Handles: fenced ```json blocks, a bare JSON array, NDJSON lines, and
 * objects embedded in markdown bullet lists — the shapes a skills.md file
 * realistically uses.
 */
function extractJsonObjects(text: string): unknown[] {
  const out: unknown[] = [];
  const tryParse = (s: string): unknown | undefined => {
    try {
      const v = JSON.parse(s);
      return v;
    } catch {
      return undefined;
    }
  };

  // 1. fenced code blocks
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  for (const f of fences) {
    const v = tryParse(f[1].trim());
    if (v !== undefined) out.push(v);
  }

  // 2. whole document as JSON (array or object)
  if (out.length === 0) {
    const v = tryParse(text.trim());
    if (v !== undefined) out.push(v);
  }

  // 3. line-by-line NDJSON / bullets containing {...}
  for (const line of text.split("\n")) {
    const brace = line.match(/\{[\s\S]*\}/);
    if (!brace) continue;
    const v = tryParse(brace[0]);
    if (v !== undefined) out.push(v);
  }

  // Flatten arrays into objects.
  return out.flatMap((v) => (Array.isArray(v) ? v : [v]));
}

/**
 * Bulk-install skills from pasted text or a file's contents.
 * Every object that validates as a skill is installed; the rest are reported.
 */
export function bulkImportSkills(
  text: string,
  source: SkillManifest["source"] = "manual"
): BulkImportReport {
  const report: BulkImportReport = { installed: [], failed: [], skipped: 0 };
  const candidates = extractJsonObjects(text);
  const seen = new Set<string>();

  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") {
      report.skipped++;
      continue;
    }
    const check = validateSkill(raw);
    if (!check.ok) {
      const name = String((raw as any).id ?? (raw as any).name ?? "unnamed");
      if (seen.has(name)) continue;
      seen.add(name);
      report.failed.push({ name, error: check.error });
      continue;
    }
    if (seen.has(check.skill.id)) continue;
    seen.add(check.skill.id);
    const save = saveSkill({ ...check.skill, source }, source);
    if (save.ok) report.installed.push(check.skill.name);
    else report.failed.push({ name: check.skill.id, error: save.error });
  }
  return report;
}

// ── Execution (sandboxed) ────────────────────────────────────────────────────

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function interpolate(template: string, args: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    args[name] !== undefined ? encodeURIComponent(String(args[name])) : ""
  );
}

export async function executeSkill(
  skill: SkillManifest,
  args: Record<string, string | number>
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  try {
    const ex = skill.execution;
    const url = interpolate(ex.url, args);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ex.timeoutMs ?? 10_000);

    const init: RequestInit = {
      method: ex.method,
      signal: controller.signal,
      headers: { ...(ex.headers ?? {}) },
    };
    if (ex.method === "POST" && ex.body) {
      init.headers = { ...init.headers, "Content-Type": "application/json" };
      init.body = JSON.stringify(
        Object.fromEntries(Object.entries(ex.body).map(([k, v]) => [k, interpolate(String(v), args)]))
      );
    }

    const res = await fetch(url, init);
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} from ${new URL(url).host}` };

    const text = await res.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      /* plain-text response is fine */
    }
    let value = ex.responsePath ? getPath(payload, ex.responsePath) : payload;
    if (value === undefined) value = payload;

    // Truncate so a runaway response never floods the model context.
    const result = typeof value === "string" ? value : JSON.stringify(value, null, 1);
    return { ok: true, result: result.slice(0, 4000) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "execution failed" };
  }
}
