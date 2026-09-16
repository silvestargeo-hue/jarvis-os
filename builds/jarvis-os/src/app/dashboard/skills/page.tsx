"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Github,
  Loader2,
  PackagePlus,
  Puzzle,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  bulkImportSkills,
  installSkillFromUrl,
  listSkills,
  removeSkill,
  saveSkill,
  setSkillEnabled,
  validateSkill,
  type SkillManifest,
} from "@/lib/skills/index";
import { BUILTIN_SKILLS } from "@/lib/skills/builtins";
import { ensureSkillsSeeded } from "@/lib/skills/runner";
import { confirm as confirmSound, error as errorSound } from "@/lib/os/sounds";
import {
  TRENDING_SKILLS,
  markTrendingPackInstalled,
  trendingPackInstalled,
} from "@/lib/skills/trending";
import { ConvexGate } from "@/components/ConvexGate";

export default function SkillsPage() {
  return (
    <ConvexGate module="SKILLS MANAGER">
      <SkillsManager />
    </ConvexGate>
  );
}

function SkillsManager() {
  const [skills, setSkills] = useState<SkillManifest[]>([]);
  const [githubUrl, setGithubUrl] = useState("");
  const [pasteJson, setPasteJson] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    ensureSkillsSeeded();
    setSkills(listSkills());
  }, []);

  useEffect(refresh, [refresh]);

  const installTrendingPack = () => {
    let n = 0;
    for (const s of TRENDING_SKILLS) {
      const res = saveSkill(s, "builtin");
      if (res.ok) n++;
    }
    markTrendingPackInstalled();
    setNotice({ ok: true, text: `⚡ Trending Pack installed — ${n} new skills added. JARVIS uses them automatically.` });
    confirmSound();
    refresh();
  };

  const onBulkFile = (file: File) => {
    void file.text().then((text) => {
      const report = bulkImportSkills(text, "manual");
      const msg = `Imported ${report.installed.length} skill${report.installed.length === 1 ? "" : "s"}` +
        (report.failed.length ? ` · ${report.failed.length} invalid (${report.failed.slice(0, 3).map((f) => f.name).join(", ")}${report.failed.length > 3 ? "…" : ""})` : "");
      setNotice({ ok: report.installed.length > 0, text: msg });
      refresh();
    });
  };

  const importBulkText = () => {
    const report = bulkImportSkills(bulkText, "manual");
    const msg = `Imported ${report.installed.length} skill${report.installed.length === 1 ? "" : "s"}` +
      (report.failed.length ? ` · ${report.failed.length} invalid` : "");
    setNotice({ ok: report.installed.length > 0, text: msg });
    setBulkText("");
    refresh();
  };

  const installFromGithub = async () => {
    if (!githubUrl.trim()) return;
    setBusy(true);
    setNotice(null);
    const res = await installSkillFromUrl(githubUrl);
    setBusy(false);
    if (res.ok) {
      setNotice({ ok: true, text: `⚡ installed skill “${res.skill.name}” — JARVIS will use it automatically` });
      setGithubUrl("");
      refresh();
    } else {
      setNotice({ ok: false, text: res.error });
    }
  };

  const installFromPaste = () => {
    const check = validateSkill(pasteJson);
    if (!check.ok) {
      setNotice({ ok: false, text: check.error });
      return;
    }
    const save = saveSkill({ ...check.skill, source: "manual" }, "manual");
    if (save.ok) {
      setNotice({ ok: true, text: `⚡ installed skill “${check.skill.name}”` });
      setPasteJson("");
      refresh();
    } else {
      setNotice({ ok: false, text: save.error });
    }
  };

  return (
    <main className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-cyan-400/15 bg-slate-950/40 px-5 py-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="hud-btn !py-1 text-[10px]">◂ DECK</a>
          <p className="hud-label flex items-center gap-2">
            <Puzzle size={13} /> SKILLS MANAGER // AI TOOLBELT
          </p>
        </div>
        <p className="hidden font-mono text-[10px] text-cyan-400/60 sm:block">
          installed skills are auto-used by JARVIS when a request needs them
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {notice && (
          <p className={`mb-4 rounded-lg border p-3 font-mono text-xs ${notice.ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}`}>
            {notice.text}
          </p>
        )}

        {/* trending pack banner */}
        {!trendingPackInstalled() && (
          <div className="mb-4 rounded-lg border border-violet-400/30 bg-violet-400/10 p-4">
            <p className="font-mono text-xs text-violet-200">
              <b>TRENDING PACK</b> — 18 ready-made skills: Crypto, ISS Tracker, NASA APOD,
              Country Facts, Books, Research Papers, TV Shows, Recipes, Jokes, Quotes,
              Translator, IP Info, Web Search, Dogs, Cats, Anime, Unit Converter, World Clock,
              npm Info.
            </p>
            <button onClick={installTrendingPack} className="hud-btn mt-3 text-xs">
              <PackagePlus size={12} /> INSTALL ALL 18 (FREE, KEYLESS)
            </button>
          </div>
        )}

        {/* bulk import */}
        <div className="mb-4 rounded-lg border border-cyan-400/20 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-cyan-200">
              <b>BULK IMPORT</b> — load your own skills.md / JSON collection (300+ supported)
            </p>
            <button onClick={() => setShowBulk((v) => !v)} className="hud-btn !px-2 !py-1 text-[10px]">
              {showBulk ? "CLOSE" : "OPEN"}
            </button>
          </div>
          {showBulk && (
            <div className="mt-3 space-y-2">
              <label className="hud-btn inline-block cursor-pointer text-xs">
                <input
                  type="file"
                  accept=".md,.json,.txt,.ndjson"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onBulkFile(f);
                    e.target.value = "";
                  }}
                />
                CHOOSE FILE (skills.md)
              </label>
              <textarea
                className="h-24 w-full resize-none rounded-lg border border-cyan-400/30 bg-slate-950/60 px-3 py-2 font-mono text-[10px] text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
                placeholder="…or paste skill JSON array / NDJSON / fenced blocks here"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <button className="hud-btn text-xs" disabled={!bulkText.trim()} onClick={importBulkText}>
                <PackagePlus size={12} /> PARSE & INSTALL EVERYTHING VALID
              </button>
              <p className="font-mono text-[9px] leading-relaxed text-slate-500">
                Accepts: a JSON array of skills, one JSON object per line (NDJSON), or markdown
                with fenced json blocks. Invalid entries are skipped with a report — nothing
                breaks.
              </p>
            </div>
          )}
        </div>

        {/* install cards */}
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <div className="hud-panel p-4">
            <p className="hud-label mb-2 flex items-center gap-2 text-[10px]">
              <Github size={12} /> INSTALL FROM GITHUB
            </p>
            <input
              className="mb-2 w-full rounded-lg border border-cyan-400/30 bg-slate-950/60 px-3 py-2 font-mono text-[11px] text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
              placeholder="https://github.com/user/repo/blob/main/skill.json"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
            />
            <button className="hud-btn w-full justify-center text-xs" disabled={busy || !githubUrl.trim()} onClick={() => void installFromGithub()}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <PackagePlus size={12} />}
              FETCH & INSTALL
            </button>
            <p className="mt-2 font-mono text-[9px] leading-relaxed text-slate-500">
              Paste any raw JSON skill file URL (raw.githubusercontent, gist, or a github blob
              link — converted automatically). The file is strictly validated before install.
            </p>
          </div>

          <div className="hud-panel p-4">
            <p className="hud-label mb-2 flex items-center gap-2 text-[10px]">
              <Wand2 size={12} /> PASTE SKILL JSON
            </p>
            <textarea
              className="mb-2 h-[104px] w-full resize-none rounded-lg border border-cyan-400/30 bg-slate-950/60 px-3 py-2 font-mono text-[10px] text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
              placeholder='{"id":"crypto-price","name":"Crypto Price","description":"...","args":[{"name":"symbol","type":"string","required":true,"description":"e.g. bitcoin"}],"execution":{"type":"http","url":"https://api.coingecko.com/api/v3/simple/price?ids={{symbol}}&vs_currencies=usd","method":"GET"}}'
              value={pasteJson}
              onChange={(e) => setPasteJson(e.target.value)}
            />
            <button className="hud-btn w-full justify-center text-xs" disabled={!pasteJson.trim()} onClick={installFromPaste}>
              <PackagePlus size={12} /> VALIDATE & INSTALL
            </button>
          </div>
        </div>

        {/* skill list */}
        <p className="hud-label mb-2">INSTALLED SKILLS ({skills.length})</p>
        <div className="grid gap-2 md:grid-cols-2">
          {skills.map((s) => (
            <div key={s.id} className="hud-panel p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-mono text-xs text-cyan-100">{s.name}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[8px] font-mono uppercase ${
                      s.source === "builtin" ? "bg-cyan-400/15 text-cyan-300"
                      : s.source === "github" ? "bg-violet-400/15 text-violet-300"
                      : "bg-amber-400/15 text-amber-300"
                    }`}>
                      {s.source}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] leading-relaxed text-cyan-200/60">{s.description}</p>
                  {s.args.length > 0 && (
                    <p className="mt-1 font-mono text-[9px] text-slate-500">
                      args: {s.args.map((a) => a.name).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <button
                    onClick={() => {
                      setSkillEnabled(s.id, s.enabled === false);
                      refresh();
                    }}
                    className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[9px] transition ${
                      s.enabled === false
                        ? "bg-slate-700/40 text-slate-400 hover:text-cyan-300"
                        : "bg-emerald-400/15 text-emerald-300"
                    }`}
                  >
                    {s.enabled === false ? <>OFF</> : <><Check size={9} /> ON</>}
                  </button>
                  {!BUILTIN_SKILLS.some((b) => b.id === s.id) && (
                    <button
                      onClick={() => {
                        removeSkill(s.id);
                        refresh();
                      }}
                      className="rounded p-1 text-rose-300/60 hover:bg-rose-400/10 hover:text-rose-300"
                      title="Uninstall"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 rounded-lg border border-cyan-400/15 bg-cyan-400/5 p-3 font-mono text-[10px] leading-relaxed text-cyan-200/60">
          <b className="text-cyan-300">How auto-use works:</b> every message you send is matched
          against installed skills. When one fits, JARVIS extracts the arguments, executes the
          tool in a sandbox, and grounds its answer in the live result — zero clicks. Disable a
          skill to exclude it; uninstall anything you added. Built-ins can only be toggled.
        </p>
      </div>
    </main>
  );
}
