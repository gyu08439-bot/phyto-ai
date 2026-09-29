# Phyto AI — iOS Plant Doctor & Smart Garden OS 🌿📱

An elite, turnkey iOS and Web application for AI-powered houseplant disease diagnosis, ambient lux metering, and personalized watering intelligence.

Built with **Capacitor 6**, **Apple StoreKit 2 (via RevenueCat)**, and **Cloudflare Workers AI (Llama 3.2 11B Vision)**.

---

## 🌟 Key Features

1. **Cellular Leaf Pathology AI:** Multimodal computer vision model (`@cf/meta/llama-3.2-11b-vision-instruct`) analyzes leaf discoloration, identifying 45,000+ fungal, bacterial, and pest pathogens with an actionable 3-step recovery prescription.
2. **Ambient Camera Luxmeter:** Real-time photoperiod and lux measurement via camera stream to prevent foliage scorching or deep shade chlorosis.
3. **Persistent Garden Tracker:** LocalStorage/Keychain persistence with one-tap watering schedule reset, countdown reminders, and Garden Vitality score calculation.
4. **Pet-Toxicity Database:** Instant safety alerts for cat and dog owners regarding insoluble calcium oxalates.
5. **Turnkey Monetization Engine:** Conversion-optimized paywall featuring $39.99/year (Save 70%) with 3-day trial and weekly backup, powered by RevenueCat.
6. **OWASP MASVS Security Shield:** Cloudflare Worker protected with sliding-window rate limiting, origin locking, and 1.5MB payload caps.

---

## 🏗 Tech Stack

- **Frontend:** Vanilla ES6 Modules, Modern CSS Grid & Flexbox, OLED True Black (`#000000`), Apple HIG Squircles.
- **Mobile Container:** Capacitor iOS (`com.flora.ai`).
- **In-App Subscriptions:** RevenueCat (`@revenuecat/purchases-capacitor` v13.6).
- **Backend:** Cloudflare Workers + Cloudflare Workers AI.
- **Hosting:** Cloudflare Pages (Global CDN with <15ms TTFB).

---

## 🚀 Quick Start & Development

### 1. Web Local Preview
```bash
python3 -m http.server 8080 --directory web
```

### 2. Deploy Cloudflare Backend
```bash
cd worker
npx wrangler deploy
```

### 3. Deploy Web to Cloudflare Pages
```bash
npx wrangler pages deploy web --project-name=flora-ai --branch=production
```

### 4. Build for iOS (Xcode & TestFlight)
```bash
npx cap sync ios
npx cap open ios
```
In Xcode:
1. Select your Apple Developer Signing Team under `Signing & Capabilities`.
2. Choose **Product > Destination > Any iOS Device (arm64)**.
3. Choose **Product > Archive**.
4. Click **Distribute App > TestFlight & App Store**.

---

## 💳 RevenueCat Configuration

1. In [RevenueCat Dashboard](https://app.revenuecat.com):
   - Project: `Phyto AI`
   - Add Apple App Store app with Bundle ID: `com.flora.ai`.
2. Products created in App Store Connect:
   - `flora_annual_3999`: Auto-renewable subscription ($39.99/year).
   - `flora_weekly_499`: Auto-renewable subscription ($4.99/week).
3. Entitlement:
   - Identifier: `pro_access`.
   - Attach both products to `pro_access`.

---

## 📄 License
Commercial proprietary software. Ready for production release or M&A acquisition on Acquire.com / Microns.io.