import { purchasesManager } from "./purchases.js";
import { notificationsManager } from "./notifications.js";
import { ONBOARDING_QUESTIONS, PLANT_DATABASE } from "./data.js";
import { PlantScanner } from "./scanner.js";
import { LightMeter } from "./lightmeter.js";

class FloraApp {
  constructor() {
    this.currentScreen = "screen-quiz";
    this.quizStep = 0;
    this.selectedPlan = "yearly";
    this.gardenFilter = "all";
    this.freeScansUsed = parseInt(localStorage.getItem("flora_free_scans_used") || "0", 10);
    this.lastDiagnosedPlant = null;

    this.loadGarden();
    this.initElements();
    this.initQuiz();
    this.initScanner();
    this.initLightMeter();
    this.initPaywall();
    this.initDashboard();
    this.initTabBar();
    this.initAddPlantModal();
    this.initLuxPlantPickerModal();
    this.initSettings();
    this.initPurchases();

    // Initialize smart plant care notifications and schedule active garden
    notificationsManager.init().then(() => {
      notificationsManager.rescheduleAllGarden(this.myPlants);
    });

    window.addEventListener("flora:open_plant", (e) => {
      const pid = e.detail?.plantId;
      if (pid) {
        const target = this.myPlants.find(p => p.id === pid);
        if (target) {
          this.renderDiagnosis(target);
        }
      }
    });

    // Skip onboarding quiz on app relaunch if completed previously
    const hasCompletedOnboarding = localStorage.getItem("flora_onboarding_completed") === "true";
    if (hasCompletedOnboarding) {
      this.showScreen("dashboard");
    } else {
      this.showScreen("quiz");
    }
  }

