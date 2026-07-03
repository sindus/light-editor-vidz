import { useTranslation } from "react-i18next";
import { Type } from "lucide-react";
import type { Element } from "../../../bindings/Element";
import type { TextAlign } from "../../../bindings/TextAlign";
import type { VerticalAlign } from "../../../bindings/VerticalAlign";
import type { ElementPatch } from "../../../lib/elements";
import ColorPickerField from "../ColorPickerField";
import { Header } from "./Header";
import { BackgroundColorField } from "./BackgroundColorField";
import { BlendModeField } from "./BlendModeField";
import { PositionFields } from "./PositionFields";
import { AnimationFields } from "./AnimationFields";

export const TEXT_ALIGN_OPTIONS: TextAlign[] = ["left", "center", "right"];
export const TEXT_ALIGN_LABELS: Record<TextAlign, string> = { left: "⟵", center: "•", right: "⟶" };
export const VERTICAL_ALIGN_OPTIONS: VerticalAlign[] = ["top", "middle", "bottom"];
export const VERTICAL_ALIGN_LABELS: Record<VerticalAlign, string> = { top: "⤒", middle: "•", bottom: "⤓" };

export function TextProperties({
  element,
  onUpdate,
}: {
  element: Extract<Element, { type: "text" }>;
  onUpdate: (patch: ElementPatch) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Header
        color="var(--color-text)"
        icon={<Type size={13} />}
        title={t("properties.textTitle")}
        subtitle={t("properties.layerSelected")}
      />

      <div className="properties-section">
        <span className="properties-label">{t("properties.content")}</span>
        <textarea
          className="properties-textarea"
          value={element.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          rows={2}
        />
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.font")}</span>
        <input
          className="properties-input"
          value={element.font_family ?? ""}
          onChange={(e) => onUpdate({ font_family: e.target.value })}
        />
        <div className="properties-row">
          <input
            className="properties-input mono"
            type="number"
            step={0.1}
            disabled={element.font_size === null}
            placeholder={element.font_size === null ? t("properties.fontSizeAuto") : undefined}
            value={element.font_size ?? ""}
            onChange={(e) => onUpdate({ font_size: Number(e.target.value) })}
          />
          <button
            type="button"
            className={`properties-toggle${element.font_size === null ? " active" : ""}`}
            onClick={() => onUpdate({ font_size: element.font_size === null ? 5 : null })}
            title={t("properties.fontSizeAutoToggle")}
          >
            {t("properties.fontSizeAuto")}
          </button>
          <button
            type="button"
            className={`properties-toggle${element.font_weight === "bold" ? " active" : ""}`}
            onClick={() => onUpdate({ font_weight: element.font_weight === "bold" ? "normal" : "bold" })}
          >
            B
          </button>
          <button
            type="button"
            className={`properties-toggle${element.font_style === "italic" ? " active" : ""}`}
            onClick={() => onUpdate({ font_style: element.font_style === "italic" ? "normal" : "italic" })}
          >
            I
          </button>
        </div>
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.alignment")}</span>
        <div className="properties-row">
          {TEXT_ALIGN_OPTIONS.map((a) => (
            <button
              type="button"
              key={a}
              className={`properties-toggle${element.alignment === a ? " active" : ""}`}
              onClick={() => onUpdate({ alignment: a })}
            >
              {TEXT_ALIGN_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.verticalAlignment")}</span>
        <div className="properties-row">
          {VERTICAL_ALIGN_OPTIONS.map((a) => (
            <button
              type="button"
              key={a}
              className={`properties-toggle${element.vertical_alignment === a ? " active" : ""}`}
              onClick={() => onUpdate({ vertical_alignment: a })}
            >
              {VERTICAL_ALIGN_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.color")}</span>
        <ColorPickerField value={element.color} onChange={(color) => onUpdate({ color })} />
      </div>

      <BackgroundColorField
        value={element.background_color}
        onChange={(background_color) => onUpdate({ background_color })}
      />

      <div className="properties-section">
        <span className="properties-label">{t("properties.letterSpacing")}</span>
        <input
          className="properties-input mono"
          type="number"
          step={0.1}
          value={element.letter_spacing ?? 0}
          onChange={(e) => onUpdate({ letter_spacing: Number(e.target.value) })}
        />
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.lineHeight")}</span>
        <input
          className="properties-input mono"
          type="number"
          step={0.05}
          min={0.5}
          value={element.line_height ?? 1}
          onChange={(e) => onUpdate({ line_height: Number(e.target.value) })}
        />
      </div>

      <div className="properties-section">
        <div className="properties-row properties-row-header">
          <span className="properties-label">{t("properties.textShadow")}</span>
          <button
            type="button"
            className={`properties-toggle${element.text_shadow ? " active" : ""}`}
            onClick={() => onUpdate({ text_shadow: element.text_shadow ? null : "rgba(0,0,0,0.6)" })}
          >
            {element.text_shadow ? t("properties.backgroundColorOn") : t("properties.backgroundColorOff")}
          </button>
        </div>
        {element.text_shadow && (
          <ColorPickerField value={element.text_shadow} onChange={(text_shadow) => onUpdate({ text_shadow })} />
        )}
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.textDecoration")}</span>
        <div className="properties-row">
          <button
            type="button"
            className={`properties-toggle${element.underline ? " active" : ""}`}
            onClick={() => onUpdate({ underline: !element.underline })}
          >
            <span style={{ textDecoration: "underline" }}>U</span>
          </button>
          <button
            type="button"
            className={`properties-toggle${element.strikethrough ? " active" : ""}`}
            onClick={() => onUpdate({ strikethrough: !element.strikethrough })}
          >
            <span style={{ textDecoration: "line-through" }}>S</span>
          </button>
        </div>
      </div>

      <BlendModeField value={element.blend_mode} onChange={(blend_mode) => onUpdate({ blend_mode })} />

      <PositionFields element={element} onUpdate={onUpdate} />
      <AnimationFields element={element} onUpdate={onUpdate} />
    </>
  );
}
