import { useTranslation } from "react-i18next";
import { Image as ImageIcon, Video as VideoIcon } from "lucide-react";
import type { Element } from "../../../bindings/Element";
import type { ElementPatch } from "../../../lib/elements";
import ColorPickerField from "../ColorPickerField";
import { Header } from "./Header";
import { BackgroundColorField } from "./BackgroundColorField";
import { BlendModeField } from "./BlendModeField";
import { ImagePanFields } from "./ImagePanFields";
import { PositionFields } from "./PositionFields";
import { AnimationFields } from "./AnimationFields";

export const FIT_MODES = ["cover", "stretch", "fit-largest", "fit-width", "fit-height"] as const;

export function MediaProperties({
  element,
  onUpdate,
  activeDuration,
}: {
  element: Extract<Element, { type: "image" | "video" }>;
  onUpdate: (patch: ElementPatch) => void;
  /** Durée actuellement active (résolue) de l'élément — utilisée pour calculer le point de
   * sortie vidéo, non utilisée pour les images. */
  activeDuration: number;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Header
        color={element.type === "image" ? "var(--color-image)" : "var(--color-video)"}
        icon={element.type === "image" ? <ImageIcon size={13} /> : <VideoIcon size={13} />}
        title={element.type === "image" ? t("properties.imageTitle") : t("properties.videoTitle")}
        subtitle={element.name}
      />

      <div className="properties-section">
        <span className="properties-label">{t("properties.fit")}</span>
        <select
          className="properties-input"
          value={element.fit_mode}
          onChange={(e) => onUpdate({ fit_mode: e.target.value as (typeof FIT_MODES)[number] })}
        >
          {FIT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {element.type === "video" && (
        <>
          <div className="properties-section">
            <span className="properties-label">{t("properties.videoTrim")}</span>
            <div className="properties-row">
              <label className="properties-mini-field">
                {t("properties.videoTrimStart")}
                <input
                  className="properties-input mono"
                  type="number"
                  step={0.1}
                  min={0}
                  value={element.video_offset}
                  onChange={(e) => {
                    const newOffset = Math.max(0, Number(e.target.value));
                    // Décaler le point d'entrée ne doit pas déplacer le point de sortie déjà
                    // choisi : on ajuste la durée en sens inverse pour le compenser.
                    const sourceEnd = element.video_offset + activeDuration * element.playback_speed;
                    const newDuration = Math.max(0.1, (sourceEnd - newOffset) / element.playback_speed);
                    onUpdate({ video_offset: newOffset, duration: newDuration });
                  }}
                />
              </label>
              <label className="properties-mini-field">
                {t("properties.videoTrimEnd")}
                <input
                  className="properties-input mono"
                  type="number"
                  step={0.1}
                  min={element.video_offset + 0.1}
                  value={element.video_offset + activeDuration * element.playback_speed}
                  onChange={(e) => {
                    const sourceEnd = Number(e.target.value);
                    const newDuration = Math.max(0.1, (sourceEnd - element.video_offset) / element.playback_speed);
                    onUpdate({ duration: newDuration });
                  }}
                />
              </label>
            </div>
          </div>
          <div className="properties-section">
            <div className="properties-row properties-row-header">
              <span className="properties-label">{t("properties.volume")}</span>
              <button
                type="button"
                className={`properties-toggle${element.muted ? " active" : ""}`}
                onClick={() => onUpdate({ muted: !element.muted })}
                title={t("properties.videoSoundToggle")}
              >
                {element.muted ? t("properties.muted") : t("properties.mute")}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={element.volume}
              disabled={element.muted}
              onChange={(e) => onUpdate({ volume: Number(e.target.value) })}
            />
          </div>
          <div className="properties-section">
            <span className="properties-label">{t("properties.playbackSpeed")}</span>
            <input
              className="properties-input mono"
              type="number"
              step={0.1}
              min={0.1}
              max={4}
              value={element.playback_speed}
              onChange={(e) => onUpdate({ playback_speed: Number(e.target.value) })}
            />
          </div>
          <div className="properties-section">
            <span className="properties-label">{t("properties.videoEndBehavior")}</span>
            <select
              className="properties-input"
              value={element.loop_video ? "loop" : "freeze"}
              onChange={(e) => onUpdate({ loop_video: e.target.value === "loop" })}
            >
              <option value="freeze">{t("properties.videoEndFreeze")}</option>
              <option value="loop">{t("properties.videoEndLoop")}</option>
            </select>
          </div>
        </>
      )}

      <BackgroundColorField
        value={element.background_color}
        onChange={(background_color) => onUpdate({ background_color })}
        defaultColor="rgba(0,0,0,1)"
      />

      <div className="properties-section">
        <span className="properties-label">{t("properties.cornerRadius")}</span>
        <input
          type="range"
          min={0}
          max={50}
          step={1}
          value={element.corner_radius ?? 0}
          onChange={(e) => onUpdate({ corner_radius: Number(e.target.value) })}
        />
      </div>

      <div className="properties-section">
        <div className="properties-row properties-row-header">
          <span className="properties-label">{t("properties.border")}</span>
          <button
            type="button"
            className={`properties-toggle${element.border_color ? " active" : ""}`}
            onClick={() =>
              onUpdate(
                element.border_color
                  ? { border_color: null, border_width: null }
                  : { border_color: "rgba(255,255,255,1)", border_width: 2 },
              )
            }
          >
            {element.border_color ? t("properties.backgroundColorOn") : t("properties.backgroundColorOff")}
          </button>
        </div>
        {element.border_color && (
          <>
            <ColorPickerField value={element.border_color} onChange={(border_color) => onUpdate({ border_color })} />
            <input
              className="properties-input mono"
              type="number"
              min={0.5}
              step={0.5}
              value={element.border_width ?? 2}
              onChange={(e) => onUpdate({ border_width: Number(e.target.value) })}
            />
          </>
        )}
      </div>

      <BlendModeField value={element.blend_mode} onChange={(blend_mode) => onUpdate({ blend_mode })} />

      <ImagePanFields element={element} onUpdate={onUpdate} />
      <PositionFields element={element} onUpdate={onUpdate} />
      <AnimationFields element={element} onUpdate={onUpdate} />
    </>
  );
}
