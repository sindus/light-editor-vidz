import { useTranslation } from "react-i18next";
import { Music } from "lucide-react";
import type { AudioTrack } from "../../../bindings/AudioTrack";
import { Header } from "./Header";

export function AudioProperties({
  track,
  onUpdate,
}: {
  track: AudioTrack;
  onUpdate: (patch: Partial<AudioTrack>) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Header color="var(--color-audio)" icon={<Music size={13} />} title="Audio" subtitle={track.name} />

      <div className="properties-section">
        <span className="properties-label">{t("properties.trackName")}</span>
        <input className="properties-input" value={track.name} onChange={(e) => onUpdate({ name: e.target.value })} />
      </div>

      <div className="properties-section">
        <div className="properties-row properties-row-header">
          <span className="properties-label">Volume</span>
          <div className="properties-row">
            <button
              type="button"
              className={`properties-toggle${track.solo ? " active" : ""}`}
              onClick={() => onUpdate({ solo: !track.solo })}
              title={t("properties.solo")}
            >
              {t("properties.solo")}
            </button>
            <button
              type="button"
              className={`properties-toggle${track.muted ? " active" : ""}`}
              onClick={() => onUpdate({ muted: !track.muted })}
              title={t("properties.mute")}
            >
              {track.muted ? t("properties.muted") : t("properties.mute")}
            </button>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={track.volume}
          onChange={(e) => onUpdate({ volume: Number(e.target.value) })}
        />
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.audioOffset")}</span>
        <input
          className="properties-input mono"
          type="number"
          step={0.1}
          min={0}
          value={track.audio_offset}
          onChange={(e) => onUpdate({ audio_offset: Math.max(0, Number(e.target.value)) })}
        />
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.fadeIn")}</span>
        <input
          className="properties-input mono"
          type="number"
          step={0.1}
          min={0}
          value={track.fade_in}
          onChange={(e) => onUpdate({ fade_in: Number(e.target.value) })}
        />
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.fadeOut")}</span>
        <input
          className="properties-input mono"
          type="number"
          step={0.1}
          min={0}
          value={track.fade_out}
          onChange={(e) => onUpdate({ fade_out: Number(e.target.value) })}
        />
      </div>
    </>
  );
}
