import { useTranslation } from "react-i18next";
import type { BlendMode } from "../../../bindings/BlendMode";

export const BLEND_MODES: BlendMode[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten"];
export const BLEND_MODE_LABEL_KEYS: Record<BlendMode, string> = {
  normal: "properties.blendNormal",
  multiply: "properties.blendMultiply",
  screen: "properties.blendScreen",
  overlay: "properties.blendOverlay",
  darken: "properties.blendDarken",
  lighten: "properties.blendLighten",
};

export function BlendModeField({
  value,
  onChange,
}: {
  value: BlendMode | null;
  onChange: (v: BlendMode | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="properties-section">
      <span className="properties-label">{t("properties.blendMode")}</span>
      <select
        className="properties-input"
        value={value ?? "normal"}
        onChange={(e) => onChange(e.target.value === "normal" ? null : (e.target.value as BlendMode))}
      >
        {BLEND_MODES.map((m) => (
          <option key={m} value={m}>
            {t(BLEND_MODE_LABEL_KEYS[m])}
          </option>
        ))}
      </select>
    </div>
  );
}
