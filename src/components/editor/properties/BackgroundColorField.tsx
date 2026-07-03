import { useTranslation } from "react-i18next";
import ColorPickerField from "../ColorPickerField";

export function BackgroundColorField({
  value,
  onChange,
  defaultColor = "rgba(0,0,0,0.35)",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  defaultColor?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="properties-section">
      <div className="properties-row properties-row-header">
        <span className="properties-label">{t("properties.backgroundColor")}</span>
        <button
          type="button"
          className={`properties-toggle${value ? " active" : ""}`}
          onClick={() => onChange(value ? null : defaultColor)}
        >
          {value ? t("properties.backgroundColorOn") : t("properties.backgroundColorOff")}
        </button>
      </div>
      {value && <ColorPickerField value={value} onChange={onChange} />}
    </div>
  );
}
