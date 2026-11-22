import "dotenv/config";
import http from "http";
import express from "express";
import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { GUIDE_CONTENT, GUIDE_LANGS } from "./src/data/guideContent.ts";
import type { GuideLang, GuideStepId } from "./src/data/guideContent.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const VALID_STEPS: GuideStepId[] = ["intro", "1", "2", "3", "4"];

const VOICE_STYLE_BY_LANG: Record<GuideLang, string> = {
  en: "Cute, sweet, cheerful young girl voice — warm, friendly, gentle, speaking clearly and steadily so fuel station workers can understand every step easily.",
  ar: "Cute, sweet, cheerful young woman's voice speaking natural Modern Standard Arabic — warm, gentle, encouraging, and crystal clear for station staff.",
  hi: "Cute, sweet, cheerful young Indian woman's voice speaking warm, friendly, crystal clear Hindi at an easy pace for station workers.",
  ur: "Cute, sweet, cheerful young woman's voice speaking warm, polite, crystal clear Urdu at an easy pace for station staff.",
  bn: "Cute, sweet, cheerful young Bengali woman's voice speaking warm, friendly, crystal clear Bengali at an easy pace for station workers."
};

// In-memory cache of generated WAV buffers so repeated plays are instant
const ttsCache = new Map<string, Buffer>();
const inflightRequests = new Map<string, Promise<Buffer>>();

function getGeminiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function callTts(
  lang: GuideLang,
  step: GuideStepId,
  opts: { apiVersion?: string; model: string; withSpeechMetadata: boolean; withSpeechConfig: boolean }
): Promise<Buffer> {
  const ai = getGeminiClient(opts.apiVersion);
  const scriptText = GUIDE_CONTENT[lang].scripts[step];
  const style = VOICE_STYLE_BY_LANG[lang];

  const part: Record<string, unknown> = opts.withSpeechMetadata
    ? { text: scriptText, speechMetadata: { style } }
    : { text: `Speak in a ${style}\n\nSay exactly:\n${scriptText}` };

  const config: Record<string, unknown> = {
    responseModalities: ["AUDIO"],
    ...(opts.withSpeechConfig
      ? {
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Zephyr" },
            },
          },
        }
      : {}),
  };

  const response = await ai.models.generateContent({
    model: opts.model,
    contents: [{ role: "user", parts: [part as any] }],
    config: config as any,
  });

  const base64Audio =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!base64Audio) {
    throw new Error("No audio data returned from Gemini TTS.");
  }
  return Buffer.from(base64Audio, "base64");
}

// Cache the attempt index that succeeded so subsequent requests don't repeat failed attempts
let preferredAttemptIdx = 0;

async function generateGuideSpeech(lang: GuideLang, step: GuideStepId): Promise<Buffer> {
  const cacheKey = `${lang}:${step}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const task = (async () => {
    const attempts = [
      { apiVersion: undefined, model: "gemini-3.8-flash-lite-tts", withSpeechMetadata: true, withSpeechConfig: true },
      { apiVersion: "v1alpha", model: "gemini-3.8-flash-lite-tts", withSpeechMetadata: true, withSpeechConfig: true },
      { apiVersion: "v1beta", model: "gemini-3.8-flash-lite-tts", withSpeechMetadata: false, withSpeechConfig: true },
      { apiVersion: undefined, model: "gemini-3.8-flash-lite-tts", withSpeechMetadata: false, withSpeechConfig: false },
      { apiVersion: "v1beta", model: "gemini-3.8-flash-tts", withSpeechMetadata: false, withSpeechConfig: true },
      { apiVersion: undefined, model: "gemini-3.8-flash-tts", withSpeechMetadata: false, withSpeechConfig: false },
    ];

    const order = [
      preferredAttemptIdx,
      ...attempts.map((_, i) => i).filter((i) => i !== preferredAttemptIdx),
    ];

    let lastErr: unknown;
    for (const idx of order) {
      const attempt = attempts[idx];
      try {
        const wavBuffer = await callTts(lang, step, attempt);
        preferredAttemptIdx = idx;
        ttsCache.set(cacheKey, wavBuffer);
        return wavBuffer;
      } catch (err: unknown) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (!/INVALID_ARGUMENT|Unknown name|NOT_FOUND|RESOURCE_EXHAUSTED|400|404|429/i.test(msg)) {
          throw err;
        }
      }
    }
    throw lastErr;
  })();

  inflightRequests.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/guide-voice", async (req: Request, res: Response) => {
    try {
      const langRaw = String(req.body?.lang || "en") as GuideLang;
      const stepRaw = String(req.body?.step || "1") as GuideStepId;

      if (!GUIDE_LANGS.includes(langRaw)) {
        res.status(400).json({ error: "Unsupported language selected." });
        return;
      }
      if (!VALID_STEPS.includes(stepRaw)) {
        res.status(400).json({ error: "Invalid guide step requested." });
        return;
      }

      const wavBuffer = await generateGuideSpeech(langRaw, stepRaw);
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(wavBuffer);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to generate guide voice.";
      console.error("TTS generation error:", err);
      const status =
        /PERMISSION_DENIED|API_KEY_INVALID|not configured/i.test(message)
          ? 403
          : /RESOURCE_EXHAUSTED|429/i.test(message)
          ? 429
          : 500;
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: process.env.DISABLE_HMR !== "true" ? { server: httpServer } : false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Build artifacts not found.");
      }
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Reben server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
