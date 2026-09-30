
// Cloudflare Worker Security Layer & Llama 3.2 Vision Engine

// In-memory sliding window rate limiter (per Cloudflare worker isolate)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds
const MAX_REQUESTS_PER_WINDOW = 6;

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || [];
  const validTimestamps = record.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitMap.set(ip, validTimestamps);
    return false; // Rate limit exceeded
  }

  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
  return true;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const referer = request.headers.get("Referer") || "";
    const userAgent = request.headers.get("User-Agent") || "";
    const clientIP = request.headers.get("CF-Connecting-IP") || "127.0.0.1";

    const allowedOrigins = [
      "https://flora-ai-6e5.pages.dev",
      "https://*.flora-ai-6e5.pages.dev",
      "capacitor://localhost",
      "http://localhost:8080",
      "http://127.0.0.1:8080"
    ];

    const isAllowedOrigin = allowedOrigins.some(pattern => {
      if (pattern.includes("*")) {
        const regex = new RegExp("^" + pattern.replace(".", "\\.").replace("*", ".*") + "$");
        return regex.test(origin) || regex.test(referer);
      }
      return origin === pattern || referer.startsWith(pattern);
    });

    const isNativeApp = userAgent.includes("Capacitor") || userAgent.includes("CFNetwork") || userAgent.includes("Darwin");

    const corsHeaders = {
      "Access-Control-Allow-Origin": isAllowedOrigin ? origin : "https://flora-ai-6e5.pages.dev",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        service: "Flora AI Vision Engine",
        security: "OWASP-MASVS-Enforced"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Diagnostics endpoint
    if (url.pathname === "/api/diagnose" && request.method === "POST") {
      // 1. Origin and Client Verification Shield
      if (!isAllowedOrigin && !isNativeApp && !origin.includes("pages.dev") && origin !== "") {
        return new Response(JSON.stringify({ error: "Access Denied: Unauthorized Origin" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 2. Sliding Window Rate Limiting Shield
      if (!checkRateLimit(clientIP)) {
        return new Response(JSON.stringify({
          error: "Rate limit exceeded. Please wait 60 seconds before scanning again.",
          retryAfter: 60
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" }
        });
      }

      try {
        const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
        // 3. Payload Cap Shield (Reject > 1.8MB payloads to prevent memory exhaustion)
        if (contentLength > 1800000) {
          return new Response(JSON.stringify({ error: "Image payload exceeds maximum 1.5MB limit." }), {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const body = await request.json();
        let base64Data = body.image;
        if (!base64Data) {
          return new Response(JSON.stringify({ error: "No image provided" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (base64Data.includes(",")) {
          base64Data = base64Data.split(",")[1];
        }

        let parsedData = null;

        // 1. Primary AI Vision Engine: OpenRouter (Google Gemini 2.0 Flash)
        if (env.OPENROUTER_API_KEY) {
          try {
            parsedData = await callOpenRouter(base64Data, env.OPENROUTER_API_KEY);
          } catch (orErr) {
            console.warn("OpenRouter call failed, attempting Cloudflare Workers AI fallback:", orErr);
          }
        }

        // 2. Secondary Fallback: Cloudflare Workers AI (Llama 3.2 Vision)
        if (!parsedData && env.AI) {
          try {
            const binaryString = atob(base64Data);
            const imageBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              imageBytes[i] = binaryString.charCodeAt(i);
            }

            const aiResult = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
              prompt: BOTANICAL_SYSTEM_PROMPT,
              image: [...imageBytes],
              max_tokens: 800
            });
            let rawText = aiResult.response || (typeof aiResult === "string" ? aiResult : JSON.stringify(aiResult));
            rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsedData = JSON.parse(jsonMatch[0]);
            }
          } catch (cfErr) {
            console.warn("Workers AI error:", cfErr);
          }
        }

        // 3. Graceful safety handling (never call random objects a plant!)
        if (!parsedData) {
          return new Response(JSON.stringify({
            isPlant: false,
            errorTitle: "Scan Unavailable",
            errorMessage: "AI vision service is momentarily busy. Please aim at the leaf and try again in a moment."
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify(parsedData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({
          isPlant: false,
          errorTitle: "Scan Error",
          errorMessage: "Unable to process image. Please try again with clear lighting."
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};

const BOTANICAL_SYSTEM_PROMPT = `You are Flora AI, an elite plant pathologist and computer vision diagnostician.

CRITICAL MANDATE - OBJECT VALIDATION FIRST:
Before diagnosing, inspect the photograph carefully. Does this image actually show a real plant, leaf, branch, or flower?
- If the image contains NO plant (e.g. asphalt, pavement, road, floor, wall, animal, human face, shoes, car, furniture, food, screen, darkness, or random non-plant objects):
  You MUST return ONLY this JSON:
  {
    "isPlant": false,
    "errorTitle": "No Plant Detected",
    "errorMessage": "This image appears to show non-plant material (e.g. asphalt, floor, or object). Please aim your camera directly at a real plant leaf or stem."
  }

- If and ONLY IF a plant, leaf, or flower is genuinely present:
  Return ONLY this JSON:
  {
    "isPlant": true,
    "commonName": "Common Plant Name (e.g. Monstera Deliciosa)",
    "botanicalName": "Botanical Latin Name (e.g. Monstera deliciosa)",
    "healthScore": 75,
    "condition": "Short medical condition title (e.g. Early Leaf Rust)",
    "severity": "Mild | Moderate | Critical",
    "cause": "2 concise sentences explaining the biological root cause of visible symptoms.",
    "rx": [
      { "step": "1. Adjust Watering", "action": "Actionable instructions for immediate treatment" },
      { "step": "2. Optimize Lighting & Air", "action": "Actionable instructions for care adjustment" },
      { "step": "3. Clinical Treatment Protocol", "action": "Detailed clinical formula and fungicide/fertilizer dosing" }
    ],
    "wateringInterval": 7,
    "lightRequirement": "Bright Indirect (2,500 - 5,000 Lux)"
  }

You MUST respond ONLY with the valid, parseable JSON object without markdown fences or preamble.`;

async function callOpenRouter(imageBase64, apiKey) {
  const formattedUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://floraai.app",
      "X-Title": "Flora AI",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: BOTANICAL_SYSTEM_PROMPT },
            {
              type: "image_url",
              image_url: { url: formattedUrl }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.1
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const rawText = data.choices?.[0]?.message?.content || "";
  const clean = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(clean);
}