  loadGarden() {
    try {
      const saved = localStorage.getItem("flora_garden_v4");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Automatic deduplication by unique key
        const seen = new Set();
        this.myPlants = parsed.filter(p => {
          const key = (p.id && !p.id.startsWith("g_")) ? p.id : (p.nickname || p.commonName);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        this.saveGarden();
      } else {
        // Fresh install starts with an empty garden (User requirement)
        this.myPlants = [];
        this.saveGarden();
      }
    } catch (e) {
      console.warn("LocalStorage error:", e);
      this.myPlants = [];
    }
  }

  saveGarden() {
    try {
      localStorage.setItem("flora_garden_v4", JSON.stringify(this.myPlants));
      if (typeof notificationsManager !== "undefined") {
        notificationsManager.rescheduleAllGarden(this.myPlants);
      }
    } catch (e) {
      console.warn("Save failed:", e);
    }
  }

  initElements() {
    this.screens = {
      quiz: document.getElementById("screen-quiz"),
      computing: document.getElementById("screen-computing"),
      paywall: document.getElementById("screen-paywall"),
      dashboard: document.getElementById("screen-dashboard"),
      scanner: document.getElementById("screen-scanner"),
      diagnosis: document.getElementById("screen-diagnosis"),
      luxmeter: document.getElementById("screen-luxmeter")
    };

    this.tabBar = document.getElementById("bottom-tab-bar");
  }

  showScreen(screenKey) {
    // Hard paywall lockdown: Only dashboard, paywall, quiz, and computing are accessible without Pro
    if (!purchasesManager.isPro) {
      const allowedWithoutPro = ["dashboard", "paywall", "quiz", "computing"];
      if (!allowedWithoutPro.includes(screenKey)) {
        this.showPaywall("screen_lock_" + screenKey);
        return;
      }
    }

    Object.values(this.screens).forEach(el => {
      if (el) el.classList.remove("active");
    });

    if (this.screens[screenKey]) {
      this.screens[screenKey].classList.add("active");
      this.currentScreen = screenKey;
      window.scrollTo(0, 0);
    }

    const showTabs = ["dashboard", "scanner", "luxmeter"].includes(screenKey);
    if (this.tabBar) {
      this.tabBar.style.display = showTabs ? "flex" : "none";
      document.querySelectorAll(".tab-item").forEach(btn => {
        btn.classList.remove("active");
        if (btn.getAttribute("data-target") === screenKey) {
          btn.classList.add("active");
        }
      });
    }

    // Auto-manage live camera stream
    if (screenKey === "scanner") {
      if (this.scanner) this.scanner.startCamera();
    } else {
      if (this.scanner) this.scanner.stopCamera();
    }

    if (screenKey !== "luxmeter" && this.lightMeter) {
      this.lightMeter.stop();
    }
  }

  initTabBar() {
    document.querySelectorAll(".tab-item").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const target = btn.getAttribute("data-target");
        if (!target) return;
        if (target === "dashboard") {
          this.showScreen("dashboard");
          return;
        }
        // Clicking on Camera (Scan) or Luxmeter must immediately show Paywall if not Pro
        if (!purchasesManager.isPro) {
          e.preventDefault();
          e.stopPropagation();
          this.showPaywall("tab_" + target);
          return;
        }
        this.showScreen(target);
      });
    });
  }

  initQuiz() {
    this.quizContainer = document.getElementById("quiz-options-container");
    this.quizTitle = document.getElementById("quiz-question-title");
    this.quizSubtitle = document.getElementById("quiz-question-subtitle");
    this.stepDots = document.querySelectorAll(".step-dot");

    this.renderQuizStep();
  }

  renderQuizStep() {
    const q = ONBOARDING_QUESTIONS[this.quizStep];
    if (!q) {
      this.startComputingInterstitial();
      return;
    }

    if (this.quizTitle) this.quizTitle.textContent = q.title;
    if (this.quizSubtitle) this.quizSubtitle.textContent = q.subtitle;

    if (this.stepDots) {
      this.stepDots.forEach((dot, idx) => {
        dot.classList.toggle("active", idx === this.quizStep);
      });
    }

    if (this.quizContainer) {
      this.quizContainer.innerHTML = "";
      q.options.forEach(opt => {
        const card = document.createElement("div");
        card.className = "option-card";
        card.innerHTML = `
          <div class="option-icon">${opt.icon}</div>
          <div>
            <div class="option-label">${opt.label}</div>
            <div class="option-desc">${opt.desc}</div>
          </div>
        `;
        card.addEventListener("click", () => {
          card.classList.add("selected");
          setTimeout(() => {
            this.quizStep++;
            this.renderQuizStep();
          }, 180);
        });
        this.quizContainer.appendChild(card);
      });
    }
  }

  startComputingInterstitial() {
    this.showScreen("computing");
    const stepText = document.getElementById("computation-step-text");
    const percentText = document.getElementById("computing-percent");
    const steps = [
      "Scanning leaf morphology...",
      "Connecting to Botanical Neural Engine...",
      "Calibrating chlorophyll health index...",
      "Personalizing watering calendar..."
    ];

    let currentPct = 0;
    const interval = setInterval(() => {
      currentPct += 2;
      if (percentText) percentText.textContent = `${currentPct}%`;

      const stepIdx = Math.min(steps.length - 1, Math.floor((currentPct / 100) * steps.length));
      if (stepText) stepText.textContent = steps[stepIdx];

      if (currentPct >= 100) {
        clearInterval(interval);
        localStorage.setItem("flora_onboarding_completed", "true");
        setTimeout(() => this.showScreen("paywall"), 300);
      }
    }, 45);
  }

  showPaywall(reason = "") {
    this.showScreen("paywall");
    this.renderPaywallState();
  }

  renderPaywallState() {
    const ctaBtn = document.getElementById("paywall-cta-btn");
    const trialNote = document.getElementById("paywall-trial-note");
    const yearlyDesc = document.querySelector("#plan-yearly .pw-plan-desc");
    const arrowSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

    const yearlyPrice = purchasesManager.cachedPrices?.yearly || "$29.99";
    const monthlyPrice = purchasesManager.cachedPrices?.monthly || "$7.99";
    const isTrialEligible = purchasesManager.isTrialEligible !== false;

    if (yearlyDesc) {
      yearlyDesc.textContent = isTrialEligible
        ? "3 days free · billed yearly"
        : "Billed annually · cancel anytime";
    }

    if (this.selectedPlan === "yearly") {
      if (isTrialEligible) {
        if (ctaBtn) ctaBtn.innerHTML = `<span>Start 3-Day Free Trial</span>${arrowSvg}`;
        if (trialNote) trialNote.innerHTML = `Auto-renews until canceled in App Store. 3 days free, then ${yearlyPrice}/year. <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>`;
      } else {
        if (ctaBtn) ctaBtn.innerHTML = `<span>Subscribe for ${yearlyPrice} / yr</span>${arrowSvg}`;
        if (trialNote) trialNote.innerHTML = `Plans auto-renew yearly until canceled in App Store. ${yearlyPrice}/year. <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>`;
      }
    } else {
      if (ctaBtn) ctaBtn.innerHTML = `<span>Subscribe for ${monthlyPrice} / mo</span>${arrowSvg}`;
      if (trialNote) trialNote.innerHTML = `Plans auto-renew monthly until canceled in App Store. ${monthlyPrice}/month. <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>`;
    }
  }

  async initPurchases() {
    try {
      await purchasesManager.init();
      await purchasesManager.checkTrialEligibility();
      const prices = await purchasesManager.loadOfferings();
      this.updatePaywallPrices(prices);
      this.renderPaywallState();
    } catch (e) {
      console.warn("[FloraApp] initPurchases error:", e);
    }

    window.addEventListener("flora:entitlement_updated", (e) => {
      this.handleEntitlementUpdate(e.detail?.isPro);
    });
  }

  updatePaywallPrices(prices) {
    if (!prices) return;
    const yearlyBold = document.querySelector("#plan-yearly .pw-price-bold");
    const yearlySub = document.querySelector("#plan-yearly .pw-price-sub");
    const monthlyBold = document.querySelector("#plan-monthly .pw-price-bold");
    const trialNote = document.getElementById("paywall-trial-note");

    if (yearlyBold && prices.yearlyMonthly) {
      yearlyBold.innerHTML = `${prices.yearlyMonthly.replace("/mo", "")}<small>/mo</small>`;
    }
    if (yearlySub && prices.yearly) {
      yearlySub.textContent = `${prices.yearly} / year`;
    }
    if (monthlyBold && prices.monthly) {
      monthlyBold.innerHTML = `${prices.monthly}<small>/mo</small>`;
    }
    this.renderPaywallState();
  }

  handleEntitlementUpdate(isPro) {
    this.renderProStatusBadge();
    this.renderGardenList();
    if (this.lastDiagnosedPlant && this.currentScreen === "diagnosis") {
      this.renderDiagnosis(this.lastDiagnosedPlant);
    }

    // After payment / subscription activation: automatically prompt for care notifications
    if (isPro && localStorage.getItem("flora_notifs_prompted") !== "true") {
      localStorage.setItem("flora_notifs_prompted", "true");
      setTimeout(async () => {
        try {
          const granted = await notificationsManager.requestPermission();
          if (granted) {
            await notificationsManager.rescheduleAllGarden(this.myPlants);
          }
        } catch (e) {
          console.warn("[FloraApp] Notification prompt error:", e);
        }
      }, 2500);
    }
  }

  initPaywall() {
    const yearlyCard = document.getElementById("plan-yearly");
    const monthlyCard = document.getElementById("plan-monthly");
    const ctaBtn = document.getElementById("paywall-cta-btn");
    const closeBtn = document.getElementById("paywall-close-btn");
    const restoreBtn = document.getElementById("paywall-restore-btn");

    if (yearlyCard && monthlyCard) {
      yearlyCard.addEventListener("click", () => {
        yearlyCard.classList.add("selected", "active");
        monthlyCard.classList.remove("selected", "active");
        this.selectedPlan = "yearly";
        this.renderPaywallState();
      });

      monthlyCard.addEventListener("click", () => {
        monthlyCard.classList.add("selected", "active");
        yearlyCard.classList.remove("selected", "active");
        this.selectedPlan = "monthly";
        this.renderPaywallState();
      });
    }

    if (ctaBtn) {
      ctaBtn.addEventListener("click", async () => {
        if (ctaBtn.disabled) return;
        const originalContent = ctaBtn.innerHTML;
        try {
          ctaBtn.disabled = true;
          ctaBtn.innerHTML = `<span>Connecting to App Store...</span>`;

          const result = await purchasesManager.purchasePlan(this.selectedPlan);

          if (result.cancelled) {
            ctaBtn.disabled = false;
            ctaBtn.innerHTML = originalContent;
            return;
          }

          if (result.success) {
            ctaBtn.innerHTML = `<span>✓ Subscribed to Flora Pro!</span>`;
            localStorage.setItem("flora_onboarding_completed", "true");
            setTimeout(() => {
              ctaBtn.disabled = false;
              ctaBtn.innerHTML = originalContent;
              if (this.lastDiagnosedPlant && this.currentScreen === "paywall") {
                this.showScreen("diagnosis");
                this.renderDiagnosis(this.lastDiagnosedPlant);
              } else {
                this.showScreen("dashboard");
              }
            }, 600);
          } else {
            ctaBtn.disabled = false;
            ctaBtn.innerHTML = originalContent;
            alert(result.error || "Unable to complete purchase. Please try again.");
          }
        } catch (err) {
          ctaBtn.disabled = false;
          ctaBtn.innerHTML = originalContent;
          alert("Purchase failed: " + (err?.message || err));
        }
      });
    }

    if (restoreBtn) {
      restoreBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const origText = restoreBtn.textContent;
        try {
          restoreBtn.textContent = "Restoring...";
          const result = await purchasesManager.restorePurchases();
          if (result.success) {
            restoreBtn.textContent = "✓ Restored Flora Pro";
            localStorage.setItem("flora_onboarding_completed", "true");
            alert("Success! Your Flora Pro subscription has been restored.");
            setTimeout(() => {
              restoreBtn.textContent = origText;
              if (this.lastDiagnosedPlant && this.currentScreen === "paywall") {
                this.showScreen("diagnosis");
                this.renderDiagnosis(this.lastDiagnosedPlant);
              } else {
                this.showScreen("dashboard");
              }
            }, 400);
          } else {
            restoreBtn.textContent = origText;
            alert("No active subscriptions found for this Apple ID.");
          }
        } catch (err) {
          restoreBtn.textContent = origText;
          alert("Restore error: " + (err?.message || err));
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        localStorage.setItem("flora_onboarding_completed", "true");
        this.showScreen("dashboard");
      });
    }
  }

  initScanner() {
    this.scanner = new PlantScanner({
      beforeScan: () => {
        if (!purchasesManager.isPro) {
          this.showPaywall("scanner_pro_required");
          return false;
        }
        return true;
      },
      onDiagnosisReady: (result) => {
        // If image is not a plant (e.g. asphalt, floor, wall, animal, face)
        if (result && result.isPlant === false) {
          // Resume camera viewfinder if frozen
          if (this.scanner.cameraPreview) this.scanner.cameraPreview.style.display = "none";
          if (this.scanner.cameraFeed) this.scanner.cameraFeed.style.display = "block";
          this.showNotPlantNotification(
            result.errorTitle || "No Plant Detected",
            result.errorMessage || "Please aim your camera directly at a live plant leaf."
          );
          return;
        }

        if (!purchasesManager.isPro) {
          this.freeScansUsed++;
          localStorage.setItem("flora_free_scans_used", this.freeScansUsed);
        }
        this.renderDiagnosis(result);
      }
    });

    const backFromScan = document.getElementById("back-from-scanner");
    if (backFromScan) {
      backFromScan.addEventListener("click", () => this.showScreen("dashboard"));
    }

    const backFromDiagnosis = document.getElementById("back-from-diagnosis");
    if (backFromDiagnosis) {
      backFromDiagnosis.addEventListener("click", () => this.showScreen("dashboard"));
    }

    const unlockRxBtn = document.getElementById("btn-unlock-rx-pro");
    if (unlockRxBtn) {
      unlockRxBtn.addEventListener("click", () => this.showPaywall("rx_unlock"));
    }

    const captureBtn = document.getElementById("btn-capture-scan");
    if (captureBtn) {
      captureBtn.addEventListener("click", (e) => {
        if (!purchasesManager.isPro) {
          e.stopImmediatePropagation();
          e.preventDefault();
          this.showPaywall("scanner_capture");
        }
      }, true);
    }
  }

  showNotPlantNotification(title, message) {
    const existing = document.getElementById("not-plant-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "not-plant-toast";
    toast.className = "not-plant-card";
    toast.innerHTML = `
      <div class="not-plant-header">
        <span class="not-plant-icon">⚠️</span>
        <span class="not-plant-title">${title}</span>
      </div>
      <div class="not-plant-msg">${message}</div>
      <button class="not-plant-dismiss-btn" id="btn-dismiss-toast">Got it · Aim at Leaf</button>
    `;

    document.getElementById("screen-scanner")?.appendChild(toast);

    toast.querySelector("#btn-dismiss-toast")?.addEventListener("click", () => {
      toast.remove();
    });

    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 7000);
  }

  initLightMeter() {
    this.lightMeter = new LightMeter();
    const luxStartBtn = document.getElementById("lux-start-btn");
    if (luxStartBtn) {
      luxStartBtn.addEventListener("click", (e) => {
        if (!purchasesManager.isPro) {
          e.stopImmediatePropagation();
          this.showPaywall("light_meter_pro");
        }
      }, true);
    }
  }

  renderProStatusBadge() {
    const badgeEl = document.getElementById("dashboard-pro-status");
    const labelEl = document.getElementById("pro-status-date-label");
    if (!badgeEl || !labelEl) return;

    if (purchasesManager.isPro) {
      const expDate = purchasesManager.getFormattedExpirationDate();
      const isRu = (navigator.language || "").startsWith("ru");
      if (expDate) {
        labelEl.textContent = isRu
          ? `Flora Pro активна до ${expDate}`
          : `Flora Pro active until ${expDate}`;
      } else {
        labelEl.textContent = isRu ? "Flora Pro активна" : "Flora Pro Active";
      }
      badgeEl.style.display = "inline-flex";
    } else {
      badgeEl.style.display = "none";
    }
  }

  initDashboard() {
    this.renderProStatusBadge();
    this.renderGardenList();

    window.addEventListener("flora:entitlement_updated", () => {
      this.renderProStatusBadge();
      this.renderGardenList();
    });

    const vitalityCard = document.querySelector(".hero-vitality-card");
    if (vitalityCard) {
      vitalityCard.style.cursor = "pointer";
      vitalityCard.addEventListener("click", () => {
        if (!purchasesManager.isPro) {
          this.showPaywall("vitality_deep_analytics");
        }
      });
    }

    document.querySelectorAll(".segment-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const filter = btn.getAttribute("data-filter") || "all";
        if (filter !== "all" && !purchasesManager.isPro) {
          this.showPaywall("garden_filter_" + filter);
          return;
        }
        document.querySelectorAll(".segment-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.gardenFilter = filter;
        this.renderGardenList();
      });
    });
  }

  renderGardenList() {
    this.renderProStatusBadge();
    const container = document.getElementById("garden-plants-list");
    const vitalityDisplay = document.getElementById("garden-vitality-score");
    const countDisplay = document.getElementById("garden-count-badge");
    if (!container) return;

    if (!this.myPlants || this.myPlants.length === 0) {
      if (vitalityDisplay) vitalityDisplay.textContent = `--`;
      if (countDisplay) countDisplay.textContent = `0 Plants`;

      container.innerHTML = `
        <div class="empty-garden-card">
          <div class="empty-garden-icon">🪴</div>
          <div class="empty-garden-title">Your Garden is Empty</div>
          <div class="empty-garden-desc">Scan a plant to detect diseases, monitor vitality, and automate watering schedules.</div>
          <button id="btn-empty-scan-first" class="btn-empty-scan">
            <span>📷 Scan Your First Plant</span>
          </button>
        </div>
      `;

      const scanBtn = document.getElementById("btn-empty-scan-first");
      if (scanBtn) {
        scanBtn.addEventListener("click", () => {
          if (!purchasesManager.isPro) {
            this.showPaywall("empty_scan_first");
            return;
          }
          this.showScreen("scanner");
        });
      }
      return;
    }

    let list = this.myPlants;
    if (this.gardenFilter === "water") {
      list = this.myPlants.filter(p => p.nextWaterDays <= 2);
    } else if (this.gardenFilter === "treatment") {
      list = this.myPlants.filter(p => (p.healthScore || 80) < 80);
    }

    const avgHealth = Math.round(this.myPlants.reduce((sum, p) => sum + (p.healthScore || 80), 0) / this.myPlants.length);

    if (vitalityDisplay) vitalityDisplay.textContent = `${avgHealth}%`;
    if (countDisplay) countDisplay.textContent = `${this.myPlants.length} Plants`;

    container.innerHTML = "";

    if (list.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
          <div style="font-size: 40px; margin-bottom: 12px;">🪴</div>
          <div style="font-weight: 800; font-size: 18px; color: var(--text-primary);">All plants thriving</div>
          <div style="font-size: 14px; margin-top: 4px;">No plants currently need attention in this view.</div>
        </div>
      `;
      return;
    }

    list.forEach(plant => {
      const el = document.createElement("div");
      el.className = "plant-item-card";

      const isUrgent = plant.nextWaterDays <= 1;
      const waterLabel = isUrgent ? "💧 Water" : `💧 In ${plant.nextWaterDays}d`;
      const photoSrc = this.getPlantPhoto(plant);

      el.innerHTML = `
        <div class="plant-item-avatar">
          ${photoSrc ? `<img src="${photoSrc}" class="plant-item-photo" alt="${plant.commonName || 'Plant'}">` : (plant.icon || "🪴")}
        </div>
        <div class="plant-item-info">
          <div class="plant-item-title">${plant.nickname || plant.commonName}</div>
          <div class="plant-item-sub">${plant.commonName} • ${plant.healthScore || 85}% Vitality</div>
        </div>
        <button class="btn-water-item ${isUrgent ? "urgent" : ""}" data-id="${plant.id}">
          ${waterLabel}
        </button>
        <button class="btn-delete-plant" data-id="${plant.id}" title="Remove plant" aria-label="Remove plant">✕</button>
      `;

      el.addEventListener("click", () => {
        if (!purchasesManager.isPro) {
          this.showPaywall("garden_plant_detail");
          return;
        }
        this.renderDiagnosis(plant);
      });

      const waterBtn = el.querySelector(".btn-water-item");
      waterBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (!purchasesManager.isPro) {
          this.showPaywall("garden_water_action");
          return;
        }
        this.waterPlant(plant.id, waterBtn);
      });

      const deleteBtn = el.querySelector(".btn-delete-plant");
      deleteBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (confirm(`Remove "${plant.nickname || plant.commonName}" from your garden?`)) {
          this.deletePlant(plant.id);
        }
      });

      container.appendChild(el);
    });
  }

  deletePlant(plantId) {
    this.myPlants = this.myPlants.filter(p => p.id !== plantId);
    this.saveGarden();
    this.renderGardenList();
  }

  waterPlant(plantId, btnElement) {
    const p = this.myPlants.find(item => item.id === plantId);
    if (!p) return;

    p.nextWaterDays = p.wateringInterval || 7;
    p.healthScore = Math.min(100, (p.healthScore || 80) + 5);
    this.saveGarden();

    btnElement.innerHTML = "✓ Watered";
    btnElement.style.background = "#00F076";
    btnElement.style.color = "#000000";

    setTimeout(() => {
      this.renderGardenList();
    }, 600);
  }

  getPlantPhoto(plant) {
    if (!plant) return "assets/plants/monstera.jpg";
    if (plant.userPhoto) return plant.userPhoto;
    if (plant.photo) return plant.photo;
    if (plant.image) return plant.image;

    // Check by species ID in PLANT_DATABASE
    if (plant.id && !plant.id.startsWith("g_")) {
      const match = PLANT_DATABASE.find(p => p.id === plant.id);
      if (match && match.image) return match.image;
    }

    // Smart auto-match by name
    const text = ((plant.nickname || "") + " " + (plant.commonName || "") + " " + (plant.botanicalName || "")).toLowerCase();
    if (text.includes("bromeliad")) return "assets/plants/bromeliad.jpg";
    if (text.includes("spider") || text.includes("chlorophytum")) return "assets/plants/spider_plant.jpg";
    if (text.includes("rubber") || text.includes("ficus") || text.includes("elastica")) return "assets/plants/ficus_elastica.jpg";
    if (text.includes("snake") || text.includes("sansevieria") || text.includes("dracaena")) return "assets/plants/snake_plant.jpg";
    if (text.includes("calathea") || text.includes("goeppertia")) return "assets/plants/calathea_orbifolia.jpg";
    if (text.includes("zz") || text.includes("zamioculcas")) return "assets/plants/zz_plant.jpg";
    if (text.includes("pothos") || text.includes("epipremnum")) return "assets/plants/pothos_golden.jpg";
    if (text.includes("fern") || text.includes("nephrolepis")) return "assets/plants/boston_fern.jpg";
    if (text.includes("lily") || text.includes("peace") || text.includes("spathiphyllum")) return "assets/plants/peace_lily.jpg";
    if (text.includes("money") || text.includes("pachira")) return "assets/plants/money_tree.jpg";
    if (text.includes("monstera")) return "assets/plants/monstera.jpg";

    return "assets/plants/monstera.jpg";
  }

  initAddPlantModal() {
    const openBtn = document.getElementById("btn-open-add-plant");
    const modal = document.getElementById("modal-add-plant");
    const closeBtn = document.getElementById("btn-close-add-modal");
    const saveBtn = document.getElementById("btn-save-new-plant");
    const speciesSelect = document.getElementById("add-plant-species");
    const previewImg = document.getElementById("add-plant-preview-img");

    const updatePreview = () => {
      const spId = speciesSelect?.value;
      const sp = PLANT_DATABASE.find(p => p.id === spId) || PLANT_DATABASE[0];
      if (previewImg && sp) {
        previewImg.src = sp.image || `assets/plants/${sp.id}.jpg`;
      }
    };

    if (speciesSelect) {
      speciesSelect.innerHTML = PLANT_DATABASE.map(p => `
        <option value="${p.id}">${p.icon} ${p.commonName}</option>
      `).join("");
      speciesSelect.addEventListener("change", updatePreview);
      updatePreview();
    }

    if (openBtn && modal) {
      openBtn.addEventListener("click", () => {
        if (!purchasesManager.isPro) {
          this.showPaywall("garden_add_plant");
          return;
        }
        modal.classList.add("active");
        updatePreview();
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener("click", () => modal.classList.remove("active"));
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("active");
      });
    }

    if (saveBtn && modal) {
      saveBtn.addEventListener("click", () => {
        const nickname = document.getElementById("add-plant-nickname").value.trim() || "My Plant";
        const speciesId = document.getElementById("add-plant-species").value;
        const selectedBase = PLANT_DATABASE.find(p => p.id === speciesId) || PLANT_DATABASE[0];

        const newPlant = {
          id: `g_${Date.now()}`,
          nickname: nickname,
          commonName: selectedBase.commonName,
          botanicalName: selectedBase.botanicalName,
          icon: selectedBase.icon,
          photo: selectedBase.image || `assets/plants/${selectedBase.id}.jpg`,
          healthScore: 92,
          nextWaterDays: selectedBase.wateringInterval,
          wateringInterval: selectedBase.wateringInterval,
          petToxicity: selectedBase.petToxicity
        };

        this.myPlants.unshift(newPlant);
        this.saveGarden();
        this.renderGardenList();
        modal.classList.remove("active");
        document.getElementById("add-plant-nickname").value = "";
      });
    }
  }

  initLuxPlantPickerModal() {
    const openBtn = document.getElementById("btn-open-lux-plant-picker");
    const modal = document.getElementById("modal-select-lux-plant");
    const closeBtn = document.getElementById("btn-close-lux-picker");

    if (openBtn && modal) {
      openBtn.addEventListener("click", () => {
        if (!purchasesManager.isPro) {
          this.showPaywall("luxmeter_plant_picker");
          return;
        }
        this.renderLuxPickerList(modal);
        modal.classList.add("active");
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener("click", () => modal.classList.remove("active"));
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("active");
      });
    }
  }

  initSettings() {
    const openBtn = document.getElementById("btn-open-settings");
    const modal = document.getElementById("modal-settings");
    const closeBtn = document.getElementById("btn-close-settings-modal");
    const proBadge = document.getElementById("settings-pro-badge");
    const proTier = document.getElementById("settings-pro-tier");
    const proDesc = document.getElementById("settings-pro-desc");
    const proActionBtn = document.getElementById("settings-pro-action-btn");
    const restoreBtn = document.getElementById("btn-settings-restore");

    const updateSettingsProState = () => {
      const isPro = purchasesManager.isPro;
      if (isPro) {
        if (proBadge) {
          proBadge.textContent = "● ACTIVE SUBSCRIBER";
          proBadge.style.color = "#00F076";
        }
        if (proTier) proTier.textContent = "Flora Pro Unlimited";
        if (proDesc) proDesc.textContent = "All clinical diagnostic protocols, smart luxmeter, and watering intelligence unlocked.";
        if (proActionBtn) {
          proActionBtn.textContent = "Subscribed via Apple StoreKit";
          proActionBtn.style.background = "rgba(0, 240, 118, 0.2)";
          proActionBtn.style.color = "#00F076";
          proActionBtn.onclick = () => {
            alert("Your Flora Pro subscription is active and managed through your Apple ID settings.");
          };
        }
      } else {
        if (proBadge) {
          proBadge.textContent = "FREE TIER";
          proBadge.style.color = "#FFE600";
        }
        if (proTier) proTier.textContent = "Flora Free";
        if (proDesc) proDesc.textContent = "Unlock unlimited AI plant scans, clinical recovery protocols, and camera luxmeter.";
        if (proActionBtn) {
          proActionBtn.textContent = "Upgrade to Flora Pro";
          proActionBtn.style.background = "#00F076";
          proActionBtn.style.color = "#000000";
          proActionBtn.onclick = () => {
            if (modal) modal.classList.remove("active");
            this.showPaywall("settings_pro_upgrade");
          };
        }
      }
    };

    if (openBtn && modal) {
      openBtn.addEventListener("click", () => {
        updateSettingsProState();
        modal.classList.add("active");
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener("click", () => modal.classList.remove("active"));
    }

    // Tap backdrop to dismiss modal
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("active");
      });
    }

    if (restoreBtn) {
      restoreBtn.addEventListener("click", async () => {
        const origText = restoreBtn.innerHTML;
        restoreBtn.innerHTML = `
          <div class="settings-row-left">
            <span class="settings-row-icon">⏳</span>
            <span>Restoring Purchases...</span>
          </div>
        `;
        try {
          const success = await purchasesManager.restorePurchases();
          if (success) {
            updateSettingsProState();
            this.renderProStatusBadge();
            restoreBtn.innerHTML = `
              <div class="settings-row-left">
                <span class="settings-row-icon">✓</span>
                <span style="color: #00F076;">Purchases Restored</span>
              </div>
            `;
          } else {
            alert("No previous Flora Pro subscription found for this Apple ID.");
            restoreBtn.innerHTML = origText;
          }
        } catch (err) {
          alert("Restore error: " + (err?.message || err));
          restoreBtn.innerHTML = origText;
        }
        setTimeout(() => {
          restoreBtn.innerHTML = origText;
        }, 2500);
      });
    }



    // App Store Native Rating Prompt Trigger
    const rateBtn = document.getElementById("btn-settings-rate-app");
    if (rateBtn) {
      rateBtn.addEventListener("click", async () => {
        const origContent = rateBtn.innerHTML;
        rateBtn.innerHTML = `
          <div class="settings-row-left">
            <span class="settings-row-icon">⭐</span>
            <span style="color: #FFE600;">Opening App Store...</span>
          </div>
        `;
        await notificationsManager.requestStoreReview(true);
        setTimeout(() => {
          rateBtn.innerHTML = origContent;
        }, 2000);
      });
    }
  }

  renderLuxPickerList(modal) {
    const listEl = document.getElementById("lux-picker-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    // 1. Reset / Ambient Option (Always available at the top)
    const ambientItem = document.createElement("div");
    ambientItem.className = "lux-picker-item";
    ambientItem.innerHTML = `
      <div class="lux-picker-item-left">
        <span class="lux-picker-item-icon" style="font-size: 26px;">💡</span>
        <div>
          <div class="lux-picker-item-name">General Ambient Light</div>
          <div class="lux-picker-item-sub">Measure room illumination without plant filter</div>
        </div>
      </div>
      <span class="lux-picker-item-lux">Universal</span>
    `;
    ambientItem.addEventListener("click", () => {
      modal.classList.remove("active");
      if (this.lightMeter) {
        this.lightMeter.clearTargetPlant();
        if (!this.lightMeter.active) {
          this.lightMeter.start();
        }
      }
    });
    listEl.appendChild(ambientItem);

    // 2. User's Real Garden Plants
    if (this.myPlants && this.myPlants.length > 0) {
      const gTitle = document.createElement("div");
      gTitle.className = "lux-picker-section-title";
      gTitle.textContent = "Your Garden Plants";
      listEl.appendChild(gTitle);

      this.myPlants.forEach(p => {
        const item = document.createElement("div");
        item.className = "lux-picker-item";
        const thumb = this.getPlantPhoto(p);
        item.innerHTML = `
          <div class="lux-picker-item-left">
            <img src="${thumb}" class="lux-picker-thumb" alt="${p.commonName}">
            <div>
              <div class="lux-picker-item-name">${p.nickname || p.commonName}</div>
              <div class="lux-picker-item-sub">${p.botanicalName || p.commonName}</div>
            </div>
          </div>
          <span class="lux-picker-item-lux">${p.lightRequirement ? p.lightRequirement.split('(')[0].trim() : "2,500 LUX"}</span>
        `;
        item.addEventListener("click", () => {
          modal.classList.remove("active");
          if (this.lightMeter) {
            p.photo = thumb;
            this.lightMeter.setTargetPlant(p);
            if (!this.lightMeter.active) {
              this.lightMeter.start();
            }
          }
        });
        listEl.appendChild(item);
      });
    } else {
      // Empty garden helper
      const emptyNote = document.createElement("div");
      emptyNote.style.cssText = "text-align: center; padding: 24px 16px 12px; color: var(--text-secondary);";
      emptyNote.innerHTML = `
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px; color: var(--text-primary);">No Plants in Your Garden Yet</div>
        <div style="font-size: 13px; line-height: 1.4;">Add or scan plants in the Garden tab to calibrate lighting for specific specimens.</div>
      `;
      listEl.appendChild(emptyNote);
    }
  }

  renderDiagnosis(plant) {

    this.lastDiagnosedPlant = plant;

    const nameEl = document.getElementById("diag-plant-name");
    if (nameEl) nameEl.textContent = plant.nickname || plant.commonName || "Monstera Deliciosa";

    const botanicalEl = document.getElementById("diag-plant-botanical");
    if (botanicalEl) botanicalEl.textContent = plant.botanicalName || plant.commonName || "Monstera deliciosa";

    const photoSrc = this.getPlantPhoto(plant);
    const heroPhotoEl = document.getElementById("diag-hero-photo");
    const photoTagEl = document.getElementById("diag-photo-tag");
    if (heroPhotoEl) {
      heroPhotoEl.src = photoSrc;
    }
    if (photoTagEl) {
      photoTagEl.textContent = plant.userPhoto ? "LIVE SCAN" : "SPECIMEN";
    }

    const score = plant.healthScore || 72;
    const healthNumEl = document.getElementById("diag-health-number");
    if (healthNumEl) {
      healthNumEl.textContent = "0%";
      const startTime = performance.now();
      const duration = 700;
      const animateHealth = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const cur = Math.round(eased * score);
        healthNumEl.textContent = `${cur}%`;
        if (progress < 1) requestAnimationFrame(animateHealth);
      };
      setTimeout(() => requestAnimationFrame(animateHealth), 80);
    }

    const statusBadge = document.getElementById("diag-status-badge");
    const statusDot = document.getElementById("diag-status-dot");
    if (statusBadge && statusDot) {
      if (score >= 85) {
        statusBadge.textContent = "Thriving & Healthy";
        statusBadge.parentElement.style.color = "#00F076";
        statusBadge.parentElement.style.borderColor = "rgba(0, 240, 118, 0.35)";
        statusBadge.parentElement.style.background = "rgba(0, 240, 118, 0.12)";
        statusDot.style.background = "#00F076";
      } else if (score >= 60) {
        statusBadge.textContent = "Requires Care";
        statusBadge.parentElement.style.color = "#FFE600";
        statusBadge.parentElement.style.borderColor = "rgba(255, 230, 0, 0.35)";
        statusBadge.parentElement.style.background = "rgba(255, 230, 0, 0.12)";
        statusDot.style.background = "#FFE600";
      } else {
        statusBadge.textContent = "Critical Infection";
        statusBadge.parentElement.style.color = "#FF5555";
        statusBadge.parentElement.style.borderColor = "rgba(255, 85, 85, 0.35)";
        statusBadge.parentElement.style.background = "rgba(255, 85, 85, 0.12)";
        statusDot.style.background = "#FF5555";
      }
    }

    const condTitle = document.getElementById("diag-condition-title");
    if (condTitle) condTitle.textContent = plant.condition || "Leaf Rust (Puccinia)";

    const causeDesc = document.getElementById("diag-cause-desc");
    if (causeDesc) causeDesc.textContent = plant.cause || "Excess foliage moisture and poor ventilation allowed fungal spores to colonize leaf tissue.";

    // Render Pet Safety Card
    const petCard = document.getElementById("diag-pet-card");
    const petIcon = document.getElementById("diag-pet-icon");
    const petTitle = document.getElementById("diag-pet-title");
    const petDesc = document.getElementById("diag-pet-desc");

    if (petCard) {
      if (plant.petToxicity) {
        petCard.style.display = "block";
        if (plant.petToxicity.isToxic) {
          petCard.className = "diag-card pet-safety toxic";
          if (petIcon) petIcon.textContent = "⚠️";
          if (petTitle) petTitle.textContent = "Harmful to Pets (Toxic)";
          if (petDesc) petDesc.textContent = plant.petToxicity.notes || "Contains compounds harmful or irritating to cats and dogs.";
        } else {
          petCard.className = "diag-card pet-safety non-toxic";
          if (petIcon) petIcon.textContent = "🐾";
          if (petTitle) petTitle.textContent = "Pet Friendly & Non-Toxic";
          if (petDesc) petDesc.textContent = plant.petToxicity.notes || "Safe for households with cats and dogs.";
        }
      } else {
        petCard.style.display = "none";
      }
    }

    const rx = plant.rx || [
      { step: "Adjust Watering", action: "Pause watering for 4–5 days. Wait until the top 2 inches of soil are dry." },
      { step: "Optimize Lighting & Air", action: "Relocate to bright indirect sunlight and improve room ventilation to dry leaf surfaces." },
      { step: "Clinical Treatment Protocol", action: "Wipe affected foliage with dilute copper fungicide or organic neem oil spray." }
    ];

    const waterAction = document.getElementById("diag-action-water");
    if (waterAction) waterAction.textContent = rx[0]?.action || "Pause watering for 4–5 days. Wait until the top 2 inches of soil are dry.";

    // Seasonal Watering Calculation
    const baseInterval = plant.wateringInterval || 8;
    const summerMin = Math.max(3, Math.round(baseInterval * 0.8));
    const summerMax = Math.max(4, Math.round(baseInterval * 1.05));
    const winterMin = Math.round(baseInterval * 1.4);
    const winterMax = Math.round(baseInterval * 1.85);

    const waterSummerEl = document.getElementById("diag-water-summer");
    if (waterSummerEl) waterSummerEl.textContent = `Every ${summerMin}–${summerMax}d`;

    const waterWinterEl = document.getElementById("diag-water-winter");
    if (waterWinterEl) waterWinterEl.textContent = `Every ${winterMin}–${winterMax}d`;

    const lightAction = document.getElementById("diag-action-light");
    if (lightAction) lightAction.textContent = rx[1]?.action || "Relocate to bright indirect sunlight and improve room ventilation to dry leaf surfaces.";

    // Wire up Target Lux Badge and Luxmeter Launch Button
    const luxBadge = document.getElementById("diag-lux-val-badge");
    const luxReq = plant.lightRequirement || "Bright Indirect (2,500 – 4,500 LUX)";
    if (luxBadge) {
      luxBadge.textContent = luxReq;
    }

    const btnDiagLux = document.getElementById("btn-diag-luxmeter");
    if (btnDiagLux) {
      btnDiagLux.onclick = () => {
        if (!purchasesManager.isPro) {
          this.showPaywall("diagnosis_luxmeter_button");
          return;
        }
        if (this.lightMeter) {
          this.lightMeter.setTargetPlant(plant);
        }
        this.switchScreen("luxmeter");
        if (this.lightMeter && !this.lightMeter.active) {
          this.lightMeter.start();
        }
      };
    }

    const fertValEl = document.getElementById("diag-fert-val");
    if (fertValEl) {
      fertValEl.textContent = plant.fertilizer || "Balanced NPK 20-20-20 every 14 days during active growth (March–Oct). Pause completely in winter.";
    }

    const treatmentAction = document.getElementById("diag-action-treatment");
    const treatmentBlock = document.getElementById("diag-step-treatment");
    const lockedBanner = document.getElementById("diag-pro-locked-banner");
    const isPro = purchasesManager.isPro;


    if (treatmentAction) {
      if (isPro) {
        treatmentAction.textContent = rx[2]?.action || "Wipe affected foliage with dilute copper fungicide or organic neem oil spray.";
        if (treatmentBlock) {
          treatmentBlock.classList.remove("locked-step");
          treatmentBlock.onclick = null;
        }
      } else {
        treatmentAction.textContent = "Clinical dosage schedule and fungicide mixing ratios are exclusive to Flora Pro.";
        if (treatmentBlock) {
          treatmentBlock.classList.add("locked-step");
          treatmentBlock.onclick = () => this.showPaywall("diagnosis_treatment_step");
        }
      }
    }

    if (lockedBanner) {
      lockedBanner.style.display = isPro ? "none" : "flex";
      const unlockBtn = document.getElementById("btn-unlock-rx-pro");
      if (unlockBtn) {
        unlockBtn.onclick = () => this.showPaywall("diagnosis_treatment_banner");
      }
    }

    const inGarden = this.myPlants.some(p => p.id === plant.id || (p.nickname && p.nickname === plant.nickname && p.commonName === plant.commonName));
    const addBtn = document.getElementById("add-to-garden-btn");
    if (addBtn) {
      if (inGarden) {
        addBtn.innerHTML = `<span>💧 Water Now (+5% Vitality)</span>`;
        addBtn.className = "btn-secondary";
        addBtn.onclick = () => {
          const target = this.myPlants.find(p => p.id === plant.id || (p.nickname && p.nickname === plant.nickname && p.commonName === plant.commonName));
          if (target) {
            target.nextWaterDays = target.wateringInterval || 7;
            target.healthScore = Math.min(100, (target.healthScore || 80) + 5);
            this.saveGarden();
            this.renderGardenList();
          }
          this.showScreen("dashboard");
        };
      } else {
        addBtn.innerHTML = `<span>+ Add to My Garden</span>`;
        addBtn.className = "btn-primary";
        addBtn.onclick = () => {
          const photoToSave = plant.userPhoto || plant.photo || plant.image || this.getPlantPhoto(plant);
          this.myPlants.unshift({
            id: `g_${Date.now()}`,
            nickname: plant.nickname || plant.commonName,
            commonName: plant.commonName,
            botanicalName: plant.botanicalName,
            icon: plant.icon || "🪴",
            photo: photoToSave,
            healthScore: plant.healthScore || 75,
            nextWaterDays: plant.wateringInterval || 7,
            wateringInterval: plant.wateringInterval || 7,
            petToxicity: plant.petToxicity
          });
          this.saveGarden();
          this.renderGardenList();
          this.showScreen("dashboard");
        };
      }
    }

    // Schedule clinical recovery follow-up notification in 3 days if plant has a condition
    if (plant.condition && !plant.condition.toLowerCase().includes("healthy")) {
      notificationsManager.scheduleTreatmentFollowUp(plant, 3);
    }

    // High-satisfaction moment: Trigger native App Store rating prompt (cooldown handled)
    const scanCount = parseInt(localStorage.getItem("flora_scans_count") || "0", 10) + 1;
    localStorage.setItem("flora_scans_count", String(scanCount));
    if (scanCount === 1 || scanCount === 3) {
      setTimeout(() => {
        notificationsManager.requestStoreReview(false);
      }, 3000);
    }

    this.showScreen("diagnosis");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.floraApp = new FloraApp();
});
