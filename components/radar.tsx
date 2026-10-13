"use client";

import { motion } from "motion/react";
import { Radio, X } from "lucide-react";

type Props = { open: boolean; scanning: boolean; connected: boolean; onClose: () => void; onConnect: () => void };

export function Radar({ open, scanning, connected, onClose, onConnect }: Props) {
  if (!open) return null;
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="radar-card" role="dialog" aria-modal="true" aria-labelledby="radar-title" initial={{ scale: .9, y: 20 }} animate={{ scale: 1, y: 0 }}>
        <button className="icon-button close" onClick={onClose} aria-label="Close device finder"><X size={18} /></button>
        <div className={`radar ${connected ? "found" : ""}`}>
          <div className="radar-grid" />
          {scanning ? <motion.div className="sweep" animate={{ rotate: 360 }} transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }} /> : null}
          <motion.div className="device-dot" animate={{ scale: connected ? [1, 1.2, 1] : [0.8, 1, 0.8] }} transition={{ repeat: Infinity, duration: 1.3 }}><Radio /></motion.div>
        </div>
        <p className="eyebrow">PAIRING MODE</p>
        <h2 id="radar-title">{connected ? "PixelLoop found!" : "Looking for your loop…"}</h2>
        <p>Hold the keychain button for 2 seconds, then join its <strong>PixelLoop-xxxx</strong> Wi‑Fi network.</p>
        <button className="primary wide" onClick={onConnect} disabled={scanning}>{scanning ? "Scanning 192.168.4.1…" : connected ? "Connected" : "I joined — find it"}</button>
      </motion.section>
    </motion.div>
  );
}
