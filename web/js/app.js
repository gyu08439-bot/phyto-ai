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
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        if (target) {
          this.showScreen(target);
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
      ctaBtn.addEventListener("click", () => {
        ctaBtn.innerHTML = `<span>✓ Subscribed to Flora Pro!</span>`;
        purchasesManager.isPro = true;
        localStorage.setItem("flora_pro_subscriber", "true");
        localStorage.setItem("flora_onboarding_completed", "true");
        setTimeout(() => {
          if (this.lastDiagnosedPlant && this.currentScreen === "paywall") {
            this.showScreen("diagnosis");
            this.renderDiagnosis(this.lastDiagnosedPlant);
          } else {
            this.showScreen("dashboard");
          }
        }, 450);
      });
    }

    if (restoreBtn) {
      restoreBtn.addEventListener("click", (e) => {
        e.preventDefault();
        restoreBtn.textContent = "Restoring...";
        purchasesManager.isPro = true;
        localStorage.setItem("flora_pro_subscriber", "true");
        localStorage.setItem("flora_onboarding_completed", "true");
        setTimeout(() => {
          restoreBtn.textContent = "✓ Restored Flora Pro";
          alert("Success! Your Flora Pro subscription has been restored.");
          if (this.lastDiagnosedPlant && this.currentScreen === "paywall") {
            this.showScreen("diagnosis");
            this.renderDiagnosis(this.lastDiagnosedPlant);
          } else {
            this.showScreen("dashboard");
          }
        }, 300);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        localStorage.setItem("flora_onboarding_completed", "true");
        if (this.lastDiagnosedPlant && this.currentScreen === "paywall") {
          this.showScreen("diagnosis");
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
        this.renderDiagnosis(plant);
      });

      const waterBtn = el.querySelector(".btn-water-item");
      waterBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
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
