import "dotenv/config";
import crypto from "crypto";
import http from "http";
import express from "express";
import type { NextFunction, Request, Response } from "express";
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

const DATA_DIR = path.resolve(__dirname, ".data");
const KEYPAIR_FILE = path.join(DATA_DIR, "license-keypair.json");
const SELLER_AUTH_FILE = path.join(DATA_DIR, "seller-auth.json");
const SELLER_CONFIG_FILE = path.join(DATA_DIR, "seller-config.json");
const SESSION_SECRET = process.env.LICENSE_SESSION_SECRET
  ? Buffer.from(process.env.LICENSE_SESSION_SECRET, "utf8")
  : crypto.randomBytes(32);

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

interface StoredKeypair {
  kid: string;
  privateJwk: crypto.JsonWebKey;
  publicJwk: crypto.JsonWebKey;
}

let cachedKeypair: StoredKeypair | null = null;

function getLicenseKeypair(): StoredKeypair {
  if (cachedKeypair) return cachedKeypair;

  const envPriv = (process.env.LICENSE_PRIVATE_KEY || "").trim();
  if (envPriv) {
    let privateKeyObj: crypto.KeyObject;
    if (envPriv.startsWith("{")) {
      privateKeyObj = crypto.createPrivateKey({ key: JSON.parse(envPriv), format: "jwk" });
    } else {
      privateKeyObj = crypto.createPrivateKey(envPriv);
    }
    const publicKeyObj = crypto.createPublicKey(privateKeyObj);
    const privateJwk = privateKeyObj.export({ format: "jwk" }) as crypto.JsonWebKey;
    const publicJwk = publicKeyObj.export({ format: "jwk" }) as crypto.JsonWebKey;
    const kid = crypto
      .createHash("sha256")
      .update(`${publicJwk.x || ""}.${publicJwk.y || ""}`)
      .digest("hex")
      .slice(0, 8)
      .toUpperCase();
    cachedKeypair = { kid, privateJwk, publicJwk };
    return cachedKeypair;
  }

  ensureDataDir();
  if (fs.existsSync(KEYPAIR_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(KEYPAIR_FILE, "utf8")) as StoredKeypair;
      if (parsed?.privateJwk && parsed?.publicJwk && parsed?.kid) {
        cachedKeypair = parsed;
        return cachedKeypair;
      }
    } catch {
      // Regenerate if unreadable
    }
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const privateJwk = privateKey.export({ format: "jwk" }) as crypto.JsonWebKey;
  const publicJwk = publicKey.export({ format: "jwk" }) as crypto.JsonWebKey;
  const kid = crypto
    .createHash("sha256")
    .update(`${publicJwk.x || ""}.${publicJwk.y || ""}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();

  const created: StoredKeypair = { kid, privateJwk, publicJwk };
  fs.writeFileSync(KEYPAIR_FILE, JSON.stringify(created, null, 2), { mode: 0o600 });
  cachedKeypair = created;
  return cachedKeypair;
}

function hashSellerPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyScryptPassword(password: string, salt: string, expectedHex: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getSellerAuthStatus(): { configured: boolean; envManaged: boolean } {
  const envPw = (process.env.SELLER_ADMIN_PASSWORD || "").trim();
  if (envPw) return { configured: true, envManaged: true };
  if (fs.existsSync(SELLER_AUTH_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SELLER_AUTH_FILE, "utf8")) as { salt?: string; hash?: string };
      if (parsed?.salt && parsed?.hash) return { configured: true, envManaged: false };
    } catch {}
  }
  return { configured: false, envManaged: false };
}

function verifySellerPassword(inputPassword: string): boolean {
  const envPw = (process.env.SELLER_ADMIN_PASSWORD || "").trim();
  if (envPw) {
    return constantTimeStringEqual(inputPassword, envPw);
  }
  if (!fs.existsSync(SELLER_AUTH_FILE)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(SELLER_AUTH_FILE, "utf8")) as { salt?: string; hash?: string };
    if (!parsed?.salt || !parsed?.hash) return false;
    return verifyScryptPassword(inputPassword, parsed.salt, parsed.hash);
  } catch {
    return false;
  }
}

function issueSellerToken(): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
  const payloadB64 = Buffer.from(JSON.stringify({ role: "seller", exp: expiresAt }), "utf8").toString("base64url");
  const sigB64 = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
  return { token: `${payloadB64}.${sigB64}`, expiresAt };
}

function verifySellerToken(token: string): boolean {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest();
  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(sigB64, "base64url");
  } catch {
    return false;
  }
  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as { role?: string; exp?: number };
    return parsed?.role === "seller" && typeof parsed.exp === "number" && Date.now() < parsed.exp;
  } catch {
    return false;
  }
}

function requireSellerAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match || !verifySellerToken(match[1])) {
    res.status(401).json({ error: "Seller authentication required." });
    return;
  }
  next();
}

function normalizeMasterSheetUrl(rawInput: string): string {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) return "";
  if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/i.test(trimmed)) {
    return trimmed;
  }
  if (!/^https?:/i.test(trimmed) && /^[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
    return `https://script.google.com/macros/s/${trimmed}/exec`;
  }
  return "";
}

interface SellerRuntimeConfig {
  masterSheetUrl: string;
  sellerWhatsApp: string;
}

