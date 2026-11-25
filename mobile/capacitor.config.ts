import type { CapacitorConfig } from "@capacitor/cli";

// Store app = the customer portal screens BUNDLED inside the app (not the live website):
// Capacitor documents `server.url` as development-only, and Apple may reject plain website wrappers.
const config: CapacitorConfig = {
  appId: "ph.com.sunnyfoods.order",
  appName: "Sunny Foods Order",
  webDir: "out",
  backgroundColor: "#FAF6F1",
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: "#B81C21", showSpinner: false },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
  ios: { contentInset: "automatic" },
  android: { allowMixedContent: false },
};

export default config;
