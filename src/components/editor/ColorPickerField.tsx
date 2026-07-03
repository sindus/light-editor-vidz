import { useState } from "react";

const DEFAULT_PRESETS = [
  "rgba(255,255,255,1)",
  "rgba(15,15,21,1)",
  "rgba(92,134,255,1)",
  "rgba(164,92,255,1)",
  "rgba(56,209,122,1)",
];

function parseRgba(value: string): { r: number; g: number; b: number; a: number } {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) return { r: 255, g: 255, b: 255, a: 1 };
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function fromHex(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  presets?: string[];
}

export default function ColorPickerField({ value, onChange, presets = DEFAULT_PRESETS }: Props) {
  const { r, g, b, a } = parseRgba(value);
  const [textValue, setTextValue] = useState(value);
  const [lastPropValue, setLastPropValue] = useState(value);
  if (value !== lastPropValue) {
    setLastPropValue(value);
    setTextValue(value);
  }

  function commitText(raw: string) {
    setTextValue(raw);
    const trimmed = raw.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      onChange(fromHex(trimmed, a));
    } else if (/^rgba?\(/.test(trimmed)) {
      onChange(trimmed);
    }
  }

  return (
    <div className="color-picker-field">
      <div className="properties-swatches">
        {presets.map((c) => (
          <button
            type="button"
            key={c}
            className={`properties-swatch${value === c ? " selected" : ""}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
        <input
          type="color"
          className="color-picker-native"
          value={toHex(r, g, b)}
          onChange={(e) => onChange(fromHex(e.target.value, a))}
        />
      </div>
      <div className="properties-row">
        <input
          className="properties-input mono color-picker-hex"
          value={textValue}
          onChange={(e) => commitText(e.target.value)}
        />
        <input
          type="range"
          className="color-picker-alpha"
          min={0}
          max={1}
          step={0.01}
          value={a}
          onChange={(e) => onChange(`rgba(${r},${g},${b},${e.target.value})`)}
        />
      </div>
    </div>
  );
}
