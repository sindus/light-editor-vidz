use crate::export::export_video;
use scene_core::model::Project;
use std::path::Path;
use tauri::Emitter;

/// Exporte le projet en mp4 (bloquant). `output_path` vient d'un dialogue "Enregistrer sous"
/// côté frontend. Émet `export-progress` (fraction 0.0..1.0) après chaque frame rendue.
#[tauri::command]
pub fn export_project(
    app: tauri::AppHandle,
    project_dir: String,
    project: Project,
    output_path: String,
) -> Result<(), String> {
    export_video(
        &project,
        Path::new(&project_dir),
        Path::new(&output_path),
        |fraction| {
            let _ = app.emit("export-progress", fraction);
        },
    )
}
