import { useTranslation } from "react-i18next";
import type { Element } from "../../../bindings/Element";
import type { ElementPatch } from "../../../lib/elements";

export function PositionFields({ element, onUpdate }: { element: Element; onUpdate: (patch: ElementPatch) => void }) {
  const { t } = useTranslation();
  return (
    <div className="properties-section">
      <span className="properties-label">{t("properties.position")}</span>
      <div className="properties-grid-2">
        <label className="properties-mini-field">
          X
          <input
            className="properties-input mono"
            type="number"
            value={Math.round(element.x)}
            onChange={(e) => onUpdate({ x: Number(e.target.value) })}
          />
        </label>
        <label className="properties-mini-field">
          Y
          <input
            className="properties-input mono"
            type="number"
            value={Math.round(element.y)}
            onChange={(e) => onUpdate({ y: Number(e.target.value) })}
          />
        </label>
        <label className="properties-mini-field">
          W
          <input
            className="properties-input mono"
            type="number"
            value={Math.round(element.width)}
            onChange={(e) => onUpdate({ width: Number(e.target.value) })}
          />
        </label>
        <label className="properties-mini-field">
          H
          <input
            className="properties-input mono"
            type="number"
            value={Math.round(element.height)}
            onChange={(e) => onUpdate({ height: Number(e.target.value) })}
          />
        </label>
        <label className="properties-mini-field">
          {t("properties.rotation")}
          <input
            className="properties-input mono"
            type="number"
            value={Math.round(element.rotation)}
            onChange={(e) => onUpdate({ rotation: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}
