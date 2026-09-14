interface LoopControlsProps {
  bpm: number;
  bars: number;
  snapOn: boolean;
  speed: number;
  playing: boolean;
  onBpm: (bpm: number) => void;
  onBars: (bars: number) => void;
  onSnap: (on: boolean) => void;
  onSpeed: (speed: number) => void;
  onPlayPause: () => void;
  onStop: () => void;
}

export function LoopControls({
  bpm,
  bars,
  snapOn,
  speed,
  playing,
  onBpm,
  onBars,
  onSnap,
  onSpeed,
  onPlayPause,
  onStop,
}: LoopControlsProps) {
  const speedPct = Math.round(speed * 100);
  return (
    <div className="controls">
      <div className="control-grid">
        <div className="field">
          <label htmlFor="bpm">Tempo (BPM)</label>
          <input
            id="bpm"
            type="number"
            min={30}
            max={300}
            step={1}
            value={bpm}
            onChange={(e) => onBpm(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="bars">Bars</label>
          <input
            id="bars"
            type="number"
            min={1}
            max={16}
            step={1}
            value={bars}
            onChange={(e) => onBars(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <span className="field-label" id="snap-label">
            Snap to bars
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={snapOn}
              aria-labelledby="snap-label"
              onChange={(e) => onSnap(e.target.checked)}
            />
            <span>{snapOn ? "On" : "Off"}</span>
          </label>
        </div>
      </div>

      <div className="speed">
        <label htmlFor="speed">
          Speed <span className="speed-value">{speedPct}%</span>
        </label>
        <input
          id="speed"
          type="range"
          min={50}
          max={100}
          step={1}
          value={speedPct}
          onChange={(e) => onSpeed(Number(e.target.value) / 100)}
        />
      </div>

      <div className="transport">
        <button
          type="button"
          className="btn"
          aria-pressed={playing}
          onClick={onPlayPause}
        >
          {playing ? "Pause" : "Play loop"}
        </button>
        <button type="button" className="btn" onClick={onStop}>
          Stop
        </button>
      </div>
    </div>
  );
}
