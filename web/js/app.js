import { purchasesManager } from "./purchases.js";
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
    this.initPurchases();

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
        this.myPlants = JSON.parse(saved);
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
        if (trialNote) trialNote.innerHTML = `Plans auto-renew until canceled in App Store settings. 3 days free, then ${yearlyPrice}/year. <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>`;
      } else {
        if (ctaBtn) ctaBtn.innerHTML = `<span>Subscribe for ${yearlyPrice} / yr</span>${arrowSvg}`;
        if (trialNote) trialNote.innerHTML = `Plans auto-renew yearly until canceled in App Store settings. ${yearlyPrice}/year. <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>`;
      }
    } else {
      if (ctaBtn) ctaBtn.innerHTML = `<span>Subscribe for ${monthlyPrice} / mo</span>${arrowSvg}`;
      if (trialNote) trialNote.innerHTML = `Plans auto-renew monthly until canceled in App Store settings. ${monthlyPrice}/month. <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>`;
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

      el.innerHTML = `
        <div class="plant-item-avatar">${plant.icon || "🪴"}</div>
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

  initAddPlantModal() {
    const openBtn = document.getElementById("btn-open-add-plant");
    const modal = document.getElementById("modal-add-plant");
    const closeBtn = document.getElementById("btn-close-add-modal");
    const saveBtn = document.getElementById("btn-save-new-plant");
    const speciesSelect = document.getElementById("add-plant-species");

    if (speciesSelect) {
      speciesSelect.innerHTML = PLANT_DATABASE.map(p => `
        <option value="${p.id}">${p.icon} ${p.commonName}</option>
      `).join("");
    }

    if (openBtn && modal) {
      openBtn.addEventListener("click", () => {
        if (!purchasesManager.isPro) {
          this.showPaywall("garden_add_plant");
          return;
        }
        modal.classList.add("active");
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener("click", () => modal.classList.remove("active"));
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

  renderDiagnosis(plant) {
    this.lastDiagnosedPlant = plant;

    const nameEl = document.getElementById("diag-plant-name");
    if (nameEl) nameEl.textContent = plant.commonName || "Monstera Deliciosa";

    const score = plant.healthScore || 72;
    const healthNumEl = document.getElementById("diag-health-number");
    if (healthNumEl) healthNumEl.textContent = `${score}%`;

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

    const lightAction = document.getElementById("diag-action-light");
    if (lightAction) lightAction.textContent = rx[1]?.action || "Relocate to bright indirect sunlight and improve room ventilation to dry leaf surfaces.";

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

    const addBtn = document.getElementById("add-to-garden-btn");
    if (addBtn) {
      addBtn.onclick = () => {
        this.myPlants.unshift({
          id: `g_${Date.now()}`,
          nickname: plant.commonName,
          commonName: plant.commonName,
          botanicalName: plant.botanicalName,
          icon: plant.icon || "🪴",
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

    this.showScreen("diagnosis");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.floraApp = new FloraApp();
});
