import { useTranslation } from "react-i18next";
import {
  MousePointer2,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
} from "lucide-react";
import type { AlignEdge } from "../../../lib/elements";
import { Header } from "./Header";

export function MultiSelectionProperties({
  count,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
}: {
  count: number;
  onAlign: (edge: AlignEdge) => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onGroup: () => void;
  onUngroup: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Header
        color="var(--accent)"
        icon={<MousePointer2 size={13} />}
        title={t("properties.multiSelection", { count })}
        subtitle={t("properties.multiSelectionHint")}
      />
      <div className="properties-section">
        <span className="properties-label">{t("properties.align")}</span>
        <div className="properties-row">
          <button type="button" className="icon-btn" onClick={() => onAlign("left")} title={t("properties.alignLeft")}>
            <AlignStartVertical size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onAlign("center-h")}
            title={t("properties.alignCenterH")}
          >
            <AlignCenterVertical size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onAlign("right")}
            title={t("properties.alignRight")}
          >
            <AlignEndVertical size={15} />
          </button>
        </div>
        <div className="properties-row">
          <button type="button" className="icon-btn" onClick={() => onAlign("top")} title={t("properties.alignTop")}>
            <AlignStartHorizontal size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onAlign("center-v")}
            title={t("properties.alignCenterV")}
          >
            <AlignCenterHorizontal size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onAlign("bottom")}
            title={t("properties.alignBottom")}
          >
            <AlignEndHorizontal size={15} />
          </button>
        </div>
      </div>
      <div className="properties-section">
        <span className="properties-label">{t("properties.distribute")}</span>
        <div className="properties-row">
          <button
            type="button"
            className="icon-btn"
            disabled={count < 3}
            onClick={() => onDistribute("horizontal")}
            title={t("properties.distributeH")}
          >
            <AlignHorizontalSpaceAround size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={count < 3}
            onClick={() => onDistribute("vertical")}
            title={t("properties.distributeV")}
          >
            <AlignVerticalSpaceAround size={15} />
          </button>
        </div>
      </div>
      <div className="properties-section">
        <span className="properties-label">{t("properties.group")}</span>
        <div className="properties-row">
          <button type="button" className="timeline-action" onClick={onGroup}>
            {t("properties.groupAction")}
          </button>
          <button type="button" className="timeline-action" onClick={onUngroup}>
            {t("properties.ungroupAction")}
          </button>
        </div>
      </div>
    </>
  );
}
