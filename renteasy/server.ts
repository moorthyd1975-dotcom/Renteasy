import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parser for JSON with 8mb limit (reduced from 25mb for security & performance)
app.use(express.json({ limit: "8mb" }));

// Server-side Supabase client for token verification
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const serverSupabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      })
    : null;

// In-memory per-user rate limiter (20 requests per 10 minutes)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes
  const maxRequests = 20;

  const entry = rateLimitMap.get(userId);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (entry.count >= maxRequests) {
    return true;
  }

  entry.count += 1;
  return false;
}

// Server-side Gemini client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// Health Check API
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "RentEase",
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasSupabase: !!serverSupabase,
    timestamp: new Date().toISOString(),
  });
});

// AI EB Meter Reading & Verification API
app.post("/api/meter/read", async (req, res) => {
  try {
    // 1. Verify Authorization Header (Bearer <supabase-access-token>)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized: Missing or malformed Bearer token" });
      return;
    }

    const token = authHeader.split(" ")[1]?.trim();
    if (!token) {
      res.status(401).json({ error: "Unauthorized: Token empty" });
      return;
    }

    if (!serverSupabase) {
      res.status(500).json({ error: "Supabase configuration missing on server" });
      return;
    }

    const { data: authData, error: authError } = await serverSupabase.auth.getUser(token);
    if (authError || !authData?.user) {
      res.status(401).json({ error: "Unauthorized: Invalid or expired access token" });
      return;
    }

    const userId = authData.user.id;

    // 2. Per-user Rate Limiting (20 requests per 10 minutes)
    if (isRateLimited(userId)) {
      res.status(429).json({
        error: "Rate limit exceeded. Please wait a few minutes before submitting more meter photos.",
      });
      return;
    }

    // 3. Validate image payload
    const { imageBase64, mimeType = "image/jpeg" } = req.body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({ error: "Missing or invalid imageBase64 data" });
      return;
    }

    let finalMimeType = "image/jpeg";
    let cleanBase64 = "";

    const dataUriMatch = imageBase64.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUriMatch) {
      finalMimeType = dataUriMatch[1].trim();
      cleanBase64 = dataUriMatch[2].trim();
    } else {
      cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "").trim();
      finalMimeType = mimeType || "image/jpeg";
    }

    // Reject non-image mime types
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(finalMimeType)) {
      res.status(400).json({
        error: "Invalid image format. Allowed formats: JPEG, PNG, WebP.",
      });
      return;
    }

    // Sanitize base64 string
    cleanBase64 = cleanBase64.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
      res.status(400).json({ error: "Invalid base64 image data" });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.json({
        extractedReading: null,
        status: "NEEDS_CONFIRMATION",
        notes: "Gemini API key is not configured on the server. Please enter reading manually.",
      });
      return;
    }

    const promptText = `
Analyze this electricity meter photograph and extract the active energy kWh reading shown on the digital/mechanical display.
Instructions:
- Extract ONLY the units consumed reading number shown on the meter display.
- Include the decimal point and fractional value if present (e.g. 20750.7, 18567.4, 342.5). Look closely for a decimal point or a rightmost fractional digit (often bordered in red or separated by a dot).
- If only whole digits are present, return the whole number (e.g. 20750).
- Do NOT read the serial number or meter model. Read only the consumed kWh display.
- Return ONLY a JSON object: {"reading": 20750.7, "notes": "Reading identified with decimal"}
- If the digits cannot be identified or display is illegible, return: {"reading": null, "notes": "Display illegible or obstructed"}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: finalMimeType,
              data: cleanBase64,
            },
          },
          {
            text: promptText,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text || "{}";
    let parsedData: any = {};
    try {
      parsedData = JSON.parse(responseText.trim());
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsedData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    let readingValue: number | null = null;
    if (typeof parsedData.reading === "number" && !isNaN(parsedData.reading)) {
      readingValue = parsedData.reading;
    } else if (typeof parsedData.extractedReading === "number" && !isNaN(parsedData.extractedReading)) {
      readingValue = parsedData.extractedReading;
    } else if (parsedData.reading) {
      const num = parseFloat(String(parsedData.reading).replace(/[^0-9.]/g, ""));
      readingValue = isNaN(num) ? null : num;
    }

    const notes = parsedData.notes || (readingValue !== null ? "Units read successfully" : "Could not identify digits clearly");

    res.json({
      extractedReading: readingValue !== null ? Number(readingValue.toFixed(2)) : null,
      status: readingValue !== null ? "VERIFIED" : "NEEDS_CONFIRMATION",
      notes,
    });
  } catch (error: any) {
    console.error("Error in /api/meter/read:", error);
    res.json({
      extractedReading: null,
      status: "NEEDS_CONFIRMATION",
      notes: error?.message || "Could not read digits automatically. Please enter the reading manually.",
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RentEase server running at http://localhost:${PORT} (${isProd ? "production" : "development"})`);
  });
}

startServer();
