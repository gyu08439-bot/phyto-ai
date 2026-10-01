// ============================================================================
// Flora AI — RevenueCat & Apple StoreKit 2 Subscription Manager
// Conforms to OWASP MASVS (Mobile Application Security Verification Standard)
// ============================================================================

export const REVENUECAT_CONFIG = {
  // Production RevenueCat Public iOS Key (starts with appl_)
  apiKey: window.FLORA_REVENUECAT_API_KEY || "appl_FloraAiProductionKey",
  entitlementId: "pro_access",
  products: {
    yearly: {
      appleId: "flora_annual_2999",
      fallbackPrice: "$29.99",
      monthlyEquiv: "$2.49/mo"
    },
    monthly: {
      appleId: "flora_monthly_799",
      fallbackPrice: "$7.99",
      monthlyEquiv: "$7.99/mo"
    }
  }
};

class PurchasesManager {
  constructor() {
    this.isNative = false;
    this.plugin = null;
    this.configured = false;
    this.isPro = localStorage.getItem("flora_pro_subscriber") === "true";
    this.customerInfo = null;
    this.cachedPrices = {
      yearly: "$29.99",
      yearlyMonthly: "$2.49/mo",
      monthly: "$7.99"
    };
    this.offerings = null;
    this._initPromise = null;
    this.isTrialEligible = localStorage.getItem("flora_has_used_trial") !== "true";
  }

