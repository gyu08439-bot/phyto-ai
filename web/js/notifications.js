// ============================================================================
// Flora AI — Notifications & App Store Review Manager
// High-retention smart plant care reminders & StoreKit native rating prompts
// Conforms to Apple HIG and OWASP MASVS standards
// ============================================================================

class NotificationsManager {
  constructor() {
    this.isNative = false;
    this.plugin = null;
    this.reviewPlugin = null;
    this.enabled = localStorage.getItem("flora_notifications_enabled") !== "false";
    this.reminderTime = localStorage.getItem("flora_reminder_time") || "09:30";
    this.initialized = false;
  }

  /**
   * Initialize local notifications and in-app review plugins
   */
  async init() {
    if (this.initialized) return;

    this.isNative = !!(
      window.Capacitor &&
      (typeof window.Capacitor.isNativePlatform === "function"
        ? window.Capacitor.isNativePlatform()
        : window.Capacitor.platform === "ios" || window.Capacitor.platform === "android")
    );

    // Wait for native plugin bridge if on device
    let LocalNotifs = window.Capacitor?.Plugins?.LocalNotifications;
    let InAppRev = window.Capacitor?.Plugins?.InAppReview;

    if (this.isNative && (!LocalNotifs || !InAppRev)) {
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 100));
        LocalNotifs = window.Capacitor?.Plugins?.LocalNotifications;
        InAppRev = window.Capacitor?.Plugins?.InAppReview;
        if (LocalNotifs && InAppRev) break;
      }
    }

    this.plugin = LocalNotifs || window.Capacitor?.Plugins?.LocalNotifications || null;
    this.reviewPlugin = InAppRev || window.Capacitor?.Plugins?.InAppReview || null;

    if (this.plugin) {
      try {
        // Register listener for tapping notifications
        if (typeof this.plugin.addListener === "function") {
          this.plugin.addListener("localNotificationActionPerformed", (notification) => {
            console.log("[Flora Notifications] Notification tapped:", notification);
            const extra = notification?.notification?.extra;
            if (extra?.plantId) {
              window.dispatchEvent(
                new CustomEvent("flora:open_plant", { detail: { plantId: extra.plantId } })
              );
            }
          });
        }
      } catch (err) {
        console.warn("[Flora Notifications] Listener setup error:", err);
      }
    }

    this.initialized = true;
    console.log("[Flora Notifications] Initialized. Native:", this.isNative, "Enabled:", this.enabled);
  }

  /**
   * Request notification permission from iOS
   */
  async requestPermission() {
    if (this.plugin && typeof this.plugin.requestPermissions === "function") {
      try {
        const res = await this.plugin.requestPermissions();
        return res?.display === "granted";
      } catch (err) {
        console.warn("[Flora Notifications] requestPermissions error:", err);
        return false;
      }
    }

    if ("Notification" in window) {
      try {
        const res = await Notification.requestPermission();
        return res === "granted";
      } catch (e) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check current permission status
   */
  async checkPermission() {
    if (this.plugin && typeof this.plugin.checkPermissions === "function") {
      try {
        const res = await this.plugin.checkPermissions();
        return res?.display === "granted";
      } catch (e) {
        return false;
      }
    }
    if ("Notification" in window) {
      return Notification.permission === "granted";
    }
    return true;
  }

  /**
   * Generate positive 32-bit integer ID for Capacitor notifications
   */
  getNotificationId(plantId, type = "water") {
    const str = `${plantId}_${type}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 2147483640 + 10;
  }

  /**
   * Schedule recurring watering notification for a plant
   */
  async schedulePlantWatering(plant) {
    if (!this.enabled || !plant) return;

    const notifId = this.getNotificationId(plant.id, "water");
    const days = Math.max(1, plant.nextWaterDays || plant.wateringInterval || 7);
    const plantName = plant.nickname || plant.commonName || "Your plant";

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);

    const [hours, mins] = (this.reminderTime || "09:30").split(":").map(Number);
    targetDate.setHours(hours || 9, mins || 30, 0, 0);

    const notif = {
      id: notifId,
      title: `💧 Time to water ${plantName}!`,
      body: `Check the top 2 inches of soil. Give ${plantName} hydration and log it in Flora AI.`,
      schedule: { at: targetDate },
      extra: { plantId: plant.id, type: "watering" },
      sound: "default"
    };

    if (this.plugin && typeof this.plugin.schedule === "function") {
      try {
        // Cancel existing pending notification for this plant first
        await this.cancelNotification(notifId);
        await this.plugin.schedule({ notifications: [notif] });
        console.log(`[Flora Notifications] Scheduled watering for "${plantName}" at ${targetDate.toLocaleString()}`);
      } catch (err) {
        console.warn("[Flora Notifications] schedule error:", err);
      }
    } else {
      console.log(`[Flora Notifications Mock] Scheduled watering for "${plantName}" at ${targetDate.toLocaleString()}`);
    }
  }

  /**
   * Schedule clinical recovery checkup notification 3 days after scan
   */
  async scheduleTreatmentFollowUp(plant, days = 3) {
    if (!this.enabled || !plant) return;

    const notifId = this.getNotificationId(plant.id, "treatment");
    const plantName = plant.nickname || plant.commonName || "Your plant";

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    targetDate.setHours(11, 0, 0, 0);

    const notif = {
      id: notifId,
      title: `🔬 Health Check: How is ${plantName}?`,
      body: `It's time to check recovery progress after treatment. Snap a quick scan to verify leaf vitality.`,
      schedule: { at: targetDate },
      extra: { plantId: plant.id, type: "treatment" },
      sound: "default"
    };

    if (this.plugin && typeof this.plugin.schedule === "function") {
      try {
        await this.cancelNotification(notifId);
        await this.plugin.schedule({ notifications: [notif] });
        console.log(`[Flora Notifications] Scheduled treatment follow-up for "${plantName}" at ${targetDate.toLocaleString()}`);
      } catch (err) {
        console.warn("[Flora Notifications] schedule follow-up error:", err);
      }
    }
  }

  /**
   * Cancel specific notification ID
   */
  async cancelNotification(id) {
    if (this.plugin && typeof this.plugin.cancel === "function") {
      try {
        await this.plugin.cancel({ notifications: [{ id }] });
      } catch (e) {}
    }
  }

  /**
   * Cancel all notifications for a specific plant
   */
  async cancelPlantReminders(plantId) {
    await this.cancelNotification(this.getNotificationId(plantId, "water"));
    await this.cancelNotification(this.getNotificationId(plantId, "treatment"));
  }

  /**
   * Reschedule all active garden plants
   */
  async rescheduleAllGarden(plants = []) {
    if (!this.enabled) {
      if (this.plugin && typeof this.plugin.cancel === "function") {
        try {
          const pending = await this.plugin.getPending();
          if (pending?.notifications?.length) {
            await this.plugin.cancel({ notifications: pending.notifications });
          }
        } catch (e) {}
      }
      return;
    }

    for (const plant of plants) {
      await this.schedulePlantWatering(plant);
    }
  }

  /**
   * Send instant test notification (3 seconds delay) to verify iOS banner & sound
   */
  async sendTestNotification() {
    const permitted = await this.requestPermission();
    if (!permitted) {
      alert("Please allow notification permissions in your iPhone Settings to receive plant reminders.");
      return false;
    }

    const targetDate = new Date(Date.now() + 3000);
    const notif = {
      id: 999999,
      title: "🌿 Flora AI Reminders Active!",
      body: `Your plant care schedule is synchronized. We'll remind you at ${this.reminderTime} on watering days.`,
      schedule: { at: targetDate },
      sound: "default"
    };

    if (this.plugin && typeof this.plugin.schedule === "function") {
      try {
        await this.cancelNotification(999999);
        await this.plugin.schedule({ notifications: [notif] });
        return true;
      } catch (err) {
        console.warn("[Flora Notifications] Test notif error:", err);
      }
    }

    // Web Notification fallback
    if ("Notification" in window && Notification.permission === "granted") {
      setTimeout(() => {
        new Notification(notif.title, {
          body: notif.body,
          icon: "assets/app_icon.png"
        });
      }, 3000);
      return true;
    }

    return true;
  }

  /**
   * Set reminder time (HH:MM)
   */
  setReminderTime(timeStr) {
    if (!timeStr) return;
    this.reminderTime = timeStr;
    localStorage.setItem("flora_reminder_time", timeStr);
  }

  /**
   * Toggle notifications enabled / disabled
   */
  async setEnabled(val, plants = []) {
    this.enabled = !!val;
    localStorage.setItem("flora_notifications_enabled", this.enabled ? "true" : "false");
    if (this.enabled) {
      await this.requestPermission();
      await this.rescheduleAllGarden(plants);
    } else {
      await this.rescheduleAllGarden([]);
    }
  }

  // ==========================================================================
  // NATIVE APP STORE REVIEW PROMPT (SKStoreReviewController)
  // Conforms to Apple HIG: rate prompt at peak satisfaction moments
  // ==========================================================================

  /**
   * Request native App Store review prompt
   * @param {boolean} force - if true (e.g. from Settings), bypasses cooldown
   */
  async requestStoreReview(force = false) {
    if (!force) {
      const lastPrompt = parseInt(localStorage.getItem("flora_last_review_prompt") || "0", 10);
      const now = Date.now();
      // Enforce 30-day quiet period between automatic prompts
      if (now - lastPrompt < 30 * 24 * 60 * 60 * 1000) {
        return false;
      }
    }

    localStorage.setItem("flora_last_review_prompt", String(Date.now()));

    // 1. Native Capacitor InAppReview plugin
    if (this.reviewPlugin && typeof this.reviewPlugin.requestReview === "function") {
      try {
        await this.reviewPlugin.requestReview();
        console.log("[Flora Review] InAppReview.requestReview() triggered");
        return true;
      } catch (err) {
        console.warn("[Flora Review] InAppReview failed:", err);
      }
    }

    const directPlugin = window.Capacitor?.Plugins?.InAppReview;
    if (directPlugin && typeof directPlugin.requestReview === "function") {
      try {
        await directPlugin.requestReview();
        return true;
      } catch (e) {}
    }

    // 2. Direct fallback URL to App Store Write Review page
    if (force) {
      window.open("https://apps.apple.com/app/id6753896584?action=write-review", "_blank");
    }

    return true;
  }
}

export const notificationsManager = new NotificationsManager();
