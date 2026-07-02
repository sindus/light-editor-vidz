import { useState } from "react";
import { useTranslation } from "react-i18next";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type Status = "idle" | "checking" | "up-to-date" | "downloading" | "error";

/** Vérifie les mises à jour (tauri-plugin-updater, releases signées) et les installe
 * automatiquement avant de relancer l'app. */
export default function UpdateStatus() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  async function handleCheck() {
    setStatus("checking");
    setMessage(null);
    try {
      const update = await check();
      if (!update) {
        setStatus("up-to-date");
        setMessage(t("update.upToDate"));
        return;
      }

      setStatus("downloading");
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setProgress(total > 0 ? downloaded / total : 0);
        }
      });

      await relaunch();
    } catch (e) {
      setStatus("error");
      setMessage(String(e));
    }
  }

  return (
    <div className="app-menu-update">
      <button
        type="button"
        className="app-menu-action"
        onClick={handleCheck}
        disabled={status === "checking" || status === "downloading"}
      >
        {status === "checking" && t("update.checking")}
        {status === "downloading" && t("update.updating", { percent: Math.round(progress * 100) })}
        {(status === "idle" || status === "up-to-date" || status === "error") && t("update.checkForUpdates")}
      </button>
      {message && <p className="app-menu-update-msg">{message}</p>}
    </div>
  );
}