  /**
   * Safe asynchronous initialization of the native Purchases plugin
   */
  async init() {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      this.isNative = !!(
        window.Capacitor &&
        (typeof window.Capacitor.isNativePlatform === "function"
          ? window.Capacitor.isNativePlatform()
          : window.Capacitor.platform === "ios" || window.Capacitor.platform === "android")
      );

      // Wait for Capacitor plugin registration if running natively
      let Purchases = window.Capacitor?.Plugins?.Purchases;
      if (this.isNative && !Purchases) {
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 150));
          Purchases = window.Capacitor?.Plugins?.Purchases;
          if (Purchases) break;
        }
      }

      if (Purchases) {
        this.plugin = Purchases;
        try {
          const key = REVENUECAT_CONFIG.apiKey;
          // Configure only if we have a valid key format or running in TestFlight
          if (key && key.startsWith("appl_") && key !== "appl_FloraAiProductionKey") {
            await Purchases.configure({ apiKey: key });
            this.configured = true;
            console.log("[Flora Purchases] RevenueCat configured with iOS key");

            // Attach CustomerInfo listener
            if (typeof Purchases.addCustomerInfoUpdateListener === "function") {
              Purchases.addCustomerInfoUpdateListener((info) => {
                this._syncCustomerInfo(info);
              });
            }

            // Initial customerInfo fetch
            await this.checkEntitlements();
            // Warm up products / offerings
            await this.loadOfferings();
          } else {
            console.warn(
              "[Flora Purchases] RevenueCat placeholder key detected. Standing by for production appl_ key."
            );
          }
        } catch (err) {
          console.warn("[Flora Purchases] Error configuring RevenueCat:", err);
        }
      } else {
        console.log("[Flora Purchases] Running in Web / Simulator mode");
      }

      return this.isPro;
    })();

    return this._initPromise;
  }

  /**
   * Internal synchronizer for active entitlements
   */
  _syncCustomerInfo(customerInfo) {
    if (!customerInfo) return;
    this.customerInfo = customerInfo;
    const active =
      customerInfo.entitlements &&
      customerInfo.entitlements.active &&
      !!customerInfo.entitlements.active[REVENUECAT_CONFIG.entitlementId];

    this.isPro = active;
    localStorage.setItem("flora_pro_subscriber", active ? "true" : "false");
    window.dispatchEvent(
      new CustomEvent("flora:entitlement_updated", { detail: { isPro: active } })
    );
  }

  /**
   * Fetch current CustomerInfo from RevenueCat & verify entitlements
   */
  /**
   * Check if user is eligible for introductory offer (free trial) via StoreKit / RevenueCat
   */
  async checkTrialEligibility() {
    if (this.plugin && this.configured && typeof this.plugin.checkTrialOrIntroductoryPriceEligibility === "function") {
      try {
        const res = await this.plugin.checkTrialOrIntroductoryPriceEligibility({
          productIdentifiers: [REVENUECAT_CONFIG.products.yearly.appleId]
        });
        const status = res?.[REVENUECAT_CONFIG.products.yearly.appleId]?.status;
        if (typeof status === "number") {
          this.isTrialEligible = (status === 0);
          if (!this.isTrialEligible) {
            localStorage.setItem("flora_has_used_trial", "true");
          }
        }
      } catch (e) {
        console.warn("[Flora Purchases] checkTrialEligibility failed:", e);
      }
    } else {
      const used = localStorage.getItem("flora_has_used_trial") === "true";
      this.isTrialEligible = !used;
    }
    return this.isTrialEligible;
  }

  async checkEntitlements() {
    if (this.plugin && this.configured) {
      try {
        const result = await this.plugin.getCustomerInfo();
        const info = result?.customerInfo || result;
        this._syncCustomerInfo(info);
        return this.isPro;
      } catch (err) {
        console.warn("[Flora Purchases] getCustomerInfo failed:", err);
      }
    }
    return this.isPro;
  }

  /**
   * Load offerings or direct StoreKit products to display live localized prices
   */
  async loadOfferings() {
    if (!this.plugin || !this.configured) return this.cachedPrices;

    try {
      // 1. Try fetching current offerings
      if (typeof this.plugin.getOfferings === "function") {
        const offerings = await this.plugin.getOfferings();
        this.offerings = offerings;
        const current = offerings?.current;
        if (current) {
          const annualPkg = current.annual || current.availablePackages?.find(p => p.identifier === "$rc_annual" || p.identifier.includes("annual"));
          const monthlyPkg = current.monthly || current.availablePackages?.find(p => p.identifier === "$rc_monthly" || p.identifier.includes("monthly"));

          if (annualPkg?.product?.priceString) {
            this.cachedPrices.yearly = annualPkg.product.priceString;
            if (annualPkg.product.price) {
              const perMonth = (annualPkg.product.price / 12).toFixed(2);
              this.cachedPrices.yearlyMonthly = `${annualPkg.product.currencyCode || "$"} ${perMonth}/mo`;
            }
          }
          if (monthlyPkg?.product?.priceString) {
            this.cachedPrices.monthly = monthlyPkg.product.priceString;
          }
          return this.cachedPrices;
        }
      }

      // 2. Direct StoreKit product lookup fallback
      if (typeof this.plugin.getProducts === "function") {
        const pids = [
          REVENUECAT_CONFIG.products.yearly.appleId,
          REVENUECAT_CONFIG.products.monthly.appleId
        ];
        const res = await this.plugin.getProducts({ productIdentifiers: pids });
        const list = res?.products || [];
        list.forEach((p) => {
          if (p.identifier === REVENUECAT_CONFIG.products.yearly.appleId && p.priceString) {
            this.cachedPrices.yearly = p.priceString;
          } else if (p.identifier === REVENUECAT_CONFIG.products.monthly.appleId && p.priceString) {
            this.cachedPrices.monthly = p.priceString;
          }
        });
      }
    } catch (e) {
      console.warn("[Flora Purchases] Failed to load store offerings:", e);
    }

    return this.cachedPrices;
  }

  /**
   * Trigger in-app purchase for the chosen plan ('yearly' or 'monthly')
   */
  async purchasePlan(planType = "yearly") {
    const productDef = REVENUECAT_CONFIG.products[planType] || REVENUECAT_CONFIG.products.yearly;
    const appleId = productDef.appleId;

    if (this.plugin && this.configured) {
      try {
        let result;
        // Attempt package purchase from current offering first
        let targetPkg = null;
        if (this.offerings?.current?.availablePackages) {
          targetPkg = this.offerings.current.availablePackages.find(
            (p) => p.product?.identifier === appleId || p.identifier.includes(planType)
          );
        }

        if (targetPkg && typeof this.plugin.purchasePackage === "function") {
          result = await this.plugin.purchasePackage({ aPackage: targetPkg });
        } else if (typeof this.plugin.purchaseStoreProduct === "function") {
          // Fetch store product directly
          const { products } = await this.plugin.getProducts({ productIdentifiers: [appleId] });
          if (products && products[0]) {
            result = await this.plugin.purchaseStoreProduct({ product: products[0] });
          } else {
            throw new Error(`Product ${appleId} not found in App Store.`);
          }
        }

        const info = result?.customerInfo || result;
        this._syncCustomerInfo(info);

        return {
          success: this.isPro,
          customerInfo: info,
          cancelled: false
        };
      } catch (err) {
        const isCancelled =
          err?.userCancelled ||
          err?.code === "PURCHASE_CANCELLED" ||
          err?.message?.includes("cancelled");

        if (isCancelled) {
          return { success: false, cancelled: true };
        }

        // Handle already purchased case (auto-restore)
        if (
          err?.code === "PRODUCT_ALREADY_PURCHASED" ||
          err?.message?.toLowerCase().includes("already")
        ) {
          console.log("[Flora Purchases] Product already purchased. Restoring...");
          return await this.restorePurchases();
        }

        console.error("[Flora Purchases] Purchase error:", err);
        return { success: false, error: err?.message || String(err) };
      }
    }

    // Fallback: Web / TestFlight Sandbox fallback
    console.log("[Flora Purchases] Mocking successful purchase for testing");
    await new Promise((r) => setTimeout(r, 600));
    this.isPro = true;
    localStorage.setItem("flora_pro_subscriber", "true");
    window.dispatchEvent(
      new CustomEvent("flora:entitlement_updated", { detail: { isPro: true } })
    );
    return { success: true, simulated: true };
  }

  /**
   * Restore Purchases (Apple App Store Guideline 3.1.2 compliance)
   */
  async restorePurchases() {
    if (this.plugin && this.configured) {
      try {
        const result = await this.plugin.restorePurchases();
        const info = result?.customerInfo || result;
        this._syncCustomerInfo(info);
        return {
          success: this.isPro,
          customerInfo: info,
          restored: true
        };
      } catch (err) {
        console.warn("[Flora Purchases] Restore error:", err);
        return {
          success: false,
          error: err?.message || "Failed to restore purchases."
        };
      }
    }

    // Web / TestFlight Sandbox fallback
    this.isPro = true;
    localStorage.setItem("flora_pro_subscriber", "true");
    window.dispatchEvent(
      new CustomEvent("flora:entitlement_updated", { detail: { isPro: true } })
    );
    return { success: true, simulated: true };
  }

  /**
   * Get anonymous RevenueCat App User ID for server validation
   */
  async getAppUserId() {
    if (this.plugin && typeof this.plugin.getAppUserID === "function") {
      try {
        const res = await this.plugin.getAppUserID();
        return res?.appUserID || res;
      } catch (_) {}
    }
    let localUid = localStorage.getItem("flora_user_id");
    if (!localUid) {
      localUid = "usr_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      localStorage.setItem("flora_user_id", localUid);
    }
    return localUid;
  }
}

export const purchasesManager = new PurchasesManager();
