"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type ScanBox = { box: [number, number, number, number]; label: string; source: "measured" | "model" };

/** The scan with tamper regions drawn on it, and an optional compression heatmap layered over it. */
export function ScanViewer({ url, heatmapUrl, boxes, alt }: { url: string; heatmapUrl: string | null; boxes: ScanBox[]; alt: string }) {
  const [heat, setHeat] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  return (
    <div>
      <div className="relative overflow-hidden rounded-[10px] border border-line bg-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="block w-full" />
        {heat && heatmapUrl ? (
          // The heatmap is the page in grey with re-compression error in red, at the same size as the scan.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heatmapUrl} alt="Compression heatmap of the scan" className="pointer-events-none absolute inset-0 h-full w-full" />
        ) : null}
        {showBoxes
          ? boxes.map((b, n) => (
              <div
                key={n}
                className={cn("pointer-events-none absolute rounded-[3px] border-2", b.source === "measured" ? "border-red bg-red/10" : "border-dashed border-amber")}
                style={{ left: `${b.box[0] * 100}%`, top: `${b.box[1] * 100}%`, width: `${b.box[2] * 100}%`, height: `${b.box[3] * 100}%` }}
              >
                <span className={cn("absolute -top-5 left-0 whitespace-nowrap rounded px-1 font-mono text-[10px] text-white", b.source === "measured" ? "bg-red" : "bg-amber")}>{b.label}</span>
              </div>
            ))
          : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11.5px]">
        {boxes.length ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> flagged regions ({boxes.length})
          </label>
        ) : null}
        {heatmapUrl ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> compression heatmap
          </label>
        ) : null}
        <a href={url} target="_blank" rel="noreferrer" className="text-txt underline hover:text-ink">
          open full size
        </a>
      </div>
    </div>
  );
}
