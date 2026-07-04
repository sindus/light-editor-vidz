//! Recherche et import d'assets libres de droit depuis plusieurs moteurs (Pexels, Pixabay,
//! Freesound, Openverse). La recherche est lancée en parallèle sur tous les moteurs configurés
//! (clé API présente dans le store `settings.json` — Openverse n'en demande pas) et les
//! résultats sont fusionnés ; l'échec d'un moteur (clé invalide, réseau) est remonté comme
//! avertissement sans faire échouer les autres. Les requêtes passent par Rust (reqwest) :
//! pas de CORS côté webview, et la clé ne transite jamais par le frontend au moment de chercher.

use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use tauri_plugin_store::StoreExt;

const SETTINGS_STORE: &str = "settings.json";
const API_KEYS_KEY: &str = "apiKeys";
const RESULTS_PER_PROVIDER: usize = 12;
const HTTP_TIMEOUT_SECS: u64 = 15;
/// Garde-fou sur la taille d'un fichier téléchargé (les vidéos 4K peuvent être lourdes,
/// mais au-delà c'est probablement une erreur).
const MAX_DOWNLOAD_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct StockResult {
    /// "pexels" | "pixabay" | "freesound" | "openverse"
    pub provider: String,
    pub kind: String,
    pub thumbnail_url: Option<String>,
    pub download_url: String,
    /// Page source (attribution / vérification de licence).
    pub page_url: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub duration: Option<f64>,
    /// Nom de fichier suggéré pour l'import (extension incluse).
    pub filename: String,
}

#[derive(Debug, Serialize)]
pub struct StockSearchResponse {
    pub results: Vec<StockResult>,
    /// Erreurs par moteur, non bloquantes (ex: "pexels: clé API invalide").
    pub errors: Vec<String>,
    /// Moteurs effectivement interrogés — vide = aucun moteur configuré pour ce type de média,
    /// l'UI invite alors à renseigner une clé API.
    pub providers: Vec<String>,
}

fn api_key(app: &tauri::AppHandle, provider: &str) -> Option<String> {
    let store = app.store(SETTINGS_STORE).ok()?;
    let keys = store.get(API_KEYS_KEY)?;
    keys.get(provider)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent("light-editor-vidz/0.1 (desktop video editor)")
        .build()
        .map_err(|e| format!("HTTP client init failed: {e}"))
}

async fn get_json(
    client: &reqwest::Client,
    url: &str,
    headers: &[(&str, &str)],
) -> Result<Value, String> {
    let mut req = client.get(url);
    for (name, value) in headers {
        req = req.header(*name, *value);
    }
    let resp = req.send().await.map_err(|e| format!("network: {e}"))?;
    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err("invalid or missing API key".to_string());
    }
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    resp.json().await.map_err(|e| format!("bad JSON: {e}"))
}

fn str_of(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|v| v.as_str()).map(str::to_string)
}

/// Nom de fichier sûr : alphanumérique/tiret/point uniquement, jamais de séparateur de chemin.
fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches(['-', '.']).to_string();
    if trimmed.is_empty() {
        "asset".to_string()
    } else {
        trimmed
    }
}

// ---------------------------------------------------------------------------
// Parsing par moteur (fonctions pures sur le JSON de réponse, testées hors-ligne)
// ---------------------------------------------------------------------------

fn parse_pexels_images(body: &Value) -> Vec<StockResult> {
    let Some(photos) = body.get("photos").and_then(|p| p.as_array()) else {
        return vec![];
    };
    photos
        .iter()
        .filter_map(|p| {
            let src = p.get("src")?;
            Some(StockResult {
                provider: "pexels".into(),
                kind: "image".into(),
                thumbnail_url: str_of(src, "medium"),
                download_url: str_of(src, "large2x").or_else(|| str_of(src, "original"))?,
                page_url: str_of(p, "url"),
                author: str_of(p, "photographer"),
                license: Some("Pexels License".into()),
                duration: None,
                filename: format!("pexels-{}.jpg", p.get("id").and_then(|i| i.as_i64())?),
            })
        })
        .collect()
}

