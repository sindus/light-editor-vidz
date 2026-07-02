//! Résolution du binaire ffmpeg à utiliser (extraction de frames vidéo à l'export, et
//! encodage/mixage côté `src-tauri`). Par défaut, `ffmpeg` est cherché dans le `PATH`
//! système. En build packagé (sidecar Tauri bundlé), l'application définit la variable
//! d'environnement `LIGHT_EDITOR_VIDZ_FFMPEG` au démarrage avec le chemin absolu résolu
//! du binaire embarqué — ce module reste donc indépendant de Tauri (réutilisable par un
//! futur pont wasm) tout en permettant au binaire packagé de ne pas dépendre du PATH.

/// Nom ou chemin du binaire ffmpeg à invoquer.
pub fn ffmpeg_binary() -> String {
    std::env::var("LIGHT_EDITOR_VIDZ_FFMPEG").unwrap_or_else(|_| "ffmpeg".to_string())
}
