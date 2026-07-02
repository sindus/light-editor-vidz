//! Construction et (dé)sérialisation d'un projet — format `project.json` dans un dossier `.lvproj/`.

use crate::model::{Composition, Project};
use crate::timeline::recompute_start_times;

/// Durée (secondes) de la composition unique créée avec tout nouveau projet.
const DEFAULT_COMPOSITION_DURATION: f64 = 5.0;

/// Options fournies par le modal "Nouveau projet". La durée totale n'est pas demandée
/// à l'utilisateur : elle est dérivée des compositions (voir `timeline::recompute_start_times`).
pub struct NewProjectOptions {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

pub fn new_project(opts: NewProjectOptions) -> Project {
    let mut project = Project {
        name: opts.name,
        width: opts.width,
        height: opts.height,
        fps: opts.fps,
        duration: 0.0,
        compositions: vec![Composition {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Scène 1".to_string(),
            start_time: 0.0,
            duration: DEFAULT_COMPOSITION_DURATION,
            elements: vec![],
            transition_in: None,
            transition_out: None,
            overlap_next: 0.0,
        }],
        audio_tracks: vec![],
    };
    recompute_start_times(&mut project);
    project
}

pub fn to_json(project: &Project) -> serde_json::Result<String> {
    serde_json::to_string_pretty(project)
}

pub fn from_json(data: &str) -> serde_json::Result<Project> {
    serde_json::from_str(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_json() {
        let project = new_project(NewProjectOptions {
            name: "Ma vidéo".into(),
            width: 1080,
            height: 1920,
            fps: 30,
        });
        let json = to_json(&project).unwrap();
        let parsed = from_json(&json).unwrap();
        assert_eq!(parsed.name, "Ma vidéo");
        assert_eq!(parsed.width, 1080);
        assert_eq!(parsed.compositions.len(), 1);
        assert_eq!(parsed.duration, DEFAULT_COMPOSITION_DURATION);
    }
}
