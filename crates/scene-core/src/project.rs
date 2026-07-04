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
    let mut value: serde_json::Value = serde_json::from_str(data)?;
    migrate_scene_audio_to_project(&mut value);
    serde_json::from_value(value)
}

/// Migration : les anciens projets stockaient les pistes audio par scène
/// (`compositions[i].audio_tracks`, `start_time` relatif à la scène). Le modèle actuel les
/// stocke au niveau projet avec un `start_time` absolu — on déplace chaque piste en lui
/// ajoutant le `start_time` de sa scène. Opère sur le JSON brut : le champ n'existe plus sur
/// `Composition`, il serait sinon silencieusement ignoré (pistes perdues au premier resave).
fn migrate_scene_audio_to_project(value: &mut serde_json::Value) {
    let Some(compositions) = value.get_mut("compositions").and_then(|c| c.as_array_mut()) else {
        return;
    };
    let mut migrated = Vec::new();
    for comp in compositions.iter_mut() {
        let comp_start = comp
            .get("start_time")
            .and_then(|s| s.as_f64())
            .unwrap_or(0.0);
        let Some(tracks) = comp
            .as_object_mut()
            .and_then(|o| o.remove("audio_tracks"))
            .and_then(|t| match t {
                serde_json::Value::Array(a) => Some(a),
                _ => None,
            })
        else {
            continue;
        };
        for mut track in tracks {
            if let Some(start) = track.get("start_time").and_then(|s| s.as_f64()) {
                track["start_time"] = serde_json::json!(start + comp_start);
            }
            migrated.push(track);
        }
    }
    if migrated.is_empty() {
        return;
    }
    let root_tracks = value
        .as_object_mut()
        .expect("un projet JSON est un objet")
        .entry("audio_tracks")
        .or_insert_with(|| serde_json::Value::Array(vec![]));
    if let Some(arr) = root_tracks.as_array_mut() {
        arr.extend(migrated);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_legacy_scene_scoped_audio_tracks_to_absolute_project_tracks() {
        // Ancien format : pistes dans les compositions, start_time relatif à la scène.
        let legacy = r#"{
            "name": "Vieux projet", "width": 1920, "height": 1080, "fps": 30, "duration": 8.0,
            "compositions": [
                {"id": "c1", "name": "A", "start_time": 0.0, "duration": 5.0, "elements": [],
                 "audio_tracks": [{"id": "t1", "name": "Musique", "src": "assets/audio/m.mp3",
                   "start_time": 1.0, "duration": 2.0, "volume": 1.0, "audio_offset": 0.0,
                   "fade_in": 0.0, "fade_out": 0.0, "muted": false, "solo": false}],
                 "transition_in": null, "transition_out": null, "overlap_next": 0.0},
                {"id": "c2", "name": "B", "start_time": 5.0, "duration": 3.0, "elements": [],
                 "audio_tracks": [{"id": "t2", "name": "Voix", "src": "assets/audio/v.mp3",
                   "start_time": 0.5, "duration": null, "volume": 0.8, "audio_offset": 0.0,
                   "fade_in": 0.0, "fade_out": 0.0, "muted": false, "solo": false}],
                 "transition_in": null, "transition_out": null, "overlap_next": 0.0}
            ]
        }"#;
        let project = from_json(legacy).expect("le format legacy doit se charger");
        assert_eq!(project.audio_tracks.len(), 2);
        // start_time devenu absolu : scène + piste.
        assert_eq!(project.audio_tracks[0].start_time, 1.0);
        assert_eq!(project.audio_tracks[1].start_time, 5.5);
        assert_eq!(project.audio_tracks[1].id, "t2");
    }

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
