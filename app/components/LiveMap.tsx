"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { LivePin } from "./LiveMapInner";

const Inner = dynamic(() => import("./LiveMapInner").then((m) => m.LiveMapInner), { ssr: false });

/**
 * The field map you can touch: pan, rotate, dive to street level with 3D buildings (MapLibre on
 * OpenFreeMap tiles). Until WebGL is up, the server-drawn `fallback` map stays visible underneath,
 * so the page never shows a hole.
 */
export function LiveMap({ pins, height, fallback }: { pins: LivePin[]; height: number; fallback?: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  return (
    <div className="livemap-wrap" style={{ height }}>
      {fallback && (
        <div className={`livemap-fallback ${ready ? "livemap-fallback-off" : ""}`} aria-hidden={ready}>
          {fallback}
        </div>
      )}
      <div className={`livemap-live ${ready ? "livemap-live-on" : ""}`}>
        <Inner pins={pins} height={height} onReady={() => setReady(true)} />
      </div>
    </div>
  );
}