fn parse_pexels_videos(body: &Value) -> Vec<StockResult> {
    let Some(videos) = body.get("videos").and_then(|v| v.as_array()) else {
        return vec![];
    };
    videos
        .iter()
        .filter_map(|v| {
            let files = v.get("video_files")?.as_array()?;
            // Privilégie un fichier HD raisonnable (≤1920 de large), sinon le premier lien.
            let best = files
                .iter()
                .filter(|f| {
                    f.get("width")
                        .and_then(|w| w.as_i64())
                        .is_some_and(|w| w <= 1920)
                })
                .max_by_key(|f| f.get("width").and_then(|w| w.as_i64()).unwrap_or(0))
                .or_else(|| files.first())?;
            Some(StockResult {
                provider: "pexels".into(),
                kind: "video".into(),
                thumbnail_url: str_of(v, "image"),
                download_url: str_of(best, "link")?,
                page_url: str_of(v, "url"),
                author: v
                    .get("user")
                    .and_then(|u| u.get("name"))
                    .and_then(|n| n.as_str())
                    .map(str::to_string),
                license: Some("Pexels License".into()),
                duration: v.get("duration").and_then(|d| d.as_f64()),
                filename: format!("pexels-video-{}.mp4", v.get("id").and_then(|i| i.as_i64())?),
            })
        })
        .collect()
}

fn parse_pixabay_images(body: &Value) -> Vec<StockResult> {
    let Some(hits) = body.get("hits").and_then(|h| h.as_array()) else {
        return vec![];
    };
    hits.iter()
        .filter_map(|h| {
            Some(StockResult {
                provider: "pixabay".into(),
                kind: "image".into(),
                thumbnail_url: str_of(h, "previewURL").or_else(|| str_of(h, "webformatURL")),
                download_url: str_of(h, "largeImageURL").or_else(|| str_of(h, "webformatURL"))?,
                page_url: str_of(h, "pageURL"),
                author: str_of(h, "user"),
                license: Some("Pixabay License".into()),
                duration: None,
                filename: format!("pixabay-{}.jpg", h.get("id").and_then(|i| i.as_i64())?),
            })
        })
        .collect()
}

fn parse_pixabay_videos(body: &Value) -> Vec<StockResult> {
    let Some(hits) = body.get("hits").and_then(|h| h.as_array()) else {
        return vec![];
    };
    hits.iter()
        .filter_map(|h| {
            let sizes = h.get("videos")?;
            let best = ["medium", "small", "large", "tiny"]
                .iter()
                .find_map(|s| sizes.get(s).filter(|v| v.get("url").is_some()))?;
            Some(StockResult {
                provider: "pixabay".into(),
                kind: "video".into(),
                thumbnail_url: str_of(best, "thumbnail"),
                download_url: str_of(best, "url")?,
                page_url: str_of(h, "pageURL"),
                author: str_of(h, "user"),
                license: Some("Pixabay License".into()),
                duration: h.get("duration").and_then(|d| d.as_f64()),
                filename: format!(
                    "pixabay-video-{}.mp4",
                    h.get("id").and_then(|i| i.as_i64())?
                ),
            })
        })
        .collect()
}

fn parse_freesound(body: &Value) -> Vec<StockResult> {
    let Some(results) = body.get("results").and_then(|r| r.as_array()) else {
        return vec![];
    };
    results
        .iter()
        .filter_map(|r| {
            let id = r.get("id").and_then(|i| i.as_i64())?;
            let name = str_of(r, "name").unwrap_or_default();
            Some(StockResult {
                provider: "freesound".into(),
                kind: "audio".into(),
                thumbnail_url: None,
                // Preview HQ mp3 : accessible avec un simple token (le fichier original
                // demanderait OAuth2), largement suffisant pour une piste de montage.
                download_url: r
                    .get("previews")
                    .and_then(|p| p.get("preview-hq-mp3"))
                    .and_then(|u| u.as_str())
                    .map(str::to_string)?,
                page_url: Some(format!("https://freesound.org/s/{id}/")),
                author: str_of(r, "username"),
                license: str_of(r, "license"),
                duration: r.get("duration").and_then(|d| d.as_f64()),
                filename: format!("freesound-{id}-{}.mp3", sanitize_filename(&name)),
            })
        })
        .collect()
}

