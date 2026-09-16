"use client";

/**
 * Ambient types for the Puter.js SDK loaded from js.puter.com/v2.
 * Only the surface used by JARVIS OS is declared.
 */

export interface PuterChatOptions {
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface PuterStreamPart {
  text?: string;
  message?: { content?: unknown };
  delta?: { content?: unknown };
}

export interface PuterSdk {
  ai: {
    chat(
      prompt: string,
      media: string | string[],
      testMode: boolean,
      options?: PuterChatOptions
    ): Promise<AsyncIterable<PuterStreamPart> | PuterStreamPart>;
    chat(
      messages: Array<{ role: string; content: unknown }>,
      testMode: boolean,
      options?: PuterChatOptions
    ): Promise<AsyncIterable<PuterStreamPart> | PuterStreamPart>;
    txt2img?(prompt: string): Promise<string | HTMLImageElement | { src?: string }>;
  };
}

declare global {
  interface Window {
    puter?: PuterSdk;
  }
}

export {};
