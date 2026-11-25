/**
 * Native features for the store app (Spec 9a — Apple guideline 4.2 needs real app features).
 * UNTESTED: written against the Capacitor 7 plugin APIs; test on real phones in Phase 18.
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Network } from "@capacitor/network";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const BIOMETRIC_SERVER = "order.sunnyfoods.com.ph";

/** 1. Push notifications: order status (Received → Delivered) and payment reminders. */
export async function registerPush(accessToken: string) {
  if (!Capacitor.isNativePlatform()) return;
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
  PushNotifications.addListener("registration", async ({ value }) => {
    await fetch(`${API_BASE}/api/portal/push-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token: value, platform: Capacitor.getPlatform() }),
    });
  });
  PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const link = (notification.data as { link?: string })?.link;
    if (link) window.location.href = link.startsWith("/portal") ? link : `/portal${link}`;
  });
}

/** 2. Camera: payment proof photo. Returns a File to append to the upload form ("file"). */
export async function takeProofPhoto(): Promise<File | null> {
  const photo = await Camera.getPhoto({ quality: 70, resultType: CameraResultType.Uri, source: CameraSource.Prompt, width: 1600 });
  if (!photo.webPath) return null;
  const blob = await (await fetch(photo.webPath)).blob();
  return new File([blob], `proof.${photo.format || "jpg"}`, { type: blob.type || "image/jpeg" });
}

/** 3. Face ID / fingerprint quick login: keeps the Supabase refresh token in the phone's secure storage. */
export async function saveBiometricLogin(email: string, refreshToken: string) {
  const ok = await NativeBiometric.isAvailable().then((r) => r.isAvailable).catch(() => false);
  if (!ok) return false;
  await NativeBiometric.setCredentials({ username: email, password: refreshToken, server: BIOMETRIC_SERVER });
  return true;
}

export async function biometricLogin(): Promise<{ email: string; refreshToken: string } | null> {
  try {
    await NativeBiometric.verifyIdentity({ reason: "Log in to Sunny Foods", title: "Sunny Foods" });
    const c = await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER });
    return { email: c.username, refreshToken: c.password };   // then: supabase.auth.refreshSession({ refresh_token })
  } catch {
    return null;
  }
}

export async function clearBiometricLogin() {
  await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER }).catch(() => {});
}

/** 4. Offline: the portal screens keep the last catalog and My Orders (portal-client cachedGet);
 *  this shows a friendly offline screen when the phone has no connection. */
export async function watchNetwork(onChange: (online: boolean) => void) {
  const s = await Network.getStatus();
  onChange(s.connected);
  return Network.addListener("networkStatusChange", (st) => onChange(st.connected));
}
