import { useTranslation } from "react-i18next";
import { Type, Video, Image, Music, Shapes } from "lucide-react";
import type { LeftTab } from "./types";

const CATEGORIES: { id: LeftTab; labelKey: string; icon: typeof Type }[] = [
  { id: "text", labelKey: "rail.text", icon: Type },
  { id: "video", labelKey: "rail.video", icon: Video },
  { id: "image", labelKey: "rail.image", icon: Image },
  { id: "audio", labelKey: "rail.audio", icon: Music },
  { id: "shape", labelKey: "rail.shape", icon: Shapes },
];

interface Props {
  active: LeftTab;
  onChange: (tab: LeftTab) => void;
}

export default function CategoryRail({ active, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <nav className="editor-rail">
      {CATEGORIES.map(({ id, labelKey, icon: Icon }) => (
        <button
          type="button"
          key={id}
          className={`editor-rail-btn${active === id ? " active" : ""}`}
          onClick={() => onChange(id)}
        >
          <Icon size={18} />
          <span>{t(labelKey)}</span>
        </button>
      ))}
    </nav>
  );
}
