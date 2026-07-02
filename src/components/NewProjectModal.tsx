import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { X, ArrowRight } from "lucide-react";
import { newProject } from "../lib/commands";
import "./NewProjectModal.css";

const RESOLUTIONS = [
  { label: "16:9", dims: "1920×1080", width: 1920, height: 1080, ratio: "16/9" },
  { label: "9:16", dims: "1080×1920", width: 1080, height: 1920, ratio: "9/16" },
  { label: "1:1", dims: "1080×1080", width: 1080, height: 1080, ratio: "1/1" },
  { label: "UHD", dims: "3840×2160", width: 3840, height: 2160, ratio: "16/9" },
];

interface Props {
  onCreated: (projectDir: string) => void;
  onClose: () => void;
}

export default function NewProjectModal({ onCreated, onClose }: Props) {
  const { t } = useTranslation();
  const FPS_OPTIONS = [
    { value: 24, label: t("modal.fpsCinema") },
    { value: 30, label: t("modal.fpsStandard") },
    { value: 60, label: t("modal.fpsSmooth") },
  ];
  const [name, setName] = useState("Ma vidéo");
  const [resIndex, setResIndex] = useState(0);
  const [fps, setFps] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setError(null);
    const parentDir = await open({ directory: true, multiple: false });
    if (!parentDir || Array.isArray(parentDir)) return;

    setCreating(true);
    try {
      const { width, height } = RESOLUTIONS[resIndex];
      const projectDir = await newProject({
        parent_dir: parentDir,
        name,
        width,
        height,
        fps,
      });
      onCreated(projectDir);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{t("modal.title")}</h2>
            <p className="modal-subtitle">{t("modal.subtitle")}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} disabled={creating}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field-group">
            <label className="field-label" htmlFor="project-name">
              {t("modal.nameLabel")}
            </label>
            <input id="project-name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field-group">
            <span className="field-label">{t("modal.resolutionLabel")}</span>
            <div className="resolution-grid">
              {RESOLUTIONS.map((r, i) => (
                <button
                  type="button"
                  key={r.label}
                  className={`resolution-option${i === resIndex ? " selected" : ""}`}
                  onClick={() => setResIndex(i)}
                >
                  <span className="resolution-preview" style={{ aspectRatio: r.ratio as string }} />
                  <span className="resolution-label">{r.label}</span>
                  <span className="resolution-dims mono">{r.dims}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">{t("modal.fpsLabel")}</span>
            <div className="fps-row">
              {FPS_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  className={`fps-option${fps === opt.value ? " selected" : ""}`}
                  onClick={() => setFps(opt.value)}
                >
                  <span className="fps-value mono">{opt.value}</span>
                  <span className="fps-sublabel">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={creating}>
            {t("modal.cancel")}
          </button>
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? t("modal.creating") : t("modal.create")}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
