use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Sous-dossier de `assets/` dans lequel stocker ce type de média.
fn kind_subdir(kind: &str) -> Result<&'static str, String> {
    match kind {
        "image" => Ok("images"),
        "video" => Ok("videos"),
        "audio" => Ok("audio"),
        _ => Err(format!("Unknown media type: {kind}")),
    }
}

/// Évite d'écraser un fichier existant en suffixant `-2`, `-3`, ... avant l'extension.
fn unique_destination(dir: &Path, filename: &str) -> PathBuf {
    let mut dest = dir.join(filename);
    if !dest.exists() {
        return dest;
    }
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    let ext = Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let mut i = 2;
    loop {
        let candidate = if ext.is_empty() {
            format!("{stem}-{i}")
        } else {
            format!("{stem}-{i}.{ext}")
        };
        dest = dir.join(candidate);
        if !dest.exists() {
            return dest;
        }
        i += 1;
    }
}

/// Copie un fichier choisi par l'utilisateur dans `<project_dir>/assets/<kind>s/`.
/// Retourne le chemin relatif au dossier projet (ex: `assets/images/logo.png`).
#[tauri::command]
pub fn import_asset(
    project_dir: String,
    kind: String,
    source_path: String,
) -> Result<String, String> {
    let subdir = kind_subdir(&kind)?;
    let target_dir = Path::new(&project_dir).join("assets").join(subdir);
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create assets directory: {e}"))?;

    let source = Path::new(&source_path);
    let filename = source
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| "Invalid source filename".to_string())?;

    let dest = unique_destination(&target_dir, filename);
    fs::copy(source, &dest).map_err(|e| format!("Failed to copy file: {e}"))?;

    let dest_filename = dest
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| "Invalid destination filename".to_string())?;
    Ok(format!("assets/{subdir}/{dest_filename}"))
}

#[derive(Debug, Serialize)]
pub struct AssetInfo {
    pub filename: String,
    pub relative_path: String,
}

/// Liste les médias déjà importés dans `<project_dir>/assets/<kind>s/`.
#[tauri::command]
pub fn list_assets(project_dir: String, kind: String) -> Result<Vec<AssetInfo>, String> {
    let subdir = kind_subdir(&kind)?;
    let dir = Path::new(&project_dir).join("assets").join(subdir);
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };

    let mut assets = Vec::new();
    for entry in entries.flatten() {
        if entry.path().is_file() {
            if let Some(filename) = entry.file_name().to_str() {
                assets.push(AssetInfo {
                    filename: filename.to_string(),
                    relative_path: format!("assets/{subdir}/{filename}"),
                });
            }
        }
    }
    assets.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(assets)
}
