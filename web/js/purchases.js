
// RevenueCat & Apple StoreKit Subscription Manager

const REVENUECAT_APPLE_KEY = "appl_FloraAiProductionKey";
const ENTITLEMENT_ID = "pro_access";

export class PurchasesManager {
  constructor() {
    this.isNative = false;
    this.isPro = localStorage.getItem("flora_pro_subscriber") === "true";
    this.packages = [
      { id: "flora_annual_2999", title: "Annual Recovery Pass", price: "$29.99", unit: "year", monthlyEquiv: "$2.49/mo" },
      { id: "flora_monthly_799", title: "Monthly Flexible", price: "$7.99", unit: "month" }
    ];
    this.init();
  }

  async init() {
    this.isPro = localStorage.getItem("flora_pro_subscriber") === "true";
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
    const pkgId = planType === "yearly" ? "flora_annual_2999" : "flora_monthly_799";

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
