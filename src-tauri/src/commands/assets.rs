use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Lit un média (vidéo/image/audio) et le renvoie en octets bruts plutôt que via le protocole
/// `asset://`. Contournement pour la vidéo : WebKitGTK (webview Tauri sur Linux) rejette parfois
/// un `<video src="asset://...">` avec `MEDIA_ERR_SRC_NOT_SUPPORTED` alors que le fichier est
/// parfaitement lisible (GStreamer le décode sans problème en dehors de la webview) — un schéma
/// d'URL personnalisé n'est pas toujours accepté comme source par l'élément `<video>`, contrairement
/// à `<img>`. Charger les octets et construire une URL `blob:` côté frontend contourne le problème.
// `async` : lire un fichier vidéo de plusieurs centaines de Mo ne doit pas bloquer le thread
// principal (les commandes synchrones Tauri v2 y sont exécutées par défaut).
#[tauri::command(async)]
pub fn read_media_file(
    project_dir: String,
    relative_src: String,
) -> Result<tauri::ipc::Response, String> {
    let path = scene_core::paths::resolve_media_path(Path::new(&project_dir), &relative_src)?;
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read media file: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Sous-dossier de `assets/` dans lequel stocker ce type de média.
pub(crate) fn kind_subdir(kind: &str) -> Result<&'static str, String> {
    match kind {
        "image" => Ok("images"),
        "video" => Ok("videos"),
        "audio" => Ok("audio"),
        _ => Err(format!("Unknown media type: {kind}")),
    }
}

/// Évite d'écraser un fichier existant en suffixant `-2`, `-3`, ... avant l'extension.
pub(crate) fn unique_destination(dir: &Path, filename: &str) -> PathBuf {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_subdir_maps_known_kinds() {
        assert_eq!(kind_subdir("image"), Ok("images"));
        assert_eq!(kind_subdir("video"), Ok("videos"));
        assert_eq!(kind_subdir("audio"), Ok("audio"));
    }

    #[test]
    fn kind_subdir_rejects_an_unknown_kind() {
        assert!(kind_subdir("subtitle").is_err());
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "letest-assets-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn unique_destination_returns_the_plain_name_when_free() {
        let dir = temp_dir("free");
        assert_eq!(unique_destination(&dir, "logo.png"), dir.join("logo.png"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unique_destination_suffixes_on_collision_and_preserves_the_extension() {
        let dir = temp_dir("collision");
        fs::write(dir.join("logo.png"), b"a").unwrap();
        assert_eq!(unique_destination(&dir, "logo.png"), dir.join("logo-2.png"));

        fs::write(dir.join("logo-2.png"), b"b").unwrap();
        assert_eq!(unique_destination(&dir, "logo.png"), dir.join("logo-3.png"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unique_destination_handles_a_filename_without_extension() {
        let dir = temp_dir("noext");
        fs::write(dir.join("README"), b"a").unwrap();
        assert_eq!(unique_destination(&dir, "README"), dir.join("README-2"));
        let _ = fs::remove_dir_all(&dir);
    }
}
