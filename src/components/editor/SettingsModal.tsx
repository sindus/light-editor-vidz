import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { X, ExternalLink, KeyRound } from "lucide-react";
import { loadApiKeys, saveApiKeys, type ApiKeys } from "../../lib/settings";
import "../NewProjectModal.css";

interface ProviderInfo {
  id: keyof ApiKeys;
  name: string;
  /** Types de médias couverts + licence, affiché sous le nom. */
  descKey: string;
  /** Étapes pour obtenir une clé API. */
  helpKey: string;
  url: string;
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: "pexels",
    name: "Pexels",
    descKey: "settings.pexelsDesc",
    helpKey: "settings.pexelsHelp",
    url: "https://www.pexels.com/api/",
  },
  {
    id: "pixabay",
    name: "Pixabay",
    descKey: "settings.pixabayDesc",
    helpKey: "settings.pixabayHelp",
    url: "https://pixabay.com/api/docs/",
  },
  {
    id: "freesound",
    name: "Freesound",
    descKey: "settings.freesoundDesc",
    helpKey: "settings.freesoundHelp",
    url: "https://freesound.org/apiv2/apply/",
  },
];

/** Réglages de l'app — pour l'instant : clés API des moteurs d'assets libres de droit. */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKeys>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApiKeys()
      .then((k) => {
        setKeys(k);
        setLoaded(true);
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveApiKeys(keys);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{t("settings.title")}</h2>
            <p className="modal-subtitle">{t("settings.apiKeysIntro")}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body settings-body">
          {error && <p className="home-error">{error}</p>}
          {PROVIDERS.map((provider) => (
            <div className="field-group" key={provider.id}>
              <div className="settings-provider-header">
                <span className="field-label">
                  <KeyRound size={12} /> {provider.name}
                </span>
                <button type="button" className="settings-provider-link" onClick={() => openUrl(provider.url)}>
                  <ExternalLink size={11} />
                  {t("settings.openProviderPage")}
                </button>
              </div>
              <p className="settings-provider-desc">{t(provider.descKey)}</p>
              <input
                className="settings-key-input mono"
                type="text"
                placeholder={t("settings.keyPlaceholder")}
                value={keys[provider.id] ?? ""}
                disabled={!loaded}
                onChange={(e) => setKeys((k) => ({ ...k, [provider.id]: e.target.value }))}
                spellCheck={false}
              />
              <details className="settings-help">
                <summary>{t("settings.howToGetKey")}</summary>
                <p>{t(provider.helpKey)}</p>
              </details>
            </div>
          ))}
          <p className="settings-openverse-note">{t("settings.openverseNote")}</p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("modal.cancel")}
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || !loaded}>
            {t("settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
