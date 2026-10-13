"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { AnimatePresence, motion } from "motion/react";
import { Check, Crop as CropIcon, Download, Radio, Sparkles, Upload, Wifi } from "lucide-react";
import { KeychainPreview } from "./keychain-preview";
import { Radar } from "./radar";
import { buildKeychainFile, type Crop, type PreparedMedia } from "@/lib/media";

const DEVICE_URL = process.env.NEXT_PUBLIC_DEVICE_URL ?? "http://192.168.4.1";
type Stage = "choose" | "adjust" | "connect";

export function Studio() {
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [media, setMedia] = useState<PreparedMedia | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, zoom: 1 });
  const [trim, setTrim] = useState<[number, number]>([0, 3]);
  const [radar, setRadar] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("Choose a photo, GIF, or short video to begin.");

  useEffect(() => {
    if (!root.current) return;
    const context = gsap.context(() => {
      gsap.from(".hero-copy > *", { y: 24, opacity: 0, stagger: .09, duration: .7, ease: "power3.out" });
      gsap.from(".preview-wrap", { scale: .92, opacity: 0, duration: .9, delay: .2, ease: "back.out(1.4)" });
    }, root);
    return () => context.revert();
  }, []);

  useEffect(() => () => { if (media) URL.revokeObjectURL(media.url); }, [media]);

  const durationLabel = useMemo(() => `${(trim[1] - trim[0]).toFixed(1)}s loop`, [trim]);

  async function pick(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setNotice("Please choose an image, GIF, or browser-supported video."); return;
    }
    if (media) URL.revokeObjectURL(media.url);
    const url = URL.createObjectURL(file);
    const kind: PreparedMedia["kind"] = file.type === "image/gif" ? "gif" : file.type.startsWith("video/") ? "video" : "image";
    let duration = kind === "image" ? 1 : 3;
    if (kind === "video") {
      const video = document.createElement("video"); video.src = url;
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve(); video.onerror = () => resolve(); });
      duration = Number.isFinite(video.duration) ? Math.min(video.duration, 12) : 3;
    } else if (kind === "gif") {
      try {
        const { parseGIF, decompressFrames } = await import("gifuct-js");
        const parsed = parseGIF(await file.arrayBuffer());
        const frames = decompressFrames(parsed, false);
        duration = Math.min(12, Math.max(.1, frames.reduce((sum, frame) => sum + Math.max(20, frame.delay || 100), 0) / 1000));
      } catch { duration = 3; }
    }
    setMedia({ url, kind, name: file.name, duration, file });
    setTrim([0, duration]); setCrop({ x: 0, y: 0, zoom: 1 }); setStage("adjust");
    setNotice(`${file.name} is ready to frame.`);
  }

  async function findDevice() {
    setScanning(true); setNotice("Searching for PixelLoop on the local network…");
    try {
      const response = await fetch(`${DEVICE_URL}/api/status`, { signal: AbortSignal.timeout(4500) });
      if (!response.ok) throw new Error();
      setConnected(true); setStage("connect"); setNotice("PixelLoop connected. Ready to beam!");
      setTimeout(() => setRadar(false), 650);
    } catch {
      setConnected(false); setNotice("Not found. Join the PixelLoop Wi‑Fi network, then try again. On Vercel, your browser may block local HTTP; use the local app or device portal.");
    } finally { setScanning(false); }
  }

  async function createAsset() {
    if (!media) return null;
    setBusy(true); setProgress(3); setNotice("Packing tiny frames for the keychain…");
    try {
      const blob = await buildKeychainFile(media, crop, trim, (value) => setProgress(Math.round(value * 55)));
      return blob;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not process this media.");
      return null;
    } finally { setBusy(false); }
  }

  async function downloadAsset() {
    const blob = await createAsset(); if (!blob) return;
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "pixelloop.kca"; anchor.click();
    URL.revokeObjectURL(anchor.href); setProgress(100); setNotice("Keychain file downloaded. You can upload it from the device portal too.");
  }

  async function beam() {
    const blob = await createAsset(); if (!blob) return;
    setBusy(true); setNotice("Beaming your loop over Wi‑Fi…");
    try {
      const request = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        request.open("POST", `${DEVICE_URL}/api/upload`);
        request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(55 + Math.round((event.loaded / event.total) * 45)); };
        request.onload = () => request.status < 300 ? resolve() : reject(new Error(`Device returned ${request.status}`));
        request.onerror = () => reject(new Error("The browser could not reach the keychain."));
        const form = new FormData();
        form.append("media", blob, "pixelloop.kca");
        request.send(form);
      });
      setProgress(100); setNotice("Done — your new loop is glowing on the keychain!");
    } catch (error) { setNotice(`${error instanceof Error ? error.message : "Upload failed"} Try the downloaded .kca file at http://192.168.4.1.`); }
    finally { setBusy(false); }
  }

  return (
    <main ref={root}>
      <nav><a className="brand" href="#top"><span>✦</span> PIXELLOOP</a><div className="nav-status"><i className={connected ? "online" : ""} />{connected ? "KEYCHAIN LINKED" : "OFFLINE STUDIO"}</div></nav>
      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><Sparkles size={14} /> YOUR MEMORIES, POCKET-SIZED</p>
          <h1>Make a tiny<br/><em>moment</em> loop.</h1>
          <p className="lede">Crop it. Trim it. Preview it on your keychain.<br/>Then beam it over Wi‑Fi in a few bright seconds.</p>
          <div className="hero-actions"><button className="primary" onClick={() => input.current?.click()}><Upload size={18} /> Choose media</button><button className="secondary" onClick={() => setRadar(true)}><Radio size={18} /> Find keychain</button></div>
          <input ref={input} type="file" accept="image/*,video/*,.gif" hidden onChange={(event) => pick(event.target.files?.[0])} />
          <div className="format-list"><span>JPG</span><span>PNG</span><span>GIF</span><span>MP4</span><span>WEBM</span></div>
        </div>
        <KeychainPreview media={media} crop={crop} connected={connected} transferring={busy} progress={progress} />
      </section>

      <section className="workbench">
        <div className="steps" aria-label="Setup progress">
          {["choose", "adjust", "connect"].map((item, index) => <button key={item} className={stage === item ? "active" : ""} onClick={() => (item === "choose" || media) && setStage(item as Stage)}><span>{stageIndex(stage) > index ? <Check size={14} /> : index + 1}</span>{item}</button>)}
        </div>
        <AnimatePresence mode="wait">
          {stage === "choose" ? <motion.div className="panel drop-panel" key="choose" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}><Upload size={30}/><h2>Drop a little moment here</h2><p>Photos or short clips up to 12 seconds work best.</p><button className="text-button" onClick={() => input.current?.click()}>Browse files →</button></motion.div> : null}
          {stage === "adjust" && media ? <motion.div className="panel editor" key="adjust" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div><p className="eyebrow"><CropIcon size={14}/> FRAME & TRIM</p><h2>Make it fit your loop</h2><p className="muted">The square shows exactly what the 240 × 240 display will show.</p></div>
            <div className="controls">
              <label>Zoom <strong>{crop.zoom.toFixed(1)}×</strong><input type="range" min="1" max="3" step=".05" value={crop.zoom} onChange={(e) => setCrop((value) => ({ ...value, zoom: Number(e.target.value) }))}/></label>
              <label>Move sideways <input type="range" min="-1" max="1" step=".05" value={crop.x} onChange={(e) => setCrop((value) => ({ ...value, x: Number(e.target.value) }))}/></label>
              <label>Move up/down <input type="range" min="-1" max="1" step=".05" value={crop.y} onChange={(e) => setCrop((value) => ({ ...value, y: Number(e.target.value) }))}/></label>
              {media.kind !== "image" ? <div className="trim"><label>Starts at <strong>{trim[0].toFixed(1)}s</strong><input type="range" min="0" max={Math.max(0, trim[1] - .2)} step=".1" value={trim[0]} onChange={(e) => setTrim([Number(e.target.value), trim[1]])}/></label><label>Ends at <strong>{trim[1].toFixed(1)}s</strong><input type="range" min={trim[0] + .2} max={media.duration} step=".1" value={trim[1]} onChange={(e) => setTrim([trim[0], Number(e.target.value)])}/></label><span className="loop-pill">↻ {durationLabel}</span></div> : <span className="loop-pill">↻ still image</span>}
            </div>
            <button className="primary next" onClick={() => { setStage("connect"); setRadar(true); }}>Looks good <span>→</span></button>
          </motion.div> : null}
          {stage === "connect" ? <motion.div className="panel connect-panel" key="connect" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><div className={`link-orb ${connected ? "connected" : ""}`}><Wifi /></div><div><p className="eyebrow">FINAL STEP</p><h2>{connected ? "Ready to beam" : "Connect your keychain"}</h2><p className="muted">Hold the hardware button for 2 seconds, join PixelLoop Wi‑Fi, then find it.</p></div><div className="connect-actions"><button className="secondary" onClick={() => setRadar(true)}><Radio size={17}/>{connected ? "Re-scan" : "Find device"}</button><button className="primary" disabled={!media || !connected || busy} onClick={beam}>{busy ? `${progress}%` : "Beam to keychain"}</button><button className="text-button" disabled={!media || busy} onClick={downloadAsset}><Download size={15}/> Download .kca</button></div></motion.div> : null}
        </AnimatePresence>
        <div className="notice" role="status"><span className={connected ? "green" : ""}/>{notice}</div>
      </section>

      <section className="how"><p className="eyebrow">FROM CAMERA ROLL TO KEY RING</p><h2>Three small steps.<br/>One very happy keychain.</h2><div className="how-grid"><article><span>01</span><h3>Pick a memory</h3><p>A photo, tiny video, or looping GIF.</p></article><article><span>02</span><h3>Make it yours</h3><p>Zoom, position, and trim in the live preview.</p></article><article><span>03</span><h3>Beam it over</h3><p>Pair over local Wi‑Fi and watch the progress glow.</p></article></div></section>
      <footer><span>✦ PIXELLOOP</span><p>Built for tiny screens and big feelings.</p></footer>
      <AnimatePresence><Radar open={radar} scanning={scanning} connected={connected} onClose={() => setRadar(false)} onConnect={findDevice}/></AnimatePresence>
    </main>
  );
}

function stageIndex(stage: Stage) { return ["choose", "adjust", "connect"].indexOf(stage); }