fn parse_openverse(body: &Value, kind: &str, default_ext: &str) -> Vec<StockResult> {
    let Some(results) = body.get("results").and_then(|r| r.as_array()) else {
        return vec![];
    };
    results
        .iter()
        .filter_map(|r| {
            let id = str_of(r, "id")?;
            let ext = str_of(r, "filetype").unwrap_or_else(|| default_ext.to_string());
            Some(StockResult {
                provider: "openverse".into(),
                kind: kind.into(),
                thumbnail_url: str_of(r, "thumbnail"),
                download_url: str_of(r, "url")?,
                page_url: str_of(r, "foreign_landing_url"),
                author: str_of(r, "creator"),
                license: str_of(r, "license").map(|l| format!("CC {}", l.to_uppercase())),
                duration: r
                    .get("duration")
                    .and_then(|d| d.as_f64())
                    // Openverse audio : durée en millisecondes.
                    .map(|d| if kind == "audio" { d / 1000.0 } else { d }),
                filename: format!("openverse-{}.{ext}", sanitize_filename(&id)),
            })
        })
        .collect()
}

/// Fusion round-robin des résultats par moteur : chaque moteur reste visible en tête de liste
/// au lieu que le premier écrase tous les autres.
fn interleave(per_provider: Vec<Vec<StockResult>>) -> Vec<StockResult> {
    let mut iters: Vec<_> = per_provider.into_iter().map(|v| v.into_iter()).collect();
    let mut out = Vec::new();
    loop {
        let mut exhausted = true;
        for it in &mut iters {
            if let Some(r) = it.next() {
                out.push(r);
                exhausted = false;
            }
        }
        if exhausted {
            return out;
        }
    }
}

// ---------------------------------------------------------------------------
// Requêtes par moteur
// ---------------------------------------------------------------------------

async fn search_pexels(
    client: &reqwest::Client,
    key: &str,
    kind: &str,
    query: &str,
) -> Result<Vec<StockResult>, String> {
    let url = match kind {
        "image" => format!(
            "https://api.pexels.com/v1/search?query={}&per_page={RESULTS_PER_PROVIDER}",
            urlencode(query)
        ),
        "video" => format!(
            "https://api.pexels.com/videos/search?query={}&per_page={RESULTS_PER_PROVIDER}",
            urlencode(query)
        ),
        _ => return Ok(vec![]),
    };
    let body = get_json(client, &url, &[("Authorization", key)]).await?;
    Ok(match kind {
        "image" => parse_pexels_images(&body),
        _ => parse_pexels_videos(&body),
    })
}

async fn search_pixabay(
    client: &reqwest::Client,
    key: &str,
    kind: &str,
    query: &str,
) -> Result<Vec<StockResult>, String> {
    let url = match kind {
        "image" => format!(
            "https://pixabay.com/api/?key={key}&q={}&image_type=photo&per_page={RESULTS_PER_PROVIDER}&safesearch=true",
            urlencode(query)
        ),
        "video" => format!(
            "https://pixabay.com/api/videos/?key={key}&q={}&per_page={RESULTS_PER_PROVIDER}&safesearch=true",
            urlencode(query)
        ),
        _ => return Ok(vec![]),
    };
    let body = get_json(client, &url, &[]).await?;
    Ok(match kind {
        "image" => parse_pixabay_images(&body),
        _ => parse_pixabay_videos(&body),
    })
}

async fn search_freesound(
    client: &reqwest::Client,
    key: &str,
    query: &str,
) -> Result<Vec<StockResult>, String> {
    // Filtre CC0 uniquement : utilisable sans attribution, cohérent avec les autres moteurs.
    let url = format!(
        "https://freesound.org/apiv2/search/text/?query={}&token={key}&page_size={RESULTS_PER_PROVIDER}&fields=id,name,username,license,duration,previews&filter=license:%22Creative%20Commons%200%22",
        urlencode(query)
    );
    let body = get_json(client, &url, &[]).await?;
    Ok(parse_freesound(&body))
}

