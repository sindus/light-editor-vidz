import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ArrowRight } from "lucide-react";
import type { ExportOptions } from "../../lib/commands";
import "../NewProjectModal.css";

interface Props {
  projectWidth: number;
  projectHeight: number;
  projectFps: number;
  onExport: (options: ExportOptions) => void;
  onClose: () => void;
  exporting: boolean;
}

type ResolutionChoice = "original" | 1080 | 720 | 480;
type QualityChoice = "high" | "medium" | "low";

const QUALITY_CRF: Record<QualityChoice, number> = { high: 18, medium: 23, low: 28 };

export default function ExportModal({ projectWidth, projectHeight, projectFps, onExport, onClose, exporting }: Props) {
  const { t } = useTranslation();
  const [resolution, setResolution] = useState<ResolutionChoice>("original");
  const [fps, setFps] = useState<number | "original">("original");
  const [quality, setQuality] = useState<QualityChoice>("medium");

  const RESOLUTION_OPTIONS: { value: ResolutionChoice; label: string }[] = [
    { value: "original", label: t("exportModal.resolutionOriginal") },
    { value: 1080, label: "1080p" },
    { value: 720, label: "720p" },
    { value: 480, label: "480p" },
  ];
  const FPS_OPTIONS: { value: number | "original"; label: string }[] = [
    { value: "original", label: t("exportModal.fpsOriginal") },
    { value: 24, label: "24" },
    { value: 30, label: "30" },
    { value: 60, label: "60" },
  ];
  const QUALITY_OPTIONS: { value: QualityChoice; label: string }[] = [
    { value: "high", label: t("exportModal.qualityHigh") },
    { value: "medium", label: t("exportModal.qualityMedium") },
    { value: "low", label: t("exportModal.qualityLow") },
  ];

  function computeDimensions(): { width: number | null; height: number | null } {
    if (resolution === "original") return { width: null, height: null };
    const targetHeight = Math.min(resolution, projectHeight);
    const width = Math.round(((projectWidth / projectHeight) * targetHeight) / 2) * 2;
    const height = Math.round(targetHeight / 2) * 2;
    return { width, height };
  }

  function handleExport() {
    const { width, height } = computeDimensions();
    onExport({
      width,
      height,
      fps: fps === "original" ? null : fps,
      crf: QUALITY_CRF[quality],
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{t("exportModal.title")}</h2>
            <p className="modal-subtitle">
              {t("exportModal.subtitle", { width: projectWidth, height: projectHeight, fps: projectFps })}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} disabled={exporting}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field-group">
            <span className="field-label">{t("exportModal.resolution")}</span>
            <div className="fps-row">
              {RESOLUTION_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={String(opt.value)}
                  className={`fps-option${resolution === opt.value ? " selected" : ""}`}
                  onClick={() => setResolution(opt.value)}
                >
                  <span className="fps-value mono">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">{t("exportModal.fps")}</span>
            <div className="fps-row">
              {FPS_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={String(opt.value)}
                  className={`fps-option${fps === opt.value ? " selected" : ""}`}
                  onClick={() => setFps(opt.value)}
                >
                  <span className="fps-value mono">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">{t("exportModal.quality")}</span>
            <div className="fps-row">
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  className={`fps-option${quality === opt.value ? " selected" : ""}`}
                  onClick={() => setQuality(opt.value)}
                >
                  <span className="fps-value mono">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={exporting}>
            {t("modal.cancel")}
          </button>
          <button type="button" className="btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? t("topbar.exporting") : t("exportModal.confirm")}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
