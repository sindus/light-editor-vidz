import { useTranslation } from "react-i18next";
import { Type, Image as ImageIcon, Video as VideoIcon, Shapes, X } from "lucide-react";
import type { Element } from "../../../bindings/Element";

export const ICON_BY_TYPE: Record<Element["type"], React.ReactNode> = {
  text: <Type size={12} />,
  image: <ImageIcon size={12} />,
  video: <VideoIcon size={12} />,
  shape: <Shapes size={12} />,
};

/** Liste des calques de la composition active (ordre du tableau = z-order), réorganisable par drag. */
export function LayersPanel({
  elements,
  selectedIds,
  onSelectLayer,
  onReorderLayer,
  onDeleteLayer,
}: {
  elements: Element[];
  selectedIds: string[];
  onSelectLayer: (id: string, additive: boolean) => void;
  onReorderLayer: (id: string, toIndex: number) => void;
  onDeleteLayer: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (elements.length === 0) return null;
  // Affiché du dessus (dernier du tableau) vers le dessous, comme la plupart des éditeurs.
  const reversed = [...elements].reverse();

  return (
    <div className="properties-section layers-panel">
      <span className="properties-label">{t("properties.layers")}</span>
      <div className="layers-list">
        {reversed.map((el, i) => {
          const layerIndex = elements.length - 1 - i;
          return (
            <div
              key={el.id}
              className={`layers-row${selectedIds.includes(el.id) ? " selected" : ""}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/layer-id", el.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData("text/layer-id");
                if (draggedId) onReorderLayer(draggedId, layerIndex);
              }}
              onClick={(e) => onSelectLayer(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
            >
              <span className="layers-row-icon">{ICON_BY_TYPE[el.type]}</span>
              <span className="layers-row-name">{el.name}</span>
              <button
                type="button"
                className="layers-row-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteLayer(el.id);
                }}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