async fn search_openverse(
    client: &reqwest::Client,
    kind: &str,
    query: &str,
) -> Result<Vec<StockResult>, String> {
    let (endpoint, default_ext) = match kind {
        "image" => ("images", "jpg"),
        "audio" => ("audio", "mp3"),
        // Openverse n'indexe pas de vidéos.
        _ => return Ok(vec![]),
    };
    let url = format!(
        "https://api.openverse.org/v1/{endpoint}/?q={}&license_type=commercial&page_size={RESULTS_PER_PROVIDER}",
        urlencode(query)
    );
    let body = get_json(client, &url, &[]).await?;
    Ok(parse_openverse(&body, kind, default_ext))
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            b' ' => "+".to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Recherche sur tous les moteurs configurés pour ce type de média, en parallèle.
#[tauri::command]
pub async fn search_stock_assets(
    app: tauri::AppHandle,
    kind: String,
    query: String,
) -> Result<StockSearchResponse, String> {
    if !matches!(kind.as_str(), "image" | "video" | "audio") {
        return Err(format!("Unknown media type: {kind}"));
    }
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(StockSearchResponse {
            results: vec![],
            errors: vec![],
            providers: vec![],
        });
    }
    let client = http_client()?;

    let pexels_key = api_key(&app, "pexels");
    let pixabay_key = api_key(&app, "pixabay");
    let freesound_key = api_key(&app, "freesound");

    // Chaque futur retourne (nom du moteur, résultat) ; tous sont lancés de front.
    type ProviderOutcome<'a> = (&'a str, Result<Vec<StockResult>, String>);
    let mut tasks: Vec<futures::future::BoxFuture<ProviderOutcome>> = Vec::new();
    if let (Some(key), true) = (&pexels_key, kind != "audio") {
        tasks.push(Box::pin(async {
            ("pexels", search_pexels(&client, key, &kind, &query).await)
        }));
    }
    if let (Some(key), true) = (&pixabay_key, kind != "audio") {
        tasks.push(Box::pin(async {
            ("pixabay", search_pixabay(&client, key, &kind, &query).await)
        }));
    }
    if let (Some(key), true) = (&freesound_key, kind == "audio") {
        tasks.push(Box::pin(async {
            ("freesound", search_freesound(&client, key, &query).await)
        }));
    }
    if kind != "video" {
        tasks.push(Box::pin(async {
            ("openverse", search_openverse(&client, &kind, &query).await)
        }));
    }

    let outcomes = futures::future::join_all(tasks).await;
    let mut per_provider = Vec::new();
    let mut errors = Vec::new();
    let mut providers = Vec::new();
    for (provider, outcome) in outcomes {
        providers.push(provider.to_string());
        match outcome {
            Ok(results) => per_provider.push(results),
            Err(e) => errors.push(format!("{provider}: {e}")),
        }
    }
    Ok(StockSearchResponse {
        results: interleave(per_provider),
        errors,
        providers,
    })
}

