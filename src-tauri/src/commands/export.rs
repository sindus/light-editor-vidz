use crate::export::{export_video, ExportOverrides};
use scene_core::model::Project;
use serde::Deserialize;
use std::path::Path;
use tauri::Emitter;

/// Surcharges d'export optionnelles envoyées par le frontend (résolution/fps/qualité) —
/// n'affectent que le fichier exporté, jamais les réglages enregistrés dans le projet.
#[derive(Debug, Deserialize)]
pub struct ExportOptions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<u32>,
    pub crf: Option<u32>,
}

/// Exporte le projet en mp4 (bloquant). `output_path` vient d'un dialogue "Enregistrer sous"
/// côté frontend. Émet `export-progress` (fraction 0.0..1.0) après chaque frame rendue.
/// `async` : l'export dure plusieurs minutes — sur le thread principal (défaut des commandes
/// synchrones Tauri v2), il gèlerait toute l'UI, y compris la barre de progression.
#[tauri::command(async)]
pub fn export_project(
    app: tauri::AppHandle,
    project_dir: String,
    project: Project,
    output_path: String,
    options: Option<ExportOptions>,
) -> Result<(), String> {
    let overrides = options
        .map(|o| ExportOverrides {
            width: o.width,
            height: o.height,
            fps: o.fps,
            crf: o.crf,
        })
        .unwrap_or_default();
    export_video(
        &project,
        Path::new(&project_dir),
        Path::new(&output_path),
        overrides,
        |fraction| {
            let _ = app.emit("export-progress", fraction);
        },
    )
}
