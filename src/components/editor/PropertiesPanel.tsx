import { useTranslation } from "react-i18next";
import { MousePointer2, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import type { Element } from "../../bindings/Element";
import type { AudioTrack } from "../../bindings/AudioTrack";
import type { ElementPatch, AlignEdge } from "../../lib/elements";
import { LayersPanel } from "./properties/LayersPanel";
import { MultiSelectionProperties } from "./properties/MultiSelectionProperties";
import { AudioProperties } from "./properties/AudioProperties";
import { TextProperties } from "./properties/TextProperties";
import { MediaProperties } from "./properties/MediaProperties";
import { ShapeProperties } from "./properties/ShapeProperties";

interface Props {
  element: Element | null;
  audioTrack: AudioTrack | null;
  onUpdate: (patch: ElementPatch) => void;
  onUpdateAudio: (patch: Partial<AudioTrack>) => void;
  onReorder: (direction: 1 | -1) => void;
  /** Durée de la composition active — repli pour calculer le point de sortie d'une vidéo quand
   * `element.duration` est `null` (l'élément dure jusqu'à la fin de la scène). */
  activeCompositionDuration: number;
  elements: Element[];
  selectedIds: string[];
  onSelectLayer: (id: string, additive: boolean) => void;
  onReorderLayer: (id: string, toIndex: number) => void;
  onDeleteLayer: (id: string) => void;
  onAlign: (edge: AlignEdge) => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onGroup: () => void;
  onUngroup: () => void;
}

export default function PropertiesPanel({
  element,
  audioTrack,
  onUpdate,
  onUpdateAudio,
  onReorder,
  activeCompositionDuration,
  elements,
  selectedIds,
  onSelectLayer,
  onReorderLayer,
  onDeleteLayer,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
}: Props) {
  const { t } = useTranslation();
  const layers = (
    <LayersPanel
      elements={elements}
      selectedIds={selectedIds}
      onSelectLayer={onSelectLayer}
      onReorderLayer={onReorderLayer}
      onDeleteLayer={onDeleteLayer}
    />
  );

  if (audioTrack) {
    return (
      <aside className="editor-properties">
        <div className="properties-content">
          <AudioProperties track={audioTrack} onUpdate={onUpdateAudio} />
          {layers}
        </div>
      </aside>
    );
  }

  if (selectedIds.length > 1) {
    return (
      <aside className="editor-properties">
        <div className="properties-content">
          <MultiSelectionProperties
            count={selectedIds.length}
            onAlign={onAlign}
            onDistribute={onDistribute}
            onGroup={onGroup}
            onUngroup={onUngroup}
          />
          {layers}
        </div>
      </aside>
    );
  }

  return (
    <aside className="editor-properties">
      {element ? (
        <div className="properties-content">
          <div className="properties-reorder">
            <button type="button" className="icon-btn" onClick={() => onReorder(1)} title={t("properties.advance")}>
              <ArrowUp size={14} />
            </button>
            <button type="button" className="icon-btn" onClick={() => onReorder(-1)} title={t("properties.sendBack")}>
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onDeleteLayer(element.id)}
              title={t("timeline.delete")}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {element.type === "text" && <TextProperties element={element} onUpdate={onUpdate} />}
          {(element.type === "image" || element.type === "video") && (
            <MediaProperties
              element={element}
              onUpdate={onUpdate}
              activeDuration={element.duration ?? activeCompositionDuration - element.start_time}
            />
          )}
          {element.type === "shape" && <ShapeProperties element={element} onUpdate={onUpdate} />}
          {layers}
        </div>
      ) : (
        <div className="properties-content">
          <div className="properties-empty">
            <MousePointer2 size={22} color="var(--text-faint)" />
            <p className="properties-empty-title">{t("properties.empty")}</p>
            <p className="properties-empty-hint">{t("properties.emptyHint")}</p>
          </div>
          {layers}
        </div>
      )}
    </aside>
  );
}
