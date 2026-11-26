// Creates a small Capacitor project for one Android app (staff | order | agent).
// The app opens the live Sunny Foods address, so screen updates arrive without reinstalling (Spec 9).
// Usage: node mobile/apk/make.mjs <app> <outDir>
import fs from "node:fs";
import path from "node:path";

const APPS = {
  staff: { appId: "ph.com.sunnyfoods.staff", appName: "Sunny Foods Staff", url: "https://app.sunnyfoods.com.ph/staff" },
  order: { appId: "ph.com.sunnyfoods.order", appName: "Sunny Foods Order", url: "https://order.sunnyfoods.com.ph/portal" },
  agent: { appId: "ph.com.sunnyfoods.agent", appName: "Sunny Foods Agent", url: "https://agent.sunnyfoods.com.ph/agent" },
};
const [, , appKey, outDir] = process.argv;
const app = APPS[appKey];
if (!app || !outDir) {
  console.error("Usage: node mobile/apk/make.mjs <staff|order|agent> <outDir>");
  process.exit(1);
}
const version = process.env.APP_VERSION ?? "0.1.0";
const host = new URL(app.url).hostname;

fs.mkdirSync(path.join(outDir, "www"), { recursive: true });
fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({
  name: `sunny-foods-${appKey}`, version, private: true,
}, null, 2));
fs.writeFileSync(path.join(outDir, "capacitor.config.json"), JSON.stringify({
  appId: app.appId,
  appName: app.appName,
  webDir: "www",
  backgroundColor: "#FAF6F1",
  server: {
    url: app.url,
    androidScheme: "https",
    errorPath: "offline.html",
    allowNavigation: [host, "zfcpechtevtjsnlcdqxk.supabase.co"],
  },
  android: { allowMixedContent: false },
}, null, 2));
// Shown when the phone has no internet or the address cannot be reached.
const offline = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "offline.html"), "utf8")
  .replaceAll("{{URL}}", app.url).replaceAll("{{NAME}}", app.appName);
fs.writeFileSync(path.join(outDir, "www", "offline.html"), offline);
fs.writeFileSync(path.join(outDir, "www", "index.html"), offline);
console.log(`Prepared ${app.appName} (${app.appId}) -> ${app.url}`);
