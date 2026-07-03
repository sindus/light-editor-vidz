//! Résolution sûre des chemins de médias référencés par un projet (`src` d'un élément
//! image/vidéo, d'une piste audio).

use std::path::{Path, PathBuf};

/// Résout un chemin de média relatif au dossier projet en garantissant qu'il ne peut pas en
/// sortir (`../` répétés, chemin absolu, lien symbolique pointant ailleurs). Un `project.json`
/// corrompu ou modifié à la main (import legacy, édition manuelle du fichier) ne doit pas
/// permettre de lire un fichier arbitraire du système lors de la preview ou de l'export.
pub fn resolve_media_path(project_dir: &Path, relative_src: &str) -> Result<PathBuf, String> {
    let canonical_dir = project_dir
        .canonicalize()
        .map_err(|e| format!("invalid project directory {}: {e}", project_dir.display()))?;
    let joined = project_dir.join(relative_src);
    let canonical_file = joined
        .canonicalize()
        .map_err(|e| format!("media file not found: {}: {e}", joined.display()))?;
    if !canonical_file.starts_with(&canonical_dir) {
        return Err(format!(
            "refusing to access media outside the project directory: {relative_src}"
        ));
    }
    Ok(canonical_file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_a_media_file_inside_the_project_directory() {
        let dir = std::env::temp_dir().join(format!(
            "letest-paths-ok-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(dir.join("assets")).unwrap();
        std::fs::write(dir.join("assets/photo.png"), b"fake").unwrap();

        let result = resolve_media_path(&dir, "assets/photo.png");
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with(dir.canonicalize().unwrap()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_a_relative_src_that_escapes_the_project_directory() {
        let dir = std::env::temp_dir().join(format!(
            "letest-paths-escape-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        // Fichier accessible mais HORS du dossier projet : simule un `src` malveillant/corrompu
        // du type "../../../../etc/passwd" pointant vers un fichier réel du système.
        let outside_dir = std::env::temp_dir().join(format!(
            "letest-paths-outside-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&outside_dir).unwrap();
        std::fs::write(outside_dir.join("secret.txt"), b"nope").unwrap();

        let traversal = format!(
            "../{}/secret.txt",
            outside_dir.file_name().unwrap().to_str().unwrap()
        );
        let result = resolve_media_path(&dir, &traversal);
        assert!(result.is_err());

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[test]
    fn refuses_a_missing_media_file() {
        let dir = std::env::temp_dir().join(format!(
            "letest-paths-missing-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(resolve_media_path(&dir, "does-not-exist.png").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
