import { PLANT_DATABASE } from './data.js';

export class LightMeter {
  constructor(options = {}) {
    this.videoEl = document.getElementById('lux-video-stream');
    this.luxDisplay = document.getElementById('lux-value-display');
    this.zoneBadge = document.getElementById('lux-zone-badge');
    this.zoneDesc = document.getElementById('lux-zone-desc');
    this.gaugeProgress = document.getElementById('lux-gauge-bar');
    this.recommendationsContainer = document.getElementById('lux-recommended-plants');
    this.startBtn = document.getElementById('lux-start-btn');
    
    // Target Plant Elements
    this.targetBanner = document.getElementById('lux-target-banner');
    this.targetIcon = document.getElementById('lux-target-icon');
    this.targetName = document.getElementById('lux-target-name');
    this.targetRange = document.getElementById('lux-target-range');
    this.clearTargetBtn = document.getElementById('lux-clear-target-btn');
    this.targetPlant = null;
    
    this.stream = null;
    this.animFrame = null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 64;
    this.canvas.height = 64;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.active = false;
    this.currentLux = 0;

    this.init();
  }

  init() {
    if (this.startBtn) {
      this.startBtn.addEventListener('click', () => {
        if (this.active) {
          this.stop();
        } else {
          this.start();
        }
      });
    }

    if (this.clearTargetBtn) {
      this.clearTargetBtn.addEventListener('click', () => {
        this.clearTargetPlant();
      });
    }
  }

  setTargetPlant(plant) {
    if (!plant) return;
    const name = plant.commonName || plant.nickname || plant.name || "Plant";
    const icon = plant.icon || "🪴";
    const reqStr = plant.lightRequirement || "Bright Indirect (2,500 - 4,500 Lux)";
    
    let minLux = 2000;
    let maxLux = 5000;
    const numbers = reqStr.replace(/,/g, '').match(/\d+/g);
    if (numbers && numbers.length >= 2) {
      minLux = parseInt(numbers[0], 10);
      maxLux = parseInt(numbers[1], 10);
    } else if (numbers && numbers.length === 1) {
      minLux = parseInt(numbers[0], 10);
      maxLux = minLux * 2;
    }

    this.targetPlant = {
      name,
      icon,
      requirementStr: reqStr,
      minLux,
      maxLux
    };

    if (this.targetBanner) {
      this.targetBanner.style.display = 'flex';
    }
    if (this.targetIcon) this.targetIcon.textContent = icon;
    if (this.targetName) this.targetName.textContent = name;
    if (this.targetRange) this.targetRange.textContent = `Need: ${minLux.toLocaleString()} – ${maxLux.toLocaleString()} LUX`;
    
    if (this.currentLux > 0) {
      this.updateUI(Math.round(this.currentLux));
    }
  }

  clearTargetPlant() {
    this.targetPlant = null;
    if (this.targetBanner) {
      this.targetBanner.style.display = 'none';
    }
    if (this.currentLux > 0) {
      this.updateUI(Math.round(this.currentLux));
    }
  }

