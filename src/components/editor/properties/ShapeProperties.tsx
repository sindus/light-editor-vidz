import { useTranslation } from "react-i18next";
import { Shapes } from "lucide-react";
import type { Element } from "../../../bindings/Element";
import type { ShapeType } from "../../../bindings/ShapeType";
import type { ElementPatch } from "../../../lib/elements";
import ColorPickerField from "../ColorPickerField";
import { Header } from "./Header";
import { BlendModeField } from "./BlendModeField";
import { PositionFields } from "./PositionFields";
import { AnimationFields } from "./AnimationFields";

const SHAPE_TYPES: ShapeType[] = ["rectangle", "ellipse", "triangle", "line", "arrow", "star"];
const SHAPE_TYPE_LABEL_KEYS: Record<ShapeType, string> = {
  rectangle: "shapes.rectangle",
  ellipse: "shapes.ellipse",
  triangle: "shapes.triangle",
  line: "shapes.line",
  arrow: "shapes.arrow",
  star: "shapes.star",
};

export function ShapeProperties({
  element,
  onUpdate,
}: {
  element: Extract<Element, { type: "shape" }>;
  onUpdate: (patch: ElementPatch) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Header
        color="var(--color-shape)"
        icon={<Shapes size={13} />}
        title={t("properties.shapeTitle")}
        subtitle={element.name}
      />

      <div className="properties-section">
        <span className="properties-label">{t("properties.shapeType")}</span>
        <select
          className="properties-input"
          value={element.shape_type}
          onChange={(e) => onUpdate({ shape_type: e.target.value as ShapeType })}
        >
          {SHAPE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(SHAPE_TYPE_LABEL_KEYS[type])}
            </option>
          ))}
        </select>
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.fillColor")}</span>
        <ColorPickerField value={element.fill} onChange={(fill) => onUpdate({ fill })} />
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.stroke")}</span>
        <div className="properties-row">
          <input
            className="properties-input mono"
            type="number"
            min={0}
            value={element.stroke_width}
            onChange={(e) => onUpdate({ stroke_width: Number(e.target.value) })}
          />
          <button
            type="button"
            className={`properties-toggle${element.stroke !== "none" ? " active" : ""}`}
            onClick={() => onUpdate({ stroke: element.stroke === "none" ? "rgba(255,255,255,1)" : "none" })}
          >
            S
          </button>
          <button
            type="button"
            className={`properties-toggle${element.stroke_dash ? " active" : ""}`}
            onClick={() => onUpdate({ stroke_dash: element.stroke_dash ? null : 6 })}
            title={t("properties.strokeDash")}
          >
            ┄
          </button>
        </div>
        {element.stroke !== "none" && (
          <ColorPickerField value={element.stroke} onChange={(stroke) => onUpdate({ stroke })} />
        )}
        {element.stroke_dash !== null && (
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={element.stroke_dash ?? 6}
            onChange={(e) => onUpdate({ stroke_dash: Number(e.target.value) })}
          />
        )}
      </div>

      {element.shape_type === "rectangle" && (
        <div className="properties-section">
          <span className="properties-label">{t("properties.borderRadius")}</span>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={element.border_radius ?? 0}
            onChange={(e) => onUpdate({ border_radius: Number(e.target.value) })}
          />
        </div>
      )}

      <div className="properties-section">
        <div className="properties-row properties-row-header">
          <span className="properties-label">{t("properties.gradient")}</span>
          <button
            type="button"
            className={`properties-toggle${element.gradient_to ? " active" : ""}`}
            onClick={() =>
              onUpdate(
                element.gradient_to
                  ? { gradient_to: null, gradient_angle: null }
                  : { gradient_to: "rgba(255,255,255,1)", gradient_angle: 0 },
              )
            }
          >
            {element.gradient_to ? t("properties.backgroundColorOn") : t("properties.backgroundColorOff")}
          </button>
        </div>
        {element.gradient_to && (
          <>
            <ColorPickerField value={element.gradient_to} onChange={(gradient_to) => onUpdate({ gradient_to })} />
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              value={element.gradient_angle ?? 0}
              onChange={(e) => onUpdate({ gradient_angle: Number(e.target.value) })}
            />
          </>
        )}
      </div>

      <BlendModeField value={element.blend_mode} onChange={(blend_mode) => onUpdate({ blend_mode })} />

      <PositionFields element={element} onUpdate={onUpdate} />
      <AnimationFields element={element} onUpdate={onUpdate} />
    </>
  );
}