function getSellerRuntimeConfig(): SellerRuntimeConfig {
  let fileCfg: Partial<SellerRuntimeConfig> = {};
  if (fs.existsSync(SELLER_CONFIG_FILE)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(SELLER_CONFIG_FILE, "utf8")) as Partial<SellerRuntimeConfig>;
    } catch {}
  }
  const envSheet = normalizeMasterSheetUrl(process.env.VITE_LICENSE_SHEET_URL || "");
  return {
    masterSheetUrl: envSheet || normalizeMasterSheetUrl(fileCfg.masterSheetUrl || ""),
    sellerWhatsApp: String(fileCfg.sellerWhatsApp || "").replace(/[^\d]/g, "").slice(0, 20),
  };
}

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

  // Public license verification config (never returns private key)
  app.get("/api/license/public-key", (_req: Request, res: Response) => {
    try {
      const kp = getLicenseKeypair();
      const cfg = getSellerRuntimeConfig();
      res.json({
        kid: kp.kid,
        publicKeyJwk: kp.publicJwk,
        masterSheetUrl: cfg.masterSheetUrl,
        sellerWhatsApp: cfg.sellerWhatsApp,
      });
    } catch {
      res.status(500).json({ error: "Could not load license verification key." });
    }
  });

  // Seller auth status (env override or first-run claim check)
  app.get("/api/seller/auth-status", (_req: Request, res: Response) => {
    res.json(getSellerAuthStatus());
  });

  // First-run seller password claim (atomic write-once when env var is unset)
  app.post("/api/seller/claim", (req: Request, res: Response) => {
    const status = getSellerAuthStatus();
    if (status.envManaged) {
      res.status(409).json({ error: "Seller password is managed by server environment configuration." });
      return;
    }
    if (status.configured) {
      res.status(409).json({ error: "Seller password has already been claimed." });
      return;
    }
    const password = String(req.body?.password || "");
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: "Password must be between 6 and 128 characters." });
      return;
    }
    try {
      ensureDataDir();
      const record = hashSellerPassword(password);
      fs.writeFileSync(SELLER_AUTH_FILE, JSON.stringify(record), { flag: "wx", mode: 0o600 });
      res.json(issueSellerToken());
    } catch {
      res.status(409).json({ error: "Seller password has already been claimed." });
    }
  });

  app.post("/api/seller/login", (req: Request, res: Response) => {
    const status = getSellerAuthStatus();
    if (!status.configured) {
      res.status(400).json({ error: "Seller password not configured yet." });
      return;
    }
    const password = String(req.body?.password || "");
    if (!verifySellerPassword(password)) {
      res.status(401).json({ error: "Incorrect seller password." });
      return;
    }
    res.json(issueSellerToken());
  });

  // Protected: Generate Option 3 ECDSA P-256 signed offline activation key
  app.post("/api/seller/sign-key", requireSellerAuth, (req: Request, res: Response) => {
    const rawDeviceId = String(req.body?.deviceId || "").trim().toUpperCase();
    if (!/^([A-Z0-9-]{4,32}|\*)$/.test(rawDeviceId)) {
      res.status(400).json({ error: "Valid Device ID is required." });
      return;
    }

    const validPlans = ["trial", "monthly", "yearly", "lifetime"] as const;
    const planRaw = String(req.body?.plan || "yearly").toLowerCase();
    const plan = (validPlans as readonly string[]).includes(planRaw) ? planRaw : "yearly";

    const daysNum = Number(req.body?.days);
    let expiresAt = 0;
    if (plan !== "lifetime") {
      const days =
        Number.isFinite(daysNum) && daysNum > 0 && daysNum <= 3650
          ? Math.round(daysNum)
          : plan === "trial"
          ? 7
          : plan === "monthly"
          ? 30
          : 365;
      expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    }

    const station = String(req.body?.stationName || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 48);

    const kp = getLicenseKeypair();
    const payload = {
      v: 1,
      kid: kp.kid,
      d: rawDeviceId,
      p: plan,
      s: station,
      i: Date.now(),
      e: expiresAt,
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const privateKeyObj = crypto.createPrivateKey({ key: kp.privateJwk as crypto.JsonWebKey, format: "jwk" });
    const sig = crypto.sign("sha256", Buffer.from(payloadB64, "utf8"), {
      key: privateKeyObj,
      dsaEncoding: "ieee-p1363",
    });
    const code = `RBN1.${payloadB64}.${sig.toString("base64url")}`;
    const publicKeyEnv = Buffer.from(JSON.stringify(kp.publicJwk), "utf8").toString("base64url");

    res.json({ code, payload, publicKeyEnv });
  });

  app.get("/api/seller/config", requireSellerAuth, (_req: Request, res: Response) => {
    const kp = getLicenseKeypair();
    const cfg = getSellerRuntimeConfig();
    const publicKeyEnv = Buffer.from(JSON.stringify(kp.publicJwk), "utf8").toString("base64url");
    res.json({
      masterSheetUrl: cfg.masterSheetUrl,
      sellerWhatsApp: cfg.sellerWhatsApp,
      publicKeyEnv,
      kid: kp.kid,
    });
  });

  app.post("/api/seller/config", requireSellerAuth, (req: Request, res: Response) => {
    const rawSheet = String(req.body?.masterSheetUrl || "").trim();
    const normalizedSheet = rawSheet ? normalizeMasterSheetUrl(rawSheet) : "";
    if (rawSheet && !normalizedSheet) {
      res.status(400).json({
        error: "Master Sheet URL must be a valid Google Apps Script /exec URL or Deployment ID.",
      });
      return;
    }
    const sellerWhatsApp = String(req.body?.sellerWhatsApp || "").replace(/[^\d]/g, "").slice(0, 20);
    ensureDataDir();
    const nextCfg: SellerRuntimeConfig = {
      masterSheetUrl: normalizedSheet,
      sellerWhatsApp,
    };
    fs.writeFileSync(SELLER_CONFIG_FILE, JSON.stringify(nextCfg, null, 2), { mode: 0o600 });
    res.json({ ok: true, ...getSellerRuntimeConfig() });
  });

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
        ws: { server: httpServer },
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

