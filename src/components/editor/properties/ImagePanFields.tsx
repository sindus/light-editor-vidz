import { useTranslation } from "react-i18next";
import type { Element } from "../../../bindings/Element";
import type { ImagePanType } from "../../../bindings/ImagePanType";
import type { ElementPatch } from "../../../lib/elements";

export const PAN_OPTIONS: { value: ImagePanType | ""; labelKey: string }[] = [
  { value: "", labelKey: "properties.kenBurnsNone" },
  { value: "zoomIn", labelKey: "properties.panZoomIn" },
  { value: "zoomOut", labelKey: "properties.panZoomOut" },
  { value: "panLeft", labelKey: "properties.panLeft" },
  { value: "panRight", labelKey: "properties.panRight" },
  { value: "panUp", labelKey: "properties.panUp" },
  { value: "panDown", labelKey: "properties.panDown" },
];

export function ImagePanFields({
  element,
  onUpdate,
}: {
  element: Extract<Element, { type: "image" | "video" }>;
  onUpdate: (patch: ElementPatch) => void;
}) {
  const { t } = useTranslation();
  const pan = element.image_pan;
  return (
    <div className="properties-section">
      <span className="properties-label">{t("properties.kenBurns")}</span>
      <select
        className="properties-input"
        value={pan?.pan_type ?? ""}
        onChange={(e) =>
          onUpdate({
            image_pan: e.target.value
              ? { pan_type: e.target.value as ImagePanType, intensity: pan?.intensity ?? 0.5 }
              : null,
          })
        }
      >
        {PAN_OPTIONS.map((o) => (
          <option key={o.labelKey} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
      {pan && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={pan.intensity}
          onChange={(e) => onUpdate({ image_pan: { ...pan, intensity: Number(e.target.value) } })}
        />
      )}
    </div>
  );
}
