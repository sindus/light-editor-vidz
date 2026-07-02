use scene_core::model::Project;
use scene_core::project::{new_project as build_project, NewProjectOptions};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_store::StoreExt;

/// Autorise le protocole `asset://` à lire les médias de ce projet (images/vidéos
/// affichées dans le canvas), sans ouvrir l'accès à tout le disque.
fn allow_asset_scope(app: &tauri::AppHandle, project_dir: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(project_dir, true)
        .map_err(|e| format!("Failed to authorize asset access: {e}"))
}

const PROJECT_FILE: &str = "project.json";
const RECENTS_STORE: &str = "recents.json";
const RECENTS_KEY: &str = "projects";

fn slugify(name: &str) -> String {
    let slug: String = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "projet".to_string()
    } else {
        slug
    }
}

fn project_json_path(project_dir: &Path) -> PathBuf {
    project_dir.join(PROJECT_FILE)
}

fn read_project(project_dir: &Path) -> Result<Project, String> {
    let data = fs::read_to_string(project_json_path(project_dir))
        .map_err(|e| format!("Failed to read project: {e}"))?;
    scene_core::project::from_json(&data).map_err(|e| format!("Invalid project: {e}"))
}

fn write_project(project_dir: &Path, project: &Project) -> Result<(), String> {
    fs::create_dir_all(project_dir.join("assets"))
        .map_err(|e| format!("Failed to create assets directory: {e}"))?;
    let json = scene_core::project::to_json(project)
        .map_err(|e| format!("Failed to serialize project: {e}"))?;
    fs::write(project_json_path(project_dir), json)
        .map_err(|e| format!("Failed to write project: {e}"))
}

fn add_recent(app: &tauri::AppHandle, project_dir: &str) -> Result<(), String> {
    let store = app
        .store(RECENTS_STORE)
        .map_err(|e| format!("Recents store unavailable: {e}"))?;
    let mut recents: Vec<String> = store
        .get(RECENTS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    recents.retain(|p| p != project_dir);
    recents.insert(0, project_dir.to_string());
    recents.truncate(20);
    store.set(RECENTS_KEY, serde_json::json!(recents));
    store
        .save()
        .map_err(|e| format!("Failed to save recents: {e}"))?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewProjectArgs {
    pub parent_dir: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

/// Crée un nouveau dossier de projet `<parent_dir>/<slug>.lvproj/` contenant `project.json`
/// et `assets/`, puis l'ajoute aux projets récents.
#[tauri::command]
pub fn new_project(app: tauri::AppHandle, args: NewProjectArgs) -> Result<String, String> {
    let slug = slugify(&args.name);
    let project_dir = PathBuf::from(&args.parent_dir).join(format!("{slug}.lvproj"));
    if project_dir.exists() {
        return Err(format!(
            "A project already exists at this location: {}",
            project_dir.display()
        ));
    }

    let project = build_project(NewProjectOptions {
        name: args.name,
        width: args.width,
        height: args.height,
        fps: args.fps,
    });

    write_project(&project_dir, &project)?;
    allow_asset_scope(&app, &project_dir)?;

    let project_dir_str = project_dir.to_string_lossy().to_string();
    add_recent(&app, &project_dir_str)?;

    Ok(project_dir_str)
}

/// Charge un projet depuis son dossier `.lvproj/` et l'ajoute aux projets récents.
#[tauri::command]
pub fn load_project(app: tauri::AppHandle, project_dir: String) -> Result<Project, String> {
    let project = read_project(Path::new(&project_dir))?;
    allow_asset_scope(&app, Path::new(&project_dir))?;
    add_recent(&app, &project_dir)?;
    Ok(project)
}

/// Enregistre l'état courant du projet (écrase `project.json`).
#[tauri::command]
pub fn save_project(project_dir: String, project: Project) -> Result<(), String> {
    write_project(Path::new(&project_dir), &project)
}

/// Lit un fichier texte arbitraire choisi par l'utilisateur (ex: import JSON de l'ancien projet).
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
}

#[derive(Debug, Serialize)]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub duration: f64,
}

/// Liste les projets récents encore présents sur le disque (les entrées supprimées
/// manuellement sont silencieusement ignorées).
#[tauri::command]
pub fn list_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProject>, String> {
    let store = app
        .store(RECENTS_STORE)
        .map_err(|e| format!("Recents store unavailable: {e}"))?;
    let recents: Vec<String> = store
        .get(RECENTS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let mut out = Vec::new();
    for path in recents {
        if let Ok(project) = read_project(Path::new(&path)) {
            out.push(RecentProject {
                path,
                name: project.name,
                width: project.width,
                height: project.height,
                duration: project.duration,
            });
        }
    }
    Ok(out)
}
