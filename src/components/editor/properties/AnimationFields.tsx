import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import type { Element } from "../../../bindings/Element";
import type { AnimationType } from "../../../bindings/AnimationType";
import type { Animation } from "../../../bindings/Animation";
import type { Easing } from "../../../bindings/Easing";
import type { ElementPatch } from "../../../lib/elements";

export const ANIMATION_OPTIONS: { type: AnimationType; labelKey: string }[] = [
  { type: "fade", labelKey: "properties.animFade" },
  { type: "slide-left", labelKey: "properties.animSlideLeft" },
  { type: "slide-right", labelKey: "properties.animSlideRight" },
  { type: "slide-up", labelKey: "properties.animSlideUp" },
  { type: "slide-down", labelKey: "properties.animSlideDown" },
  { type: "fade-left", labelKey: "properties.animFadeLeft" },
  { type: "fade-right", labelKey: "properties.animFadeRight" },
  { type: "fade-up", labelKey: "properties.animFadeUp" },
  { type: "fade-down", labelKey: "properties.animFadeDown" },
  { type: "zoom-in", labelKey: "properties.animZoomIn" },
  { type: "zoom-out", labelKey: "properties.animZoomOut" },
  { type: "rotate", labelKey: "properties.animRotate" },
  { type: "flip", labelKey: "properties.animFlip" },
  { type: "blur", labelKey: "properties.animBlur" },
  { type: "bounce", labelKey: "properties.animBounce" },
  { type: "drop", labelKey: "properties.animDrop" },
  { type: "skew-left", labelKey: "properties.animSkewLeft" },
  { type: "skew-right", labelKey: "properties.animSkewRight" },
  { type: "roll", labelKey: "properties.animRoll" },
  { type: "spin", labelKey: "properties.animSpin" },
];

export const TEXT_ONLY_ANIMATION_OPTIONS: { type: AnimationType; labelKey: string }[] = [
  { type: "typewriter", labelKey: "properties.animTypewriter" },
  { type: "word-reveal", labelKey: "properties.animWordReveal" },
  { type: "line-reveal", labelKey: "properties.animLineReveal" },
];

export const EASING_OPTIONS: { value: Easing; labelKey: string }[] = [
  { value: "linear", labelKey: "properties.easingLinear" },
  { value: "power1-in", labelKey: "properties.easingPower1In" },
  { value: "power1-out", labelKey: "properties.easingPower1Out" },
  { value: "power1-in-out", labelKey: "properties.easingPower1InOut" },
  { value: "power2-in", labelKey: "properties.easingPower2In" },
  { value: "power2-out", labelKey: "properties.easingPower2Out" },
  { value: "power2-in-out", labelKey: "properties.easingPower2InOut" },
  { value: "power3-in", labelKey: "properties.easingPower3In" },
  { value: "power3-out", labelKey: "properties.easingPower3Out" },
  { value: "power3-in-out", labelKey: "properties.easingPower3InOut" },
  { value: "bounce", labelKey: "properties.easingBounce" },
];

export const DEFAULT_ANIMATION: Animation = {
  animation_type: "fade",
  direction: "in",
  duration: 0.6,
  easing: "power2-out",
  with_fade: true,
};

export function AnimationFields({ element, onUpdate }: { element: Element; onUpdate: (patch: ElementPatch) => void }) {
  const { t } = useTranslation();
  const options = element.type === "text" ? [...ANIMATION_OPTIONS, ...TEXT_ONLY_ANIMATION_OPTIONS] : ANIMATION_OPTIONS;

  function addAnimation() {
    onUpdate({ animations: [...element.animations, { ...DEFAULT_ANIMATION }] });
  }

  function updateAnimation(index: number, patch: Partial<Animation>) {
    onUpdate({ animations: element.animations.map((a, i) => (i === index ? { ...a, ...patch } : a)) });
  }

  function removeAnimation(index: number) {
    onUpdate({ animations: element.animations.filter((_, i) => i !== index) });
  }

  return (
    <div className="properties-section">
      <div className="properties-row properties-row-header">
        <span className="properties-label">{t("properties.animation")}</span>
        <button type="button" className="properties-toggle" onClick={addAnimation} title={t("properties.animAdd")}>
          <Plus size={12} />
        </button>
      </div>
      {element.animations.map((anim, i) => (
        <div key={i} className="animation-entry">
          <div className="properties-row">
            <select
              className="properties-input"
              value={anim.animation_type}
              onChange={(e) => updateAnimation(i, { animation_type: e.target.value as AnimationType })}
            >
              {element.type === "text" ? (
                <>
                  <optgroup label={t("properties.animGroupInOut")}>
                    {ANIMATION_OPTIONS.map((opt) => (
                      <option key={opt.type} value={opt.type}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("properties.animGroupReveal")}>
                    {TEXT_ONLY_ANIMATION_OPTIONS.map((opt) => (
                      <option key={opt.type} value={opt.type}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </optgroup>
                </>
              ) : (
                options.map((opt) => (
                  <option key={opt.type} value={opt.type}>
                    {t(opt.labelKey)}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              className="properties-toggle"
              onClick={() => removeAnimation(i)}
              title={t("properties.animRemove")}
            >
              <X size={12} />
            </button>
          </div>
          <div className="properties-row">
            <button
              type="button"
              className={`properties-toggle${anim.direction === "in" ? " active" : ""}`}
              onClick={() => updateAnimation(i, { direction: "in" })}
            >
              {t("properties.animIn")}
            </button>
            <button
              type="button"
              className={`properties-toggle${anim.direction === "out" ? " active" : ""}`}
              onClick={() => updateAnimation(i, { direction: "out" })}
            >
              {t("properties.animOut")}
            </button>
            <button
              type="button"
              className={`properties-toggle${anim.with_fade ? " active" : ""}`}
              onClick={() => updateAnimation(i, { with_fade: !anim.with_fade })}
              title={t("properties.animFadeToggle")}
            >
              {t("properties.animFadeShort")}
            </button>
          </div>
          <div className="properties-row">
            <input
              className="properties-input mono"
              type="number"
              step={0.1}
              min={0.1}
              value={anim.duration}
              onChange={(e) => updateAnimation(i, { duration: Number(e.target.value) })}
            />
            <select
              className="properties-input"
              value={anim.easing}
              onChange={(e) => updateAnimation(i, { easing: e.target.value as Easing })}
            >
              {EASING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
