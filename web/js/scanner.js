
import { PLANT_DATABASE } from "./data.js";

const WORKER_AI_ENDPOINT = "https://flora-ai-backend.godshopmod.workers.dev/api/diagnose";

export class PlantScanner {
  constructor(options = {}) {
    this.onDiagnosisReady = options.onDiagnosisReady || (() => {});
    this.beforeScan = options.beforeScan || (() => true);
    this.cameraFeed = document.getElementById("camera-feed");
    this.cameraPreview = document.getElementById("camera-preview");
    this.cameraCard = document.getElementById("camera-card-tap");
    this.laser = document.getElementById("scanner-laser");
    this.triggerBtn = document.getElementById("btn-capture-scan");
    this.presetChips = document.querySelectorAll(".preset-chip");
    this.fileInput = document.getElementById("scanner-file-input");

    this.isScanning = false;
    this.stream = null;

    this.init();
  }

  init() {
    if (this.triggerBtn) {
      this.triggerBtn.addEventListener("click", () => {
        this.captureAndScan();
      });
    }

    if (this.fileInput) {
      this.fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (this.beforeScan && !this.beforeScan()) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          const dataUrl = re.target.result;
          if (this.cameraPreview) {
            this.cameraPreview.src = dataUrl;
            this.cameraPreview.style.display = "block";
          }
          if (this.cameraFeed) this.cameraFeed.style.display = "none";
          this.runSilentScan(dataUrl);
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      });
    }

    if (this.cameraCard) {
      this.cameraCard.addEventListener("click", () => {
        if (!this.stream) {
          this.startCamera();
        }
      });
    }

    this.presetChips.forEach(chip => {
      chip.addEventListener("click", () => {
        if (this.beforeScan && !this.beforeScan()) return;
        const presetId = chip.getAttribute("data-id");
        this.runPresetScan(presetId);
      });
    });
  }

  async startCamera() {
    try {
      if (this.stream) return;
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      if (this.cameraFeed) {
        this.cameraFeed.srcObject = this.stream;
        await this.cameraFeed.play();
        this.cameraFeed.style.display = "block";
        if (this.cameraPreview) this.cameraPreview.style.display = "none";
      }
    } catch (err) {
      console.warn("Live camera stream note:", err);
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  async captureAndScan() {
    if (this.beforeScan && !this.beforeScan()) return;
    if (this.isScanning) return;

    let capturedDataUrl = null;

    // Grab live frame directly from <video> element onto a canvas
    if (this.cameraFeed && this.stream && this.cameraFeed.videoWidth > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = this.cameraFeed.videoWidth;
      canvas.height = this.cameraFeed.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(this.cameraFeed, 0, 0, canvas.width, canvas.height);
      capturedDataUrl = canvas.toDataURL("image/jpeg", 0.82);

      // Freeze captured frame in the custom in-app viewfinder
      if (this.cameraPreview) {
        this.cameraPreview.src = capturedDataUrl;
        this.cameraPreview.style.display = "block";
      }
      this.cameraFeed.style.display = "none";
    }

    // Start silent laser scanning animation (ZERO words/status text)
    this.runSilentScan(capturedDataUrl);
  }

  async runSilentScan(imageDataUrl) {
    if (this.isScanning) return;
    this.isScanning = true;

    // Turn on laser sweep (pure visual animation, NO words)
    if (this.laser) this.laser.style.display = "block";

    let diagnosisResult = null;
    if (imageDataUrl) {
      try {
        const response = await fetch(WORKER_AI_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageDataUrl })
        });
        if (response.ok) {
          diagnosisResult = await response.json();
        }
      } catch (e) {
        console.warn("Worker inference error:", e);
      }
    }

    if (!diagnosisResult) {
      diagnosisResult = {
        isPlant: false,
        errorTitle: "Unable to Analyze",
        errorMessage: "Network connection timed out. Please check your connection and point the camera at a live plant leaf."
      };
    }

    // Exact 1.5s scanning laser duration for high perceived-value AI sweep
    setTimeout(() => {
      if (this.laser) this.laser.style.display = "none";
      this.isScanning = false;
      this.onDiagnosisReady(diagnosisResult);
    }, 1500);
  }

  runPresetScan(presetId) {
    if (this.isScanning) return;
    this.isScanning = true;

    if (this.laser) this.laser.style.display = "block";
    const match = PLANT_DATABASE.find(p => p.id === presetId) || PLANT_DATABASE[0];

    // Silent laser scan without any text or words underneath
    setTimeout(() => {
      if (this.laser) this.laser.style.display = "none";
      this.isScanning = false;
      this.onDiagnosisReady(match);
    }, 1500);
  }
}