  async start() {
    try {
      if (this.startBtn) {
        this.startBtn.innerHTML = '<span>Stop Meter</span>';
        this.startBtn.classList.add('active');
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });

      if (this.videoEl) {
        this.videoEl.srcObject = this.stream;
        await this.videoEl.play();
      }

      this.active = true;
      this.loop();
    } catch (err) {
      console.warn('Camera stream inaccessible for lux meter, using simulated ambient sensor:', err);
      this.simulateAmbient();
    }
  }

  stop() {
    this.active = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.startBtn) {
      this.startBtn.innerHTML = '<span>Start Camera Meter</span>';
      this.startBtn.classList.remove('active');
    }
  }

  loop() {
    if (!this.active) return;

    if (this.videoEl && this.videoEl.readyState >= 2) {
      this.ctx.drawImage(this.videoEl, 0, 0, 64, 64);
      const frameData = this.ctx.getImageData(0, 0, 64, 64).data;

      let totalLuma = 0;
      const count = 64 * 64;
      for (let i = 0; i < frameData.length; i += 4) {
        const r = frameData[i];
        const g = frameData[i + 1];
        const b = frameData[i + 2];
        totalLuma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      const avgLuma = totalLuma / count;
      // Exponential curve calibration to approximate lux range (0 to 12,000)
      const measuredLux = Math.round(Math.pow(avgLuma / 255, 1.8) * 12500);
      
      // Smooth interpolation
      this.currentLux += (measuredLux - this.currentLux) * 0.15;
      this.updateUI(Math.round(this.currentLux));
    }

    this.animFrame = requestAnimationFrame(() => this.loop());
  }

  simulateAmbient() {
    this.active = true;
    if (this.startBtn) {
      this.startBtn.innerHTML = '<span>Simulating Light</span>';
    }
    let simLux = 2850;
    const interval = setInterval(() => {
      if (!this.active) {
        clearInterval(interval);
        return;
      }
      simLux += (Math.random() - 0.48) * 120;
      simLux = Math.max(300, Math.min(8500, simLux));
      this.updateUI(Math.round(simLux));
    }, 200);
  }

  updateUI(lux) {
    if (this.luxDisplay) {
      this.luxDisplay.textContent = `${lux.toLocaleString()} LUX`;
    }

    let zoneTitle = 'Bright Indirect';
    let zoneDesc = 'Prime spot for tropical foliage. High photosynthesis without leaf burn.';
    let zoneColor = '#00F076';
    let filterCategory = 'bright';
    let progressPct = Math.min(100, (lux / 8000) * 100);

    // If target plant is selected, provide dedicated plant diagnosis:
    if (this.targetPlant) {
      const { name, minLux, maxLux } = this.targetPlant;
      progressPct = Math.min(100, (lux / (maxLux * 1.4)) * 100);

      if (lux < minLux) {
        const deficit = minLux - lux;
        zoneTitle = `Too Dim for ${name} (-${deficit.toLocaleString()} LUX)`;
        zoneDesc = `Current illumination is below the threshold for ${name}. Leaves will pale and growth will stall. Move 1 meter closer to window.`;
        zoneColor = '#60A5FA';
        filterCategory = 'low';
      } else if (lux > maxLux * 1.25) {
        zoneTitle = `⚠️ Too Harsh for ${name} (Burn Risk)`;
        zoneDesc = `Intense direct sunlight exceeds safe threshold for ${name}. Tender leaf cells may scorch. Filter with sheer curtain.`;
        zoneColor = '#EF4444';
        filterCategory = 'direct';
      } else {
        zoneTitle = `✓ Ideal Spot for ${name}!`;
        zoneDesc = `Spot-on photosynthetic radiation. Perfectly matched for ${name}'s chlorophyll requirements.`;
        zoneColor = '#00F076';
        filterCategory = 'bright';
      }
    } else {
      if (lux < 600) {
        zoneTitle = 'Deep Shade / Low Light';
        zoneDesc = 'Dim corner or windowless room. Only resilient low-light species survive here.';
        zoneColor = '#60A5FA';
        filterCategory = 'low';
      } else if (lux < 2200) {
        zoneTitle = 'Medium Filtered Light';
        zoneDesc = 'Soft ambient glow. Good for understory jungle plants and trailing vines.';
        zoneColor = '#FBBF24';
        filterCategory = 'medium';
      } else if (lux < 6000) {
        zoneTitle = 'Bright Indirect (Optimal)';
        zoneDesc = 'Perfect plant zone. 1-2 meters from East/South window with sheer curtains.';
        zoneColor = '#00F076';
        filterCategory = 'bright';
      } else {
        zoneTitle = 'Direct Scorching Sunlight';
        zoneDesc = 'Full sun. Risk of chlorophyll burn for delicate aroids. Ideal for succulents.';
        zoneColor = '#EF4444';
        filterCategory = 'direct';
      }
    }

    if (this.zoneBadge) {
      this.zoneBadge.textContent = zoneTitle;
      this.zoneBadge.style.color = zoneColor;
      this.zoneBadge.style.borderColor = `${zoneColor}44`;
      this.zoneBadge.style.background = `${zoneColor}18`;
    }

    if (this.zoneDesc) {
      this.zoneDesc.textContent = zoneDesc;
    }

    if (this.gaugeProgress) {
      this.gaugeProgress.style.width = `${progressPct}%`;
      this.gaugeProgress.style.background = zoneColor;
    }

    this.renderRecommendations(filterCategory);
  }


  renderRecommendations(category) {
    if (!this.recommendationsContainer) return;

    let filtered = PLANT_DATABASE.filter(p => {
      const lr = p.lightRequirement.toLowerCase();
      if (category === 'low') return lr.includes('low') || lr.includes('shade');
      if (category === 'medium') return lr.includes('medium') || lr.includes('filtered');
      if (category === 'bright') return lr.includes('bright') || lr.includes('indirect');
      return lr.includes('direct') || lr.includes('sun');
    });

    if (filtered.length === 0) filtered = PLANT_DATABASE.slice(0, 3);

    this.recommendationsContainer.innerHTML = filtered.map(p => `
      <div class="lux-plant-chip">
        <span class="lux-chip-icon">${p.icon}</span>
        <div class="lux-chip-text">
          <div class="lux-chip-name">${p.commonName}</div>
          <div class="lux-chip-light">${p.lightRequirement.split('(')[0].trim()}</div>
        </div>
      </div>
    `).join('');
  }
}
