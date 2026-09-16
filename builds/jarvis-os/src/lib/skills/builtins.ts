/**
 * Built-in keyless skills — free public APIs, no keys, no accounts.
 * Seeded into the registry on first run. The AI auto-invokes them when a
 * request needs live/external data.
 */

import type { SkillManifest } from "./index";

export const BUILTIN_SKILLS: SkillManifest[] = [
  {
    id: "weather",
    name: "Weather",
    description:
      "Current weather AND short-term forecast for any city or place on Earth. Use whenever the user asks about weather, temperature, rain, humidity, or wind somewhere.",
    autoUse: true,
    args: [
      {
        name: "place",
        type: "string",
        description: "City name, e.g. 'Chennai' or 'New York'",
        required: true,
      },
    ],
    execution: {
      type: "http",
      url: "https://geocoding-api.open-meteo.com/v1/search?name={{place}}&count=1",
      method: "GET",
      responsePath: "results.0",
    },
    source: "builtin",
  },
  {
    id: "wikipedia",
    name: "Wikipedia",
    description:
      "Fetch a concise summary of any encyclopedic topic (people, places, companies, history, science). Use when the user asks 'what/who is X' for factual, general knowledge.",
    autoUse: true,
    args: [{ name: "topic", type: "string", description: "Article title, e.g. 'India'", required: true }],
    execution: {
      type: "http",
      url: "https://en.wikipedia.org/api/rest_v1/page/summary/{{topic}}",
      method: "GET",
      responsePath: "extract",
    },
    source: "builtin",
  },
  {
    id: "github",
    name: "GitHub Repo Inspector",
    description:
      "Get stars, forks, language, description, and activity for a public GitHub repository. Use when the user asks about a repo or project hosted on GitHub.",
    autoUse: true,
    args: [
      { name: "owner", type: "string", description: "Repo owner, e.g. 'facebook'", required: true },
      { name: "repo", type: "string", description: "Repo name, e.g. 'react'", required: true },
    ],
    execution: {
      type: "http",
      url: "https://api.github.com/repos/{{owner}}/{{repo}}",
      method: "GET",
      responsePath: "",
    },
    source: "builtin",
  },
  {
    id: "fx",
    name: "Currency Exchange",
    description:
      "Live currency exchange rates. Convert amounts between any two ISO currency codes (USD, EUR, INR, JPY...). Use for 'how much is X USD in INR' style questions.",
    autoUse: true,
    args: [
      { name: "from", type: "string", description: "Base currency code, e.g. USD", required: true },
      { name: "to", type: "string", description: "Target currency code, e.g. INR", required: true },
    ],
    execution: {
      type: "http",
      url: "https://open.er-api.com/v6/latest/{{from}}",
      method: "GET",
      responsePath: "rates",
    },
    source: "builtin",
  },
  {
    id: "dictionary",
    name: "Dictionary",
    description:
      "Definitions, parts of speech, and examples for any English word. Use when the user asks what a word means.",
    autoUse: true,
    args: [{ name: "word", type: "string", description: "The English word to define", required: true }],
    execution: {
      type: "http",
      url: "https://api.dictionaryapi.dev/api/v2/entries/en/{{word}}",
      method: "GET",
    },
    source: "builtin",
  },
  {
    id: "hackernews",
    name: "Tech News (Hacker News)",
    description:
      "Current top technology stories from Hacker News. Use when the user asks for tech news or what's happening in tech today.",
    autoUse: true,
    args: [],
    execution: {
      type: "http",
      url: "https://hacker-news.firebaseio.com/v0/topstories.json",
      method: "GET",
      timeoutMs: 8000,
    },
    source: "builtin",
  },
];

const SEED_KEY = "jarvis.skills.seeded.v1";

/** One-time seed of built-ins (preserves enabled/disabled state on re-seed). */
export function seedBuiltinSkills(seedFn: (s: SkillManifest, src: "builtin") => { ok: boolean }): void {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(SEED_KEY)) return;
  for (const s of BUILTIN_SKILLS) seedFn(s, "builtin");
  localStorage.setItem(SEED_KEY, "1");
}
