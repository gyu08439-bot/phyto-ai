
// RevenueCat & Apple StoreKit Subscription Manager

const REVENUECAT_APPLE_KEY = "appl_FloraAiProductionKey";
const ENTITLEMENT_ID = "pro_access";

export class PurchasesManager {
  constructor() {
    this.isNative = false;
    this.isPro = false;
    this.packages = [
      { id: "flora_annual_3999", title: "Annual Care Pass", price: "$39.99", unit: "year", trialDays: 3 },
      { id: "flora_weekly_499", title: "Flexible Weekly", price: "$4.99", unit: "week", trialDays: 0 }
    ];
    this.init();
  }

  async init() {
    try {
      if (window.Capacitor && window.Capacitor.isPluginAvailable("Purchases")) {
        this.isNative = true;
        const { Purchases } = await import("@revenuecat/purchases-capacitor");
        this.Purchases = Purchases;
        await this.Purchases.configure({ apiKey: REVENUECAT_APPLE_KEY });
        await this.checkEntitlements();
      } else {
        // Web Simulator Mode
        const savedPro = localStorage.getItem("flora_pro_subscriber") === "true";
        this.isPro = savedPro;
      }
    } catch (err) {
      console.warn("RevenueCat initialization note:", err);
      this.isPro = localStorage.getItem("flora_pro_subscriber") === "true";
    }
  }

  async checkEntitlements() {
    if (this.isNative && this.Purchases) {
      try {
        const { customerInfo } = await this.Purchases.getCustomerInfo();
        const activeEntitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
        this.isPro = !!activeEntitlement;
        localStorage.setItem("flora_pro_subscriber", this.isPro ? "true" : "false");
        return this.isPro;
      } catch (e) {
        console.warn("Failed to fetch customer info:", e);
      }
    }
    return this.isPro;
  }

  async purchasePlan(planType = "yearly") {
    const pkgId = planType === "yearly" ? "flora_annual_3999" : "flora_weekly_499";

    if (this.isNative && this.Purchases) {
      try {
        const { customerInfo } = await this.Purchases.purchasePackage({
          aPackage: { identifier: pkgId }
        });
        const active = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
        this.isPro = active;
        localStorage.setItem("flora_pro_subscriber", active ? "true" : "false");
        return { success: active, isNative: true };
      } catch (err) {
        if (err.userCancelled) {
          return { success: false, cancelled: true };
        }
        throw err;
      }
    } else {
      // Simulate successful Apple StoreKit purchase on Web
      await new Promise(r => setTimeout(r, 600));
      this.isPro = true;
      localStorage.setItem("flora_pro_subscriber", "true");
      return { success: true, isNative: false, simulated: true };
    }
  }

  async restorePurchases() {
    if (this.isNative && this.Purchases) {
      try {
        const { customerInfo } = await this.Purchases.restorePurchases();
        const active = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
        this.isPro = active;
        localStorage.setItem("flora_pro_subscriber", active ? "true" : "false");
        return { success: active, restored: true };
      } catch (e) {
        console.warn("Restore error:", e);
        return { success: false, error: e.message };
      }
    } else {
      const isSimulated = localStorage.getItem("flora_pro_subscriber") === "true";
      return { success: isSimulated, restored: isSimulated };
    }
  }
}

export const purchasesManager = new PurchasesManager();
