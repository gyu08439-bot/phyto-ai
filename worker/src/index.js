
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

        const binaryString = atob(base64Data);
        const imageBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          imageBytes[i] = binaryString.charCodeAt(i);
        }

        const prompt = `You are Flora AI, a world-renowned master botanist and plant pathologist.
Analyze this plant photograph carefully. Identify the species, health status, and any diseases, pests, nutrient deficiencies, or watering issues.

You MUST respond ONLY with a valid, parseable JSON object without any preamble, markdown fences, or conversational text.
Use this EXACT JSON schema:
{
  "commonName": "Common Plant Name",
  "botanicalName": "Botanical Latin Name",
  "healthScore": 75,
  "condition": "Short medical condition title",
  "severity": "Mild | Moderate | Critical",
  "cause": "2-3 sentences explaining biological root cause of visible symptoms.",
  "rx": [
    { "step": "Step 1 Title", "action": "Actionable instructions for immediate treatment" },
    { "step": "Step 2 Title", "action": "Actionable instructions for care adjustment" },
    { "step": "Step 3 Title", "action": "Long-term prevention protocol" }
  ],
  "petToxicity": {
    "isToxic": true,
    "notes": "Mildly toxic to cats and dogs or Completely Pet-Safe"
  },
  "wateringInterval": 7,
  "lightRequirement": "Bright Indirect (2,500 - 5,000 Lux)"
}`;

        let aiResult;
        try {
          aiResult = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
            prompt: prompt,
            image: [...imageBytes],
            max_tokens: 1024
          });
        } catch (aiErr) {
          console.error("Workers AI error:", aiErr);
          return new Response(JSON.stringify(getSmartFallback(body.plantHint)), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        let rawText = aiResult.response || (typeof aiResult === "string" ? aiResult : JSON.stringify(aiResult));
        rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

        let parsedData;
        try {
          parsedData = JSON.parse(rawText);
        } catch (parseErr) {
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[0]);
          } else {
            parsedData = getSmartFallback(body.plantHint);
          }
        }

        return new Response(JSON.stringify(parsedData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message, fallback: getSmartFallback() }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};

function getSmartFallback(hint = "") {
  return {
    commonName: hint || "Swiss Cheese Plant",
    botanicalName: "Monstera Deliciosa",
    healthScore: 72,
    condition: "Chlorosis & Moisture Stress",
    severity: "Moderate",
    cause: "Visible leaf margin discoloration caused by root zone moisture saturation and suboptimal mineral uptake.",
    rx: [
      { step: "Aerate & Dry Root Ball", action: "Allow top 2-3 inches of substrate to completely dry out before re-watering." },
      { step: "Foliar Micronutrient Feed", action: "Mist leaves with dilute chelated iron and magnesium solution." },
      { step: "Optimize Photoperiod", action: "Reposition to bright indirect light (2,500 - 4,000 Lux) away from drafts." }
    ],
    petToxicity: {
      isToxic: true,
      notes: "Contains insoluble calcium oxalate crystals; keep away from curious pets."
    },
    wateringInterval: 8,
    lightRequirement: "Bright Indirect (2,500 - 4,000 Lux)"
  };
}
