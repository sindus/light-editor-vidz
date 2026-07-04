import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { Play, Plus, FolderOpen } from "lucide-react";
import { listRecentProjects, type RecentProject } from "../lib/commands";
import NewProjectModal from "./NewProjectModal";
import "./Home.css";

interface Props {
  onOpenProject: (projectDir: string) => void;
}

function aspectRatioLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height) || 1;
  return `${width / d}:${height / d}`;
}

export default function Home({ onOpenProject }: Props) {
  const { t } = useTranslation();
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRecentProjects()
      .then(setRecents)
      .catch((e) => setError(String(e)));
  }, []);

  async function handleOpen() {
    setError(null);
    const dir = await open({ directory: true, multiple: false });
    if (!dir || Array.isArray(dir)) return;
    onOpenProject(dir);
  }

  return (
    <div className="home">
      <main className="home-content">
        <div className="home-brand">
          <div className="home-logo">
            <Play size={22} fill="#fff" color="#fff" />
          </div>
          <div>
            <div className="home-wordmark">
              LightEditor<span className="accent-text">Vidz</span>
            </div>
            <div className="home-kicker mono">{t("home.kicker")}</div>
          </div>
        </div>

        <p className="home-tagline">{t("home.tagline")}</p>

        <div className="home-actions">
          <button type="button" className="btn-primary" onClick={() => setShowNewProject(true)}>
            <Plus size={17} />
            {t("home.newProject")}
          </button>
          <button type="button" className="btn-secondary" onClick={handleOpen}>
            <FolderOpen size={16} />
            {t("home.openProject")}
          </button>
        </div>

        {error && <p className="home-error">{error}</p>}

        {recents.length > 0 && (
          <section className="home-recents">
            <div className="home-recents-header">
              <h2>{t("home.recentProjects")}</h2>
              <span className="mono home-recents-count">{t("home.projectsCount", { count: recents.length })}</span>
            </div>
            <div className="home-recents-grid">
              {recents.map((p) => (
                <button type="button" key={p.path} className="recent-card" onClick={() => onOpenProject(p.path)}>
                  <div className="recent-thumb">
                    <span className="mono">{aspectRatioLabel(p.width, p.height)}</span>
                  </div>
                  <div className="recent-title">{p.name}</div>
                  <div className="recent-meta mono">
                    {p.width}×{p.height}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={(projectDir) => {
            setShowNewProject(false);
            onOpenProject(projectDir);
          }}
        />
      )}
    </div>
  );
}
