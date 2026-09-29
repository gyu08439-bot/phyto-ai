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
  }

  loadGarden() {
    try {
      const saved = localStorage.getItem("flora_garden_v3");
      if (saved) {
        this.myPlants = JSON.parse(saved);
      } else {
        this.myPlants = [
          {
            id: "g_1",
            nickname: "Living Room Monstera",
            commonName: PLANT_DATABASE[0].commonName,
            botanicalName: PLANT_DATABASE[0].botanicalName,
            icon: PLANT_DATABASE[0].icon,
            healthScore: 78,
            nextWaterDays: 2,
            wateringInterval: PLANT_DATABASE[0].wateringInterval,
            petToxicity: PLANT_DATABASE[0].petToxicity
          },
          {
            id: "g_2",
            nickname: "Balcony Ficus",
            commonName: PLANT_DATABASE[1].commonName,
            botanicalName: PLANT_DATABASE[1].botanicalName,
            icon: PLANT_DATABASE[1].icon,
            healthScore: 88,
            nextWaterDays: 6,
            wateringInterval: PLANT_DATABASE[1].wateringInterval,
            petToxicity: PLANT_DATABASE[1].petToxicity
          },
          {
            id: "g_3",
            nickname: "Desk Snake Plant",
            commonName: PLANT_DATABASE[2].commonName,
            botanicalName: PLANT_DATABASE[2].botanicalName,
            icon: PLANT_DATABASE[2].icon,
            healthScore: 94,
            nextWaterDays: 14,
            wateringInterval: PLANT_DATABASE[2].wateringInterval,
            petToxicity: PLANT_DATABASE[2].petToxicity
          }
        ];
        this.saveGarden();
      }
    } catch (e) {
      console.warn("LocalStorage error:", e);
    }
  }

  saveGarden() {
    try {
      localStorage.setItem("flora_garden_v3", JSON.stringify(this.myPlants));
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

    if (screenKey !== "luxmeter" && this.lightMeter) {
      this.lightMeter.stop();
    }
  }

  initTabBar() {
    document.querySelectorAll(".tab-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        if (target) {
          this.showScreen(target);
          if (target === "scanner") {
            this.scanner.startCamera();
          } else {
            this.scanner.stopCamera();
          }
        }
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
      "Connecting to Llama 3.2 Vision AI...",
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
        setTimeout(() => this.showScreen("paywall"), 300);
      }
    }, 45);
  }

  showPaywall(reason = "") {
    this.showScreen("paywall");
    const ctaBtn = document.getElementById("paywall-cta-btn");
    const trialNote = document.getElementById("paywall-trial-note");
    const arrowSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
    if (this.selectedPlan === "yearly") {
      if (ctaBtn) ctaBtn.innerHTML = `<span>Start 3-Day Free Trial</span>${arrowSvg}`;
      if (trialNote) trialNote.innerHTML = `Plans auto-renew until canceled in App Store settings. 3 days free, then $29.99/year. <a href="#">Terms</a> · <a href="#">Privacy</a>`;
    } else {
      if (ctaBtn) ctaBtn.innerHTML = `<span>Subscribe for $7.99 / mo</span>${arrowSvg}`;
      if (trialNote) trialNote.innerHTML = `Plans auto-renew until canceled in App Store settings. $7.99/month. <a href="#">Terms</a> · <a href="#">Privacy</a>`;
    }
  }

  initPaywall() {
    const yearlyCard = document.getElementById("plan-yearly");
    const monthlyCard = document.getElementById("plan-monthly");
    const ctaBtn = document.getElementById("paywall-cta-btn");
    const closeBtn = document.getElementById("paywall-close-btn");
    const restoreBtn = document.getElementById("paywall-restore-btn");
    const trialNote = document.getElementById("paywall-trial-note");
    const arrowSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

    if (yearlyCard && monthlyCard) {
      yearlyCard.addEventListener("click", () => {
        yearlyCard.classList.add("selected", "active");
        monthlyCard.classList.remove("selected", "active");
        this.selectedPlan = "yearly";
        if (ctaBtn) ctaBtn.innerHTML = `<span>Start 3-Day Free Trial</span>${arrowSvg}`;
        if (trialNote) trialNote.innerHTML = `Plans auto-renew until canceled in App Store settings. 3 days free, then $29.99/year. <a href="#">Terms</a> · <a href="#">Privacy</a>`;
      });

      monthlyCard.addEventListener("click", () => {
        monthlyCard.classList.add("selected", "active");
        yearlyCard.classList.remove("selected", "active");
        this.selectedPlan = "monthly";
        if (ctaBtn) ctaBtn.innerHTML = `<span>Subscribe for $7.99 / mo</span>${arrowSvg}`;
        if (trialNote) trialNote.innerHTML = `Plans auto-renew until canceled in App Store settings. $7.99/month. <a href="#">Terms</a> · <a href="#">Privacy</a>`;
      });
    }

    if (ctaBtn) {
      ctaBtn.addEventListener("click", async () => {
        ctaBtn.innerHTML = `<span>Connecting Apple StoreKit...</span>`;
        try {
          const res = await purchasesManager.purchasePlan(this.selectedPlan);
          if (res.success) {
            ctaBtn.innerHTML = `<span>✓ Subscribed to Flora Pro</span>`;
            setTimeout(() => {
              if (this.lastDiagnosedPlant && this.currentScreen === "paywall") {
                this.renderDiagnosis(this.lastDiagnosedPlant);
              } else {
                this.showScreen("dashboard");
              }
            }, 600);
          } else {
            ctaBtn.innerHTML = this.selectedPlan === "yearly"
              ? `<span>Start 3-Day Free Trial</span>${arrowSvg}`
              : `<span>Subscribe for $7.99 / mo</span>${arrowSvg}`;
          }
        } catch (e) {
          console.error("Purchase error:", e);
          ctaBtn.innerHTML = this.selectedPlan === "yearly"
            ? `<span>Start 3-Day Free Trial</span>${arrowSvg}`
            : `<span>Subscribe for $7.99 / mo</span>${arrowSvg}`;
        }
      });
    }

    if (restoreBtn) {
      restoreBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        restoreBtn.textContent = "Restoring...";
        const res = await purchasesManager.restorePurchases();
        if (res.restored) {
          alert("Success! Your Flora Pro subscription has been restored.");
          if (this.lastDiagnosedPlant) {
            this.renderDiagnosis(this.lastDiagnosedPlant);
          } else {
            this.showScreen("dashboard");
          }
        } else {
          alert("No active Flora Pro subscription found for this Apple ID.");
        }
        restoreBtn.textContent = "Restore Purchases";
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (this.lastDiagnosedPlant && this.currentScreen === "paywall") {
          this.renderDiagnosis(this.lastDiagnosedPlant);
        } else {
          this.showScreen("dashboard");
        }
      });
    }
  }

  initScanner() {
    this.scanner = new PlantScanner({
      beforeScan: () => {
        if (!purchasesManager.isPro && this.freeScansUsed >= 1) {
          this.showPaywall("scanner_limit");
          return false;
        }
        return true;
      },
      onDiagnosisReady: (plant) => {
        if (!purchasesManager.isPro) {
          this.freeScansUsed++;
          localStorage.setItem("flora_free_scans_used", this.freeScansUsed);
        }
        this.renderDiagnosis(plant);
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
  }

  initLightMeter() {
    this.lightMeter = new LightMeter();
  }

  initDashboard() {
    this.renderGardenList();

    document.querySelectorAll(".segment-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".segment-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.gardenFilter = btn.getAttribute("data-filter") || "all";
        this.renderGardenList();
      });
    });
  }

  renderGardenList() {
    const container = document.getElementById("garden-plants-list");
    const vitalityDisplay = document.getElementById("garden-vitality-score");
    const countDisplay = document.getElementById("garden-count-badge");
    if (!container) return;

    let list = this.myPlants;
    if (this.gardenFilter === "water") {
      list = this.myPlants.filter(p => p.nextWaterDays <= 2);
    } else if (this.gardenFilter === "treatment") {
      list = this.myPlants.filter(p => (p.healthScore || 80) < 80);
    }

    const avgHealth = this.myPlants.length > 0
      ? Math.round(this.myPlants.reduce((sum, p) => sum + (p.healthScore || 80), 0) / this.myPlants.length)
      : 100;

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
      `;

      const waterBtn = el.querySelector(".btn-water-item");
      waterBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.waterPlant(plant.id, waterBtn);
      });

      container.appendChild(el);
    });
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
      openBtn.addEventListener("click", () => modal.classList.add("active"));
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
    document.getElementById("diag-plant-name").textContent = plant.commonName || "Plant Diagnosed";
    document.getElementById("diag-botanical-name").textContent = plant.botanicalName || "Botanical Profile";
    document.getElementById("diag-health-number").textContent = `${plant.healthScore || 70}%`;
    document.getElementById("diag-condition-title").textContent = plant.condition || "Identified Condition";
    document.getElementById("diag-cause-desc").textContent = plant.cause || "Analysis indicates stress factors in lighting or root aeration.";

    const petAlert = document.getElementById("diag-pet-alert");
    if (petAlert) {
      if (plant.petToxicity && plant.petToxicity.isToxic) {
        petAlert.className = "diag-pill-alert toxic";
        petAlert.innerHTML = `⚠️ <strong>Pet Warning:</strong> ${plant.petToxicity.notes || "Toxic to pets"}`;
      } else {
        petAlert.className = "diag-pill-alert safe";
        petAlert.innerHTML = `🐾 <strong>Pet-Safe Certified:</strong> Non-toxic to cats and dogs.`;
      }
    }

    const rxContainer = document.getElementById("diag-rx-steps");
    rxContainer.innerHTML = "";
    const rxSteps = plant.rx || [
      { step: "Aerate Root Zone", action: "Allow topsoil to dry before watering." },
      { step: "Optimize Light", action: "Move to bright indirect light." },
      { step: "Foliar Feed", action: "Mist leaves with dilute micronutrient solution." }
    ];

    const isPro = purchasesManager.isPro;
    const lockedBanner = document.getElementById("diag-pro-locked-banner");
    if (lockedBanner) {
      lockedBanner.style.display = isPro ? "none" : "flex";
    }

    rxSteps.forEach((r, idx) => {
      const step = document.createElement("div");
      const isLocked = !isPro && idx > 0;
      step.className = `rx-item ${isLocked ? "locked" : ""}`;
      step.innerHTML = `
        <div class="rx-num">${idx + 1}</div>
        <div>
          <div class="rx-title">${r.step} ${isLocked ? "🔒" : ""}</div>
          <div class="rx-action">${isLocked ? "Step dosages, fungicide dilution, and clinical recovery schedule are Flora Pro exclusive." : r.action}</div>
        </div>
      `;
      if (isLocked) {
        step.style.cursor = "pointer";
        step.addEventListener("click", () => this.showPaywall("rx_step_click"));
      }
      rxContainer.appendChild(step);
    });

    const addBtn = document.getElementById("add-to-garden-btn");
    addBtn.onclick = () => {
      this.myPlants.unshift({
        id: `g_${Date.now()}`,
        nickname: plant.commonName,
        commonName: plant.commonName,
        botanicalName: plant.botanicalName,
        icon: "🪴",
        healthScore: plant.healthScore || 75,
        nextWaterDays: plant.wateringInterval || 7,
        wateringInterval: plant.wateringInterval || 7,
        petToxicity: plant.petToxicity
      });
      this.saveGarden();
      this.renderGardenList();
      this.showScreen("dashboard");
    };

    this.showScreen("diagnosis");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.floraApp = new FloraApp();
});
