"use client";

import { motion } from "motion/react";
import type { Crop, PreparedMedia } from "@/lib/media";

type Props = { media: PreparedMedia | null; crop: Crop; connected: boolean; transferring: boolean; progress: number };

export function KeychainPreview({ media, crop, connected, transferring, progress }: Props) {
  const transform = `translate(calc(-50% + ${crop.x * -12}px), calc(-50% + ${crop.y * -12}px)) scale(${crop.zoom})`;
  return (
    <div className="preview-wrap" aria-label="Keychain display preview">
      <motion.div className="ring" animate={{ rotate: connected ? 360 : 8 }} transition={{ duration: 5, repeat: Infinity, ease: "linear" }} />
      <motion.div className="keychain" initial={{ y: -12, rotate: -2 }} animate={{ y: 0, rotate: 1 }} transition={{ type: "spring", stiffness: 90 }}>
        <div className="keychain-top"><span /><span /><span /></div>
        <div className="device-screen">
          {media ? (
            media.kind === "video" ? <video src={media.url} muted loop autoPlay playsInline style={{ transform }} /> : <img src={media.url} alt="Selected media preview" style={{ transform }} /> // eslint-disable-line @next/next/no-img-element -- object URLs cannot use the Next image optimizer
          ) : <EmptyFace />}
          <div className="screen-shine" />
          {transferring ? <div className="device-transfer"><span>BEAMING</span><i style={{ width: `${progress}%` }} /></div> : null}
        </div>
        <div className="device-label">PIXELLOOP <span>{connected ? "● LINKED" : "● READY"}</span></div>
      </motion.div>
    </div>
  );
}

function EmptyFace() {
  return <div className="empty-face"><div className="stars">✦　·　✦</div><div className="eyes">●‿●</div><p>pick a memory</p></div>;
}
