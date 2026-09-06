"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { BrandDto } from "@/lib/api";
import { API_URL, DEMO, SECTEURS } from "@/lib/api";
import { VAULT_ADDRESS, vaultAbi } from "@/lib/contracts";
import { coeff, duree, tokens } from "@/lib/format";
import { motifEn } from "@/lib/motifs";
import { Fiche } from "../Fiche";
import { Manuscrit } from "../Manuscrit";
import { CoinsPhoto } from "../CoinsPhoto";
import { BrandLogo } from "../BrandLogo";
import { Wallet } from "../Wallet";
import { PinnedNote } from "../PinnedNote";
import { Reveal } from "../Reveal";
import { useNotes } from "../Notes";
import { openCamera, requestMotionPermission, captureDouble, grabFrame, deviceFingerprint, playSound, cameraHelp } from "./capture";
import { enqueue, pending, remove } from "./queue";

type Voucher = { wallet: `0x${string}`; brandId: number; amount: string; token: `0x${string}`; nonce: string; issuedAt: string; deadline: string; imageHash: `0x${string}`; cityCode: number };
type Outcome =
  | { kind: "valide"; priseId: string; voucher: Voucher; signature: `0x${string}`; usdValue: number; paid: boolean; regionRestricted?: boolean; fragmentsPaused?: boolean; inHunt: boolean; rarity: number; imageKey: string; imageHash: string }
  | { kind: "contre-angle"; priseId: string; deadlineMs: number }
  | { kind: "rejet"; motif: string; flags: string[] };

type Phase = "intro" | "viseur" | "capture" | "analyse" | "signature" | "valide" | "contre-angle" | "rejet" | "camera-refusee" | "file";

const STATUS = ["reading the frame", "checking the scene", "identifying"];
const EASE = [0.16, 1, 0.3, 1] as const;

/** Synthetic stream for the demo: a sheet that trembles slightly, like a hand. */
function demoStream(): MediaStream {
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 960;
  const ctx = c.getContext("2d")!;
  let t = 0;
  const draw = () => {
    t += 1;
    ctx.fillStyle = "#8a8f7a";
    ctx.fillRect(0, 0, c.width, c.height);
    const dx = Math.sin(t / 9) * 6;
    const dy = Math.cos(t / 7) * 4;
    ctx.fillStyle = "#3b4a5c";
    ctx.fillRect(160 + dx, 300 + dy, 400, 420);
    ctx.fillStyle = "#c9b78a";
    ctx.fillRect(0, 760 + dy / 2, c.width, 200);
    requestAnimationFrame(draw);
  };
  draw();
  return c.captureStream(30);
}

/**
 * The shot screen. The viewfinder, the two-frame capture with the sweeping line, the analysis with
 * the loupe, then the three outcomes: validated (the card mounts, the stamp lands), second angle
 * ("a step to the side", 60 s), rejected (empty card, red stamp, the reason in plain words).
 * The transaction is signed after the server validates but before the mounting animation.
 */
/** Set by the edge (middleware): where Robinhood does not offer Stock Tokens, a photo earns the card and the pin, not a fragment. */
function cardOnlyRegion(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|; )spot-region=card-only/.test(document.cookie);
}

