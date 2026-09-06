/**
 * La capture (spec 4.1, couche 1) : flux caméra uniquement, jamais d'<input type="file">.
 * Deux images à 1,5 s d'intervalle, extraites du flux ; journal de capteurs à ~30 Hz.
 * Le tremblement du cadre est normal et souhaitable: aucune stabilisation.
 */

export interface SensorSample {
  t: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export const FRAME_GAP_MS = 1500;
export const SENSOR_HZ = 30;

export async function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
}

/** iOS exige un geste utilisateur explicite pour les capteurs. */
export async function requestMotionPermission(): Promise<boolean> {
  const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<"granted" | "denied"> } }).DeviceMotionEvent;
  if (DME && typeof DME.requestPermission === "function") {
    try {
      return (await DME.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

export class SensorLog {
  readonly samples: SensorSample[] = [];
  private start = 0;
  private last = -Infinity;
  private handler = (e: DeviceMotionEvent) => {
    const t = performance.now() - this.start;
    if (t - this.last < 1000 / SENSOR_HZ - 4) return;
    this.last = t;
    const a = e.accelerationIncludingGravity;
    const g = e.rotationRate;
    this.samples.push({ t: Math.round(t), ax: a?.x ?? 0, ay: a?.y ?? 0, az: a?.z ?? 0, gx: g?.alpha ?? 0, gy: g?.beta ?? 0, gz: g?.gamma ?? 0 });
  };
  begin() {
    this.start = performance.now();
    window.addEventListener("devicemotion", this.handler);
  }
  end() {
    window.removeEventListener("devicemotion", this.handler);
  }
}

/** Extrait une frame du flux, sans EXIF (un canvas n'en produit jamais). */
export async function grabFrame(video: HTMLVideoElement): Promise<Blob> {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponible");
  ctx.drawImage(video, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("capture impossible"))), "image/jpeg", 0.92));
}

/** Deux frames à 1,5 s d'intervalle + journal capteurs. `onProgress` reçoit 0→1 pendant l'attente. */
export async function captureDouble(video: HTMLVideoElement, onProgress?: (p: number) => void): Promise<{ frameA: Blob; frameB: Blob; sensors: SensorSample[]; clientTimestamp: number }> {
  const log = new SensorLog();
  log.begin();
  const t0 = performance.now();
  const clientTimestamp = Date.now();
  const frameA = await grabFrame(video);
  await new Promise<void>((resolve) => {
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / FRAME_GAP_MS);
      onProgress?.(p);
      if (p >= 1) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  const frameB = await grabFrame(video);
  log.end();
  return { frameA, frameB, sensors: log.samples, clientTimestamp };
}

/** Empreinte d'appareil stable et sans identifiant tiers : navigateur, écran, fuseau, langues. */
export function deviceFingerprint(): string {
  try {
    const stored = localStorage.getItem("spot:device");
    if (stored) return stored;
    const raw = [navigator.userAgent, screen.width, screen.height, screen.colorDepth, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language, navigator.hardwareConcurrency ?? 0].join("|");
    let h = 2166136261;
    for (const ch of raw) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const fp = `d${h.toString(16)}${Math.random().toString(16).slice(2, 8)}`;
    localStorage.setItem("spot:device", fp);
    return fp;
  } catch {
    return "inconnu";
  }
}

/** Déclic d'obturateur et choc de tampon, synthétisés : aucun fichier audio. Coupés par défaut. */
export function playSound(kind: "declic" | "tampon"): void {
  try {
    if (localStorage.getItem("spot:son") !== "1") return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === "declic" ? "square" : "triangle";
    osc.frequency.value = kind === "declic" ? 1800 : 140;
    gain.gain.setValueAtTime(kind === "declic" ? 0.08 : 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === "declic" ? 0.05 : 0.18));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {}
}

/** Explications par navigateur quand la caméra est refusée (spec 8.4). */
export function cameraHelp(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "Settings → Safari → Camera → Allow, then reload the page.";
  if (/Firefox/.test(ua)) return "Click the crossed-out camera icon in the address bar and choose “Allow”.";
  if (/Chrome|Chromium|Edg/.test(ua)) return "Click the padlock in the address bar → Permissions → Camera → Allow.";
  return "Allow camera access in the browser settings, then reload the page.";
}
