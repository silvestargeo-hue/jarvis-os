/**
 * Trending skill pack — 18 additional high-utility, keyless public APIs.
 * Installable in one click from the Skills Manager; also individually useful.
 * Every endpoint here is free, no auth, CORS-friendly.
 */

import type { SkillManifest } from "./index";

export const TRENDING_SKILLS: SkillManifest[] = [
  {
    id: "crypto-price",
    name: "Crypto Price",
    description:
      "Live cryptocurrency prices in any fiat currency (BTC, ETH, SOL, DOGE... vs USD, EUR, INR). Use for any crypto price question.",
    args: [
      { name: "ids", type: "string", description: "Coin id like 'bitcoin', 'ethereum', 'solana'", required: true },
      { name: "vs", type: "string", description: "Fiat currency code like 'usd' or 'inr'", required: false },
    ],
    execution: {
      type: "http",
      url: "https://api.coingecko.com/api/v3/simple/price?ids={{ids}}&vs_currencies={{vs}}",
      method: "GET",
      responsePath: "",
    },
  },
  {
    id: "iss-location",
    name: "ISS Tracker",
    description:
      "Current real-time position of the International Space Station (latitude/longitude and location context). Use when asked where the ISS is right now.",
    args: [],
    execution: {
      type: "http",
      url: "https://api.wheretheiss.at/v1/satellites/25544",
      method: "GET",
      responsePath: "",
    },
  },
  {
    id: "space-apod",
    name: "NASA Astronomy Picture",
    description:
      "NASA's Astronomy Picture of the Day with its explanation. Use for astronomy questions about today's picture or recent space imagery.",
    args: [{ name: "date", type: "string", description: "Optional date YYYY-MM-DD", required: false }],
    execution: {
      type: "http",
      url: "https://apod.ellanan.com/api?date={{date}}",
      method: "GET",
      responsePath: "",
    },
  },
  {
    id: "countries",
    name: "Country Facts",
    description:
      "Population, capital, currency, languages, region, flag and area for any country. Use for any 'tell me about <country>' question.",
    args: [{ name: "name", type: "string", description: "Country name, e.g. 'india' or 'japan'", required: true }],
    execution: {
      type: "http",
      url: "https://restcountries.com/v3.1/name/{{name}}",
      method: "GET",
    },
  },
  {
    id: "openlibrary",
    name: "Book Finder",
    description:
      "Search books by title or author — titles, authors, first-publish year. Use for book recommendations or 'who wrote X' questions.",
    args: [{ name: "title", type: "string", description: "Book title or keywords", required: true }],
    execution: {
      type: "http",
      url: "https://openlibrary.org/search.json?q={{title}}&limit=5",
      method: "GET",
      responsePath: "docs",
    },
  },
  {
    id: "arxiv",
    name: "Research Papers (arXiv)",
    description:
      "Search recent scientific papers on arXiv (AI, physics, math, CS). Use when the user asks for research or papers on a topic.",
    args: [{ name: "query", type: "string", description: "Research topic keywords", required: true }],
    execution: {
      type: "http",
      url: "http://export.arxiv.org/api/query?search_query=all:{{query}}&max_results=5",
      method: "GET",
    },
  },
  {
    id: "tvshows",
    name: "TV Show Info",
    description:
      "TV show details — genres, rating, summary, status, premiere. Use for questions about series/shows.",
    args: [{ name: "name", type: "string", description: "Show name, e.g. 'breaking bad'", required: true }],
    execution: {
      type: "http",
      url: "https://api.tvmaze.com/singlesearch/shows?q={{name}}",
      method: "GET",
      responsePath: "",
    },
  },
  {
    id: "recipes",
    name: "Recipe Finder",
    description:
      "Find recipes by main ingredient — titles, images, instructions links. Use when the user asks what to cook.",
    args: [{ name: "ingredient", type: "string", description: "Main ingredient, e.g. 'chicken'", required: true }],
    execution: {
      type: "http",
      url: "https://www.themealdb.com/api/json/v1/1/filter.php?i={{ingredient}}",
      method: "GET",
      responsePath: "meals",
    },
  },
  {
    id: "jokes",
    name: "Jokes",
    description:
      "Clean programming/general jokes. Use when the user asks for a joke or something funny.",
    args: [],
    execution: {
      type: "http",
      url: "https://official-joke-api.appspot.com/random_joke",
      method: "GET",
      responsePath: "",
    },
  },
  {
    id: "quotes",
    name: "Inspiring Quotes",
    description:
      "Random inspirational quote with author. Use when the user wants motivation or a quote.",
    args: [],
    execution: {
      type: "http",
      url: "https://zenquotes.io/api/random",
      method: "GET",
    },
  },
  {
    id: "translate",
    name: "Translator",
    description:
      "Translate text between 100+ languages. Use whenever the user asks to translate anything.",
    args: [
      { name: "text", type: "string", description: "Text to translate", required: true },
      { name: "lang", type: "string", description: "Target language code like 'ta', 'hi', 'es', 'fr'", required: true },
    ],
    execution: {
      type: "http",
      url: "https://api.mymemory.translated.net/get?q={{text}}&langpair=en|{{lang}}",
      method: "GET",
      responsePath: "responseData.translatedText",
    },
  },
  {
    id: "ipinfo",
    name: "IP / Network Info",
    description:
      "Look up any IP address or the caller's own IP — country, city, ISP, timezone. Use for network/IP questions.",
    args: [{ name: "ip", type: "string", description: "IP address, or 'self' for the user's own IP", required: false }],
    execution: {
      type: "http",
      url: "https://ipapi.co/{{ip}}/json/",
      method: "GET",
      responsePath: "",
    },
  },
  {
    id: "ducksearch",
    name: "Web Search (DuckDuckGo Instant Answers)",
    description:
      "Instant-answer web search for facts, definitions, calculations. Use when the user asks something answerable by a quick web lookup.",
    args: [{ name: "q", type: "string", description: "Search query", required: true }],
    execution: {
      type: "http",
      url: "https://api.duckduckgo.com/?q={{q}}&format=json&no_html=1",
      method: "GET",
      responsePath: "AbstractText",
    },
  },
  {
    id: "dogpics",
    name: "Dog Pictures",
    description: "Random dog photo by breed. Use when the user asks for dog pictures.",
    args: [{ name: "breed", type: "string", description: "Dog breed like 'retriever' (empty = random)", required: false }],
    execution: {
      type: "http",
      url: "https://dog.ceo/api/breed/{{breed}}/images/random",
      method: "GET",
    },
  },
  {
    id: "catfacts",
    name: "Cat Facts",
    description: "Random cat fact. Use when the user asks for a cat fact.",
    args: [],
    execution: {
      type: "http",
      url: "https://catfact.ninja/fact",
      method: "GET",
      responsePath: "fact",
    },
  },
  {
    id: "anime",
    name: "Anime Finder",
    description:
      "Anime details — synopsis, score, episodes, airing status. Use for anime questions.",
    args: [{ name: "q", type: "string", description: "Anime title", required: true }],
    execution: {
      type: "http",
      url: "https://api.jikan.moe/v4/anime?q={{q}}&limit=3",
      method: "GET",
    },
  },
  {
    id: "unitconvert",
    name: "Unit Converter",
    description:
      "Convert between units — length, weight, temperature, speed, data. Use for 'convert X km to miles' style asks.",
    args: [
      { name: "value", type: "number", description: "Numeric value to convert", required: true },
      { name: "from", type: "string", description: "Source unit symbol, e.g. 'km'", required: true },
      { name: "to", type: "string", description: "Target unit symbol, e.g. 'mi'", required: true },
    ],
    execution: {
      type: "http",
      url: "https://api.convertlib.com/convert?value={{value}}&from={{from}}&to={{to}}",
      method: "GET",
    },
  },
  {
    id: "timezones",
    name: "World Clock",
    description:
      "Current date-time in any IANA timezone (Asia/Kolkata, America/New_York...). Use for 'what time is it in X'.",
    args: [{ name: "zone", type: "string", description: "IANA zone, e.g. 'Asia/Kolkata'", required: true }],
    execution: {
      type: "http",
      url: "https://timeapi.io/api/Time/current/zone?timeZone={{zone}}",
      method: "GET",
      responsePath: "",
    },
  },
  {
    id: "npminfo",
    name: "npm Package Info",
    description:
      "Latest version, description, and stats for any npm package. Use for JS library questions.",
    args: [{ name: "package", type: "string", description: "npm package name, e.g. 'react'", required: true }],
    execution: {
      type: "http",
      url: "https://registry.npmjs.org/{{package}}/latest",
      method: "GET",
      responsePath: "",
    },
  },
];

const PACK_KEY = "jarvis.skills.trendingPackInstalled.v1";

export function trendingPackInstalled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(PACK_KEY) === "1";
}

export function markTrendingPackInstalled(): void {
  localStorage.setItem(PACK_KEY, "1");
}
