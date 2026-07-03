import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { Play, Download, Upload } from "lucide-react";
import type { Project } from "../../bindings/Project";
import { exportProject, type ExportOptions } from "../../lib/commands";
import AppMenu from "./AppMenu";
import UpdateStatus from "./UpdateStatus";
import ExportModal from "./ExportModal";

interface Props {
  project: Project;
  projectDir: string;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  onOpenProject: () => void;
  onImportLegacy: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  hasSelection: boolean;
}

export default function TopBar({
  project,
  projectDir,
  onBack,
  onSave,
  saving,
  onOpenProject,
  onImportLegacy,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDeleteSelected,
  onDuplicateSelected,
  hasSelection,
}: Props) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  useEffect(() => {
    const unlisten = listen<number>("export-progress", (e) => setExportProgress(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  async function handleExport(options: ExportOptions) {
    setExportError(null);
    const defaultName = `${project.name.trim() || "video"}.mp4`;
    const outputPath = await save({
      defaultPath: defaultName,
      filters: [{ name: "MP4 video", extensions: ["mp4"] }],
    });
    if (!outputPath) return;

    setExporting(true);
    setExportProgress(0);
    try {
      await exportProject(projectDir, project, outputPath, options);
      setShowExportModal(false);
    } catch (e) {
      setExportError(String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <header className="editor-topbar">
      <div className="editor-topbar-left">
        <button type="button" className="editor-brand" onClick={onBack}>
          <span className="editor-brand-logo">
            <Play size={13} fill="#fff" color="#fff" />
          </span>
          <span className="editor-brand-word">
            LightEditor<span className="accent-text">Vidz</span>
          </span>
        </button>
        <span className="editor-topbar-sep" />
        <nav className="editor-menus">
          <AppMenu
            label={t("topbar.menuFile")}
            items={[
              { label: t("topbar.newProject"), onClick: onBack },
              { label: t("topbar.openProject"), onClick: onOpenProject },
              { label: t("topbar.importLegacy"), onClick: onImportLegacy },
              "separator",
              { label: t("topbar.save"), onClick: onSave, shortcut: "Ctrl+S" },
              { label: t("topbar.exportEllipsis"), onClick: () => setShowExportModal(true) },
            ]}
          />
          <AppMenu
            label={t("topbar.menuEdit")}
            items={[
              { label: t("topbar.undo"), onClick: onUndo, disabled: !canUndo, shortcut: "Ctrl+Z" },
              { label: t("topbar.redo"), onClick: onRedo, disabled: !canRedo, shortcut: "Ctrl+Shift+Z" },
              "separator",
              { label: t("topbar.delete"), onClick: onDeleteSelected, disabled: !hasSelection, shortcut: "Del" },
              {
                label: t("topbar.duplicate"),
                onClick: onDuplicateSelected,
                disabled: !hasSelection,
                shortcut: "Ctrl+D",
              },
            ]}
          />
          <AppMenu label={t("topbar.menuHelp")}>
            <div className="app-menu-about">
              <div className="app-menu-about-name">LightEditorVidz</div>
              <div className="app-menu-about-version mono">{t("topbar.aboutVersion", { version })}</div>
              <LanguageSwitcher />
              <UpdateStatus />
            </div>
          </AppMenu>
        </nav>
      </div>

      <div className="editor-topbar-center">
        <span className="editor-project-name">{project.name}</span>
        <span className="editor-project-badge mono">
          {project.width} × {project.height} · {project.fps}fps
        </span>
        {exportError && (
          <span className="editor-export-error" title={exportError}>
            {t("topbar.exportFailed")}
          </span>
        )}
      </div>

      <div className="editor-topbar-right">
        <button type="button" className="btn-topbar-secondary" onClick={onSave} disabled={saving}>
          <Download size={14} />
          {saving ? t("topbar.saving") : t("topbar.save")}
        </button>
        <button
          type="button"
          className="btn-topbar-primary"
          onClick={() => setShowExportModal(true)}
          disabled={exporting}
        >
          <Upload size={14} />
          {exporting ? `${t("topbar.exporting")} ${Math.round(exportProgress * 100)}%` : t("topbar.export")}
        </button>
      </div>
      {exporting && (
        <div className="export-progress-bar">
          <div className="export-progress-fill" style={{ width: `${exportProgress * 100}%` }} />
        </div>
      )}
      {showExportModal && (
        <ExportModal
          projectWidth={project.width}
          projectHeight={project.height}
          projectFps={project.fps}
          onExport={handleExport}
          onClose={() => setShowExportModal(false)}
          exporting={exporting}
        />
      )}
    </header>
  );
}

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <div className="app-menu-lang">
      {["en", "fr"].map((lng) => (
        <button
          type="button"
          key={lng}
          className={`app-menu-lang-btn${i18n.resolvedLanguage === lng ? " active" : ""}`}
          onClick={() => i18n.changeLanguage(lng)}
        >
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