/** `fragmentsPaused`: the server is handing out cards and plates but no fragments yet (the "cards first" launch). */
export function Prise({ brand, inHunt, budgetExhausted, fragmentsPaused = false, resetInSeconds }: { brand: BrandDto; inHunt: boolean; budgetExhausted: boolean; fragmentsPaused?: boolean; resetInSeconds: number }) {
  const account = useAccount();
  const address = account.address ?? (DEMO ? ("0x000000000000000000000000000000000000dEaD" as `0x${string}`) : undefined);
  const isConnected = account.isConnected || DEMO;
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { note } = useNotes();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [still, setStill] = useState<string | null>(null);
  const [statusIdx, setStatusIdx] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [cardOnly, setCardOnly] = useState(false);
  useEffect(() => setCardOnly(cardOnlyRegion()), []);
  const [skip, setSkip] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [txError, setTxError] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [sound, setSound] = useState(false);
  const counterAngle = useRef<{ priseId: string; deadlineMs: number } | null>(null);

  useEffect(() => {
    try {
      setSound(localStorage.getItem("spot:son") === "1");
    } catch {}
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  // The stream is bound to the video element whenever the viewfinder is mounted.
  useEffect(() => {
    if (phase !== "viseur" && phase !== "contre-angle") return;
    const v = videoRef.current;
    const s = streamRef.current;
    if (v && s && v.srcObject !== s) {
      v.srcObject = s;
      v.play().catch(() => undefined);
    }
  }, [phase]);

  const startCamera = useCallback(async () => {
    try {
      await requestMotionPermission();
      const stream = await openCamera().catch((e) => {
        if (!DEMO) throw e;
        return demoStream();
      });
      streamRef.current = stream;
      setPhase("viseur");
    } catch {
      setPhase("camera-refusee");
    }
  }, []);

  async function send(form: FormData, path: string): Promise<Outcome> {
    if (DEMO) {
      await new Promise((r) => setTimeout(r, 3200));
      const roll = Math.random();
      if (roll < 0.1) return { kind: "contre-angle", priseId: "demo", deadlineMs: Date.now() + 60_000 };
      if (roll < 0.25) return { kind: "rejet", motif: ["la scène semble plane", "objet non reconnu", "déjà consignée"][Math.floor(Math.random() * 3)]!, flags: [] };
      return {
        kind: "valide",
        priseId: "demo",
        voucher: { wallet: (address ?? "0x000000000000000000000000000000000000dEaD") as `0x${string}`, brandId: brand.id, amount: "2100000000000000", token: "0x0000000000000000000000000000000000000001", nonce: "1", issuedAt: "0", deadline: String(Math.floor(Date.now() / 1000) + 1800), imageHash: "0x00", cityCode: 0 },
        signature: "0x00",
        usdValue: budgetExhausted || cardOnlyRegion() || fragmentsPaused ? 0 : 0.48,
        paid: !budgetExhausted && !cardOnlyRegion() && !fragmentsPaused,
        regionRestricted: cardOnlyRegion(),
        fragmentsPaused,
        inHunt,
        rarity: brand.rarity,
        imageKey: "",
        imageHash: "0x00",
      };
    }
    const res = await fetch(`${API_URL}${path}`, { method: "POST", body: form });
    if (!res.ok && res.status !== 400) throw new Error(`server ${res.status}`);
    return (await res.json()) as Outcome;
  }

  async function flushQueue() {
    for (const q of await pending()) {
      const form = new FormData();
      for (const [k, v] of Object.entries(q.fields)) form.set(k, v);
      form.set("frameA", q.frameA, "a.jpg");
      form.set("frameB", q.frameB, "b.jpg");
      try {
        await send(form, "/prise");
        await remove(q.id);
        note("a queued sighting was sent", "green");
      } catch {
        return;
      }
    }
  }
  useEffect(() => {
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function consigner() {
    const video = videoRef.current;
    if (!video || !address) return;
    setPhase("capture");
    playSound("declic");
    setLive("hold the frame");
    const cap = await captureDouble(video);
    setStill(URL.createObjectURL(cap.frameA));
    setPhase("analyse");
    setLive("analysing");
    const form = new FormData();
    form.set("wallet", address);
    form.set("brandId", String(brand.id));
    form.set("sensors", JSON.stringify(cap.sensors));
    form.set("clientTimestamp", String(cap.clientTimestamp));
    form.set("deviceFingerprint", deviceFingerprint());
    form.set("frameA", cap.frameA, "a.jpg");
    form.set("frameB", cap.frameB, "b.jpg");
    try {
      const o = await send(form, "/prise");
      await handleOutcome(o);
    } catch {
      if (!navigator.onLine) {
        const fields: Record<string, string> = {};
        for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
        await enqueue({ id: `${Date.now()}`, createdAt: Date.now(), fields, frameA: cap.frameA, frameB: cap.frameB });
        setPhase("file");
      } else {
        setOutcome({ kind: "rejet", motif: "le serveur n'a pas répondu", flags: [] });
        setPhase("rejet");
      }
    }
  }

  async function handleOutcome(o: Outcome) {
    setOutcome(o);
    if (o.kind === "contre-angle") {
      counterAngle.current = { priseId: o.priseId, deadlineMs: o.deadlineMs };
      setCountdown(60);
      setLive("second angle requested, 60 seconds");
      setPhase("contre-angle");
      return;
    }
    if (o.kind === "rejet") {
      setLive(`refused: ${motifEn(o.motif)}`);
      stopCamera();
      setPhase("rejet");
      return;
    }
    stopCamera();
    await signAndMount(o);
  }

  async function signAndMount(o: Extract<Outcome, { kind: "valide" }>) {
    setPhase("signature");
    setTxError(null);
    if (!DEMO) {
      try {
        const v = o.voucher;
        const hash = await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: vaultAbi,
          functionName: "claim",
          args: [{ wallet: v.wallet, brandId: v.brandId, amount: BigInt(v.amount), token: v.token, nonce: BigInt(v.nonce), issuedAt: BigInt(v.issuedAt), deadline: BigInt(v.deadline), imageHash: v.imageHash, cityCode: v.cityCode }, o.signature],
        });
        // a submitted transaction is not a mined one: wait for the receipt and refuse a reverted claim
        if (!publicClient) throw new Error("no chain client");
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("the chain refused the claim");
      } catch (e) {
        const expired = Number(o.voucher.deadline) * 1000 < Date.now();
        setTxError(expired ? "expired" : (e as Error).message.split("\n")[0] ?? "transaction refused");
        return;
      }
    }
    playSound("tampon");
    setLive(o.paid ? `validated, ${brand.name}, ${tokens(o.voucher.amount, brand.symbol ?? "fragment")}` : `validated, ${brand.name}, card without fragment`);
    setPhase("valide");
  }

  async function redemander() {
    if (!outcome || outcome.kind !== "valide" || !address) return;
    const res = await fetch(`${API_URL}/prise/${outcome.priseId}/voucher`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: address }) });
    if (!res.ok) return note("reissue refused", "red");
    const r = (await res.json()) as { voucher: Voucher; signature: `0x${string}` };
    await signAndMount({ ...outcome, voucher: r.voucher, signature: r.signature });
  }

  // second-angle countdown
  useEffect(() => {
    if (phase !== "contre-angle") return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil(((counterAngle.current?.deadlineMs ?? 0) - Date.now()) / 1000));
      setCountdown(left);
      if (left === 0) {
        clearInterval(t);
        setOutcome({ kind: "rejet", motif: "contre-angle hors délai", flags: [] });
        stopCamera();
        setPhase("rejet");
      }
    }, 250);
    return () => clearInterval(t);
  }, [phase, stopCamera]);

  async function contreAngle() {
    const video = videoRef.current;
    if (!video || !address || !counterAngle.current) return;
    playSound("declic");
    const blob = await grabFrame(video);
    setStill(URL.createObjectURL(blob));
    setPhase("analyse");
    const form = new FormData();
    form.set("wallet", address);
    form.set("priseId", counterAngle.current.priseId);
    form.set("deviceFingerprint", deviceFingerprint());
    form.set("image", blob, "c.jpg");
    try {
      await handleOutcome(await send(form, "/prise/contre-angle"));
    } catch {
      setOutcome({ kind: "rejet", motif: "le serveur n'a pas répondu", flags: [] });
      setPhase("rejet");
    }
  }

  // analysis status line
  useEffect(() => {
    if (phase !== "analyse") return;
    setStatusIdx(0);
    const t = setInterval(() => setStatusIdx((i) => Math.min(STATUS.length - 1, i + 1)), 1400);
    return () => clearInterval(t);
  }, [phase]);

  // ───────────────────────── render ─────────────────────────

  const margin = (
    <div className="prise-top">
      <div className="prise-brand">
        <BrandLogo brand={brand.name} size={36} />
        <div className="prise-brand-text">
          <span className="prise-brand-name">{brand.name}</span>
          <span className="prise-brand-sub">{phase === "contre-angle" ? "a step to the side" : inHunt ? "today's hunt" : "outside the hunt · 30 %"}</span>
        </div>
      </div>
      <span className="prise-coeff mono" title={inHunt ? "rarity coefficient" : "rarity coefficient, paid at 30 % outside the hunt"}>{coeff(brand.rarity)}</span>
    </div>
  );

  if (phase === "intro") {
    const sector = SECTEURS[brand.sector] ?? "";
    const cardOnlyIntro = cardOnly || budgetExhausted || fragmentsPaused;
    return (
      <div className="page prise-intro" style={{ maxWidth: 560 }}>
        <Reveal className="prise-intro-grid">
          <header className="prise-intro-head">
            <div style={{ display: "flex", alignItems: "center", gap: ".8rem" }}>
              <BrandLogo brand={brand.name} size={52} />
              <Manuscrit text={brand.name} size={2.3} />
            </div>
            <div className="prise-intro-chips mono" aria-label="brand facts">
              {sector && <span className="prise-chip">{sector}</span>}
              <span className="prise-chip prise-chip-accent">{coeff(brand.rarity)}</span>
              <span className={`prise-chip ${inHunt ? "prise-chip-live" : ""}`}>{inHunt ? "today’s hunt" : "outside the hunt · 30 %"}</span>
            </div>
          </header>

          <section className="prise-intro-card" aria-label="the card you will earn">
            <Fiche id={0} brand={brand.name} image={null} date={new Date()} city="your street" rarity={brand.rarity} empty stamp={cardOnlyIntro ? { text: "card only", tone: "green" } : { text: inHunt ? "daily hunt" : "logged", tone: "green" }} />
            <p className="legend prise-intro-earn">
              {cardOnlyIntro ? "This photo earns the card and your pin on the map." : `This photo earns the card and a fragment of ${brand.symbol ?? brand.name}${inHunt ? "" : ", paid at 30 % outside the hunt"}.`}
            </p>
          </section>

          <ol className="prise-intro-steps" aria-label="how it works">
            <li><span className="mono prise-step-n">1</span><span>Camera feed only, nothing imported</span></li>
            <li><span className="mono prise-step-n">2</span><span>Hold the frame a second and a half</span></li>
            <li><span className="mono prise-step-n">3</span><span>Sign the claim in your wallet</span></li>
          </ol>

          {fragmentsPaused && <PinnedNote tone="green">fragments open soon: for now every photo earns the card and your pin on the map, and counts toward your plates.</PinnedNote>}
          {budgetExhausted && !fragmentsPaused && <PinnedNote tone="green">today&apos;s budget is spent, you earn the card, not the fragment. Rearms in {duree(resetInSeconds)}.</PinnedNote>}
          {cardOnly && <PinnedNote tone="green">where you are, Stock Token fragments are not offered: your photos earn the card and the pin on the map, not a fragment.</PinnedNote>}

          <footer className="prise-intro-foot">
            {!isConnected ? (
              <div style={{ display: "grid", gap: ".6rem" }}>
                <p className="legend" style={{ fontSize: ".9rem" }}>Sign the notebook first: the fragment goes to that wallet.</p>
                <Wallet />
              </div>
            ) : (
              <button className="btn prise-intro-cta" onClick={startCamera}>
                open the lens
              </button>
            )}
            <Link href="/" className="btn-quiet" style={{ justifySelf: "center" }}>
              back to the notebook
            </Link>
          </footer>
        </Reveal>
      </div>
    );
  }

  if (phase === "camera-refusee") {
    return (
      <div className="page" style={{ maxWidth: 520, display: "grid", gap: "1rem" }}>
        <h1>The lens is closed</h1>
        <p>The browser did not give access to the camera. {cameraHelp()}</p>
        <button className="btn btn-secondary" onClick={startCamera} style={{ justifySelf: "start" }}>
          try again
        </button>
      </div>
    );
  }

  if (phase === "file") {
    return (
      <div className="page" style={{ maxWidth: 520, display: "grid", gap: "1rem" }}>
        <PinnedNote>no network: the sighting is queued and will leave as soon as you are back online.</PinnedNote>
        <Link href="/" className="btn" style={{ justifySelf: "start" }}>
          back to the notebook
        </Link>
      </div>
    );
  }

  if (phase === "signature") {
    return (
      <div className="page" style={{ maxWidth: 520, display: "grid", gap: "1rem" }}>
        <p className="hand" style={{ fontSize: "1.9rem" }}>
          validated.
        </p>
        <p className="lede">One thing left: sign the claim in your wallet. The fragment is held for you for thirty minutes.</p>
        {txError && (
          <div style={{ display: "grid", gap: ".6rem", justifyItems: "start" }}>
            <p className="legend">{txError === "expired" ? "The voucher expired. It happens on the underground. We ask for it again, without retaking the photo." : `The wallet answered: ${txError}`}</p>
            {txError === "expired" ? (
              <button className="btn" onClick={redemander}>
                ask again
              </button>
            ) : (
              <button className="btn" onClick={() => outcome?.kind === "valide" && signAndMount(outcome)}>
                sign again
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (phase === "valide" && outcome?.kind === "valide") {
    return (
      <div className="prise-result">
        <p className="prise-result-title">
          <span className="prise-result-dot" aria-hidden="true" />
          {outcome.paid ? "in the notebook, fragment on its way" : "in the notebook"}
        </p>
        <Fiche
          id={DEMO ? 4832 : 0}
          brand={brand.name}
          image={still}
          date={new Date()}
          city={DEMO ? "New York, US" : "here"}
          rarity={brand.rarity}
          fragment={outcome.paid ? { amount: outcome.voucher.amount, symbol: brand.symbol ?? brand.name } : null}
          stamp={outcome.paid ? { text: inHunt ? "daily hunt" : "logged", tone: "green", drop: !skip } : outcome.regionRestricted || outcome.fragmentsPaused ? { text: "card only", tone: "green", drop: !skip } : { text: "over budget", tone: "red", drop: !skip }}
          animate={!skip}
          size="lg"
        />
        {!outcome.paid && outcome.regionRestricted && <p className="legend" style={{ textAlign: "center", maxWidth: "40ch" }}>The card is yours and it is on the map. Stock Token fragments are not offered where you are, so none follows this one.</p>}
        {!outcome.paid && !outcome.regionRestricted && outcome.fragmentsPaused && <p className="legend" style={{ textAlign: "center", maxWidth: "40ch" }}>The card is yours, it is on the map and it counts toward your plates. Fragments open soon.</p>}
        {!outcome.paid && !outcome.regionRestricted && !outcome.fragmentsPaused && <p className="legend" style={{ textAlign: "center", maxWidth: "40ch" }}>The card is yours. Today&apos;s budget was spent: no fragment this time, rearms in {duree(resetInSeconds)}.</p>}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: skip ? 0 : 2 }} style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/carnet" className="btn">
            see the notebook
          </Link>
          <Link href="/" className="btn-quiet">
            today&apos;s hunt
          </Link>
        </motion.div>
        {!skip && (
          <button className="btn-quiet prise-skip" onClick={() => setSkip(true)}>
            skip
          </button>
        )}
        <p className="sr-only" aria-live="polite">
          {live}
        </p>
      </div>
    );
  }

  if (phase === "rejet" && outcome?.kind === "rejet") {
    const reason = motifEn(outcome.motif);
    return (
      <div className="prise-result">
        <Fiche id={0} brand={brand.name} image={null} empty date={new Date()} city="here" rarity={brand.rarity} stamp={{ text: "refused", tone: "red", drop: true }} animate size="lg" />
        <p className="mono" style={{ textAlign: "center" }}>
          {reason}
        </p>
        <p className="legend" style={{ textAlign: "center", maxWidth: "40ch", fontSize: ".9rem" }}>
          {outcome.motif.includes("contre-angle")
            ? "The second shot did not show enough of another angle. It cost nothing: no quota, no card lost."
            : outcome.motif === "quota atteint"
              ? "Four sightings a day, twenty minutes between two, one per brand. Back later."
              : "A rejection does not use up your sighting. Get closer, frame the real object, and try again."}
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            className="btn"
            onClick={() => {
              setOutcome(null);
              setStill(null);
              startCamera();
            }}
          >
            try again
          </button>
          <Link href="/" className="btn-quiet">
            today&apos;s hunt
          </Link>
        </div>
        <p className="sr-only" aria-live="polite">
          {live}
        </p>
      </div>
    );
  }

  // viewfinder / capture / analysis / second angle: full screen, framed in paper
  const analysing = phase === "analyse";
  return (
    <div className="prise">
      {margin}
      <div className="prise-frame" role="img" aria-label={`Camera viewfinder, frame ${brand.name}`}>
        {!analysing && <video ref={videoRef} className="prise-video" playsInline muted autoPlay />}
        <AnimatePresence>
          {analysing && still && (
            <motion.div key="analyse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} style={{ position: "absolute", inset: 0 }}>
              <img src={still} alt="" className="prise-still" />
              <div className="prise-loupe" aria-hidden="true" style={{ backgroundImage: `url(${still})`, backgroundSize: "260% auto", backgroundPosition: "center" }} />
              <span className="prise-status" aria-live="polite">
                {STATUS[statusIdx]}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {phase === "capture" && <div className="prise-scan" aria-hidden="true" />}
        <div className="prise-vignette" aria-hidden="true" />
        <CoinsPhoto wide />
        {phase === "contre-angle" && (
          <span className="mono" style={{ position: "absolute", bottom: 12, right: 12, color: "var(--paper)", background: "rgba(35,32,25,.55)", padding: ".2rem .5rem" }}>
            {String(countdown).padStart(2, "0")} s
          </span>
        )}
      </div>
      <div className="prise-bottom">
        <Link href="/" className="btn-quiet" aria-label="Back to the notebook" style={{ fontSize: ".85rem" }}>
          ← back
        </Link>
        {phase === "viseur" && (
          <button className="btn prise-shutter" onClick={consigner} aria-label="Log it">
            log it
          </button>
        )}
        {phase === "contre-angle" && (
          <button className="btn prise-shutter" onClick={contreAngle} aria-label="Log the other angle">
            log the other angle
          </button>
        )}
        {(phase === "capture" || analysing) && <span className="mono legend">{phase === "capture" ? "hold the frame" : "analysing…"}</span>}
        <button
          className="btn-quiet"
          aria-pressed={sound}
          aria-label={sound ? "Mute" : "Sound on"}
          onClick={() => {
            const next = !sound;
            setSound(next);
            try {
              localStorage.setItem("spot:son", next ? "1" : "0");
            } catch {}
          }}
          style={{ fontSize: ".85rem" }}
        >
          {sound ? "sound on" : "sound off"}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
    </div>
  );
}