/// Télécharge un asset choisi dans `<project_dir>/assets/<kind>s/` et retourne son chemin
/// relatif — même arborescence que `import_asset` (fichier local), le projet reste autonome.
#[tauri::command]
pub async fn import_stock_asset(
    project_dir: String,
    kind: String,
    url: String,
    filename: String,
) -> Result<String, String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only http(s) downloads are allowed".to_string());
    }
    let subdir = super::assets::kind_subdir(&kind)?;
    let target_dir = Path::new(&project_dir).join("assets").join(subdir);
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create assets directory: {e}"))?;

    let client = http_client()?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download failed: HTTP {}", resp.status()));
    }
    if resp.content_length().unwrap_or(0) > MAX_DOWNLOAD_BYTES {
        return Err("File too large".to_string());
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if bytes.len() as u64 > MAX_DOWNLOAD_BYTES {
        return Err("File too large".to_string());
    }

    let dest = super::assets::unique_destination(&target_dir, &sanitize_filename(&filename));
    std::fs::write(&dest, &bytes).map_err(|e| format!("Failed to write file: {e}"))?;
    let dest_filename = dest
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| "Invalid destination filename".to_string())?;
    Ok(format!("assets/{subdir}/{dest_filename}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_pexels_photos_and_videos() {
        let photos = json!({"photos": [{"id": 12, "url": "https://pexels.com/photo/12",
            "photographer": "Ana", "src": {"medium": "https://img/m.jpg", "large2x": "https://img/l.jpg"}}]});
        let results = parse_pexels_images(&photos);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].download_url, "https://img/l.jpg");
        assert_eq!(results[0].filename, "pexels-12.jpg");

        let videos = json!({"videos": [{"id": 7, "url": "https://pexels.com/video/7", "image": "https://img/t.jpg",
        "duration": 12.0, "user": {"name": "Bob"},
        "video_files": [
            {"width": 3840, "link": "https://v/4k.mp4"},
            {"width": 1920, "link": "https://v/hd.mp4"},
            {"width": 640, "link": "https://v/sd.mp4"}
        ]}]});
        let results = parse_pexels_videos(&videos);
        assert_eq!(results.len(), 1);
        // 4K exclu (>1920), on prend le plus grand fichier restant.
        assert_eq!(results[0].download_url, "https://v/hd.mp4");
        assert_eq!(results[0].duration, Some(12.0));
    }

    #[test]
    fn parses_pixabay_hits() {
        let images = json!({"hits": [{"id": 5, "pageURL": "https://pixabay.com/5", "user": "Léa",
            "previewURL": "https://img/p.jpg", "largeImageURL": "https://img/l.jpg"}]});
        let results = parse_pixabay_images(&images);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].download_url, "https://img/l.jpg");

        let videos = json!({"hits": [{"id": 9, "pageURL": "https://pixabay.com/v/9", "user": "Max",
            "duration": 20,
            "videos": {"medium": {"url": "https://v/m.mp4", "thumbnail": "https://v/t.jpg"},
                       "small": {"url": "https://v/s.mp4"}}}]});
        let results = parse_pixabay_videos(&videos);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].download_url, "https://v/m.mp4");
        assert_eq!(results[0].thumbnail_url.as_deref(), Some("https://v/t.jpg"));
    }

    #[test]
    fn parses_freesound_previews_and_openverse_results() {
        let fs = json!({"results": [{"id": 42, "name": "Rain Loop!", "username": "sam",
            "license": "https://creativecommons.org/publicdomain/zero/1.0/", "duration": 8.5,
            "previews": {"preview-hq-mp3": "https://fs/42.mp3"}}]});
        let results = parse_freesound(&fs);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].download_url, "https://fs/42.mp3");
        assert_eq!(results[0].filename, "freesound-42-Rain-Loop.mp3");

        let ov = json!({"results": [{"id": "ab-12", "url": "https://ov/file.jpg",
            "thumbnail": "https://ov/t.jpg", "creator": "Zoé", "license": "by",
            "foreign_landing_url": "https://source/page", "filetype": "jpg"}]});
        let results = parse_openverse(&ov, "image", "jpg");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].license.as_deref(), Some("CC BY"));
        assert_eq!(results[0].filename, "openverse-ab-12.jpg");
    }

    #[test]
    fn interleave_alternates_between_providers() {
        let a = |p: &str, n: u32| StockResult {
            provider: p.into(),
            kind: "image".into(),
            thumbnail_url: None,
            download_url: format!("https://x/{p}{n}"),
            page_url: None,
            author: None,
            license: None,
            duration: None,
            filename: format!("{p}{n}.jpg"),
        };
        let merged = interleave(vec![
            vec![a("p1", 1), a("p1", 2), a("p1", 3)],
            vec![a("p2", 1)],
        ]);
        let providers: Vec<&str> = merged.iter().map(|r| r.provider.as_str()).collect();
        assert_eq!(providers, vec!["p1", "p2", "p1", "p1"]);
    }

    #[test]
    fn sanitize_filename_strips_path_separators_and_odd_characters() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "etc-passwd");
        assert_eq!(
            sanitize_filename("mon fichier (1).jpg"),
            "mon-fichier--1-.jpg"
        );
        assert_eq!(sanitize_filename("///"), "asset");
    }

    #[test]
    fn urlencode_escapes_query_characters() {
        assert_eq!(urlencode("chat noir"), "chat+noir");
        assert_eq!(urlencode("café&thé"), "caf%C3%A9%26th%C3%A9");
    }
}
