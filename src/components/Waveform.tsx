import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { Peak } from "../audio/peaks";
import type { Region } from "../audio/timing";

interface WaveformProps {
  peaks: Peak[];
  duration: number;
  region: Region;
  snapOn: boolean;
  /** Reports a proposed region from a drag or nudge. Parent applies snap. */
  onRegionChange: (region: Region) => void;
}

type DragMode = "start" | "end" | "body";
const HANDLE_PX = 14;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function fmt(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${r}`;
}

export function Waveform({
  peaks,
  duration,
  region,
  snapOn,
  onRegionChange,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: DragMode; grabOffset: number } | null>(null);
  const regionRef = useRef(region);
  regionRef.current = region;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth;
    const cssH = 160;
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.floor(cssH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const mid = cssH / 2;
    // Waveform bars.
    ctx.fillStyle = "#3a4453";
    const n = peaks.length || 1;
    const barW = cssW / n;
    for (let i = 0; i < peaks.length; i++) {
      const p = peaks[i];
      const top = mid - p.max * mid;
      const h = Math.max(1, (p.max - p.min) * mid);
      ctx.fillRect(i * barW, top, Math.max(1, barW - 0.5), h);
    }

    // Region overlay.
    if (duration > 0) {
      const x1 = (region.startSec / duration) * cssW;
      const x2 = (region.endSec / duration) * cssW;
      ctx.fillStyle = "rgba(82, 208, 176, 0.18)";
      ctx.fillRect(x1, 0, x2 - x1, cssH);
      ctx.fillStyle = "#52d0b0";
      ctx.fillRect(x1 - 1, 0, 3, cssH);
      ctx.fillRect(x2 - 1, 0, 3, cssH);
    }
  }, [peaks, region, duration]);

  useEffect(() => {
    draw();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  function xToTime(clientX: number): number {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return clamp(ratio * duration, 0, duration);
  }

  function applyFromDrag(time: number) {
    const r = regionRef.current;
    const length = r.endSec - r.startSec;
    const mode = drag.current?.mode ?? "body";
    if (snapOn) {
      // Length is locked by snap; any drag moves the whole window.
      let start = mode === "end" ? time - length : time - (drag.current?.grabOffset ?? 0);
      start = clamp(start, 0, Math.max(0, duration - length));
      onRegionChange({ startSec: start, endSec: start + length });
      return;
    }
    if (mode === "start") {
      const start = clamp(time, 0, r.endSec - 0.05);
      onRegionChange({ startSec: start, endSec: r.endSec });
    } else if (mode === "end") {
      const end = clamp(time, r.startSec + 0.05, duration);
      onRegionChange({ startSec: r.startSec, endSec: end });
    } else {
      let start = clamp(time - (drag.current?.grabOffset ?? 0), 0, duration - length);
      onRegionChange({ startSec: start, endSec: start + length });
    }
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const x1 = (region.startSec / duration) * rect.width;
    const x2 = (region.endSec / duration) * rect.width;
    let mode: DragMode = "body";
    if (Math.abs(x - x1) <= HANDLE_PX) mode = "start";
    else if (Math.abs(x - x2) <= HANDLE_PX) mode = "end";
    const time = xToTime(e.clientX);
    drag.current = { mode, grabOffset: time - region.startSec };
    canvas.setPointerCapture(e.pointerId);
    applyFromDrag(time);
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) return;
    applyFromDrag(xToTime(e.clientX));
  }

  function endDrag(e: PointerEvent<HTMLCanvasElement>) {
    if (drag.current && canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  }

  function nudge(which: "start" | "end", delta: number) {
    const r = regionRef.current;
    const length = r.endSec - r.startSec;
    if (snapOn || which === "start") {
      let start = clamp(r.startSec + delta, 0, Math.max(0, duration - length));
      onRegionChange({ startSec: start, endSec: start + length });
    } else {
      const end = clamp(r.endSec + delta, r.startSec + 0.05, duration);
      onRegionChange({ startSec: r.startSec, endSec: end });
    }
  }

  function handleKey(
    which: "start" | "end",
    e: KeyboardEvent<HTMLButtonElement>,
  ) {
    const step = e.shiftKey ? 0.5 : 0.05;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      nudge(which, -step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nudge(which, step);
    }
  }

  return (
    <div className="waveform-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="waveform-canvas"
        role="img"
        aria-label="Waveform of the loaded song. Drag to move the loop region."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div className="region-info">
        <span>Loop start {fmt(region.startSec)}</span>
        <span>Loop end {fmt(region.endSec)}</span>
      </div>
      <div className="handle-hint">
        <button
          type="button"
          className="handle"
          role="slider"
          aria-label="Loop start"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration * 100) / 100}
          aria-valuenow={Math.round(region.startSec * 100) / 100}
          aria-valuetext={`Loop start ${fmt(region.startSec)}`}
          onKeyDown={(e) => handleKey("start", e)}
        >
          Nudge start
        </button>
        <button
          type="button"
          className="handle"
          role="slider"
          aria-label="Loop end"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration * 100) / 100}
          aria-valuenow={Math.round(region.endSec * 100) / 100}
          aria-valuetext={`Loop end ${fmt(region.endSec)}`}
          onKeyDown={(e) => handleKey("end", e)}
        >
          Nudge end
        </button>
      </div>
    </div>
  );
}
