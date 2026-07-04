mod ffmpeg;

use ffmpeg::{has_audio_stream, mux_audio, AudioMixInput, VideoEncoder};
use scene_core::model::{Element, Project};
use scene_core::raster::FrameRenderer;
use std::path::Path;

/// Surcharges optionnelles de résolution/fps/qualité pour l'export, indépendantes des
/// réglages du projet (qui restent inchangés). `crf` suit la convention x264 : plus bas =
/// meilleure qualité/fichier plus lourd (typiquement 18-28).
#[derive(Debug, Clone, Copy, Default)]
pub struct ExportOverrides {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<u32>,
    pub crf: Option<u32>,
}

/// Entrées de mixage pour les pistes audio du projet (hors audio embarqué des éléments vidéo,
/// géré séparément dans `export_video`) : les pistes sont globales, leur `start_time` est déjà
/// absolu sur la timeline. Une piste dont le `src` ne résout pas vers un fichier réel à
/// l'intérieur de `project_dir` (fichier manquant, ou chemin tentant de sortir du dossier
/// projet — voir `scene_core::paths::resolve_media_path`) est silencieusement ignorée, comme le
/// reste de l'export lorsqu'une source média est introuvable.
fn collect_project_audio_inputs(project: &Project, project_dir: &Path) -> Vec<AudioMixInput> {
    let any_solo = project.audio_tracks.iter().any(|track| track.solo);
    project
        .audio_tracks
        .iter()
        .filter(|track| !track.muted && (!any_solo || track.solo))
        .filter_map(|track| {
            let path = scene_core::paths::resolve_media_path(project_dir, &track.src).ok()?;
            Some(AudioMixInput {
                path,
                offset: track.audio_offset,
                start_time: track.start_time,
                volume: track.volume,
                fade_in: track.fade_in.max(0.0),
                fade_out: track.fade_out.max(0.0),
                duration: track
                    .duration
                    .unwrap_or(project.duration - track.start_time),
                speed: 1.0,
                loop_audio: false,
            })
        })
        .collect()
}

/// Rend chaque frame du projet et encode le mp4 final (vidéo + audio mixé).
/// `on_progress` est appelé après chaque frame rendue avec une fraction 0.0..1.0.
pub fn export_video(
    project: &Project,
    project_dir: &Path,
    output_path: &Path,
    overrides: ExportOverrides,
    mut on_progress: impl FnMut(f32),
) -> Result<(), String> {
    if project.compositions.is_empty() {
        return Err("The project has no scenes to export.".to_string());
    }

    let width = overrides.width.unwrap_or(project.width).max(1);
    let height = overrides.height.unwrap_or(project.height).max(1);
    let fps = overrides.fps.unwrap_or(project.fps).max(1);
    // Le renderer lit `project.width/height/fps` directement (coordonnées en %) ; on rend
    // donc à la résolution/fps demandés en substituant temporairement ces champs, sans
    // toucher au reste du modèle (project_dir, sources, etc. restent identiques).
    let render_project = Project {
        width,
        height,
        fps,
        ..project.clone()
    };
    let total_frames = ((project.duration * fps as f64).round() as u64).max(1);

    let scratch_dir = output_path.with_extension("export-scratch");
    let temp_video = output_path.with_extension("silent.mp4");
    let mut encoder = VideoEncoder::start(width, height, fps, overrides.crf, &temp_video)?;
    let mut renderer = FrameRenderer::with_scratch_dir(scratch_dir.clone());

    for frame_idx in 0..total_frames {
        let t = frame_idx as f64 / fps as f64;
        let pixmap = renderer.render_frame(&render_project, project_dir, t);
        encoder.write_frame(pixmap.data())?;
        on_progress((frame_idx + 1) as f32 / total_frames as f32);
    }
    encoder.finish()?;

    let mut audio_inputs = collect_project_audio_inputs(project, project_dir);

    // Audio embarqué des éléments vidéo : ffmpeg peut sélectionner la piste audio d'une
    // source vidéo directement (`[idx:a]`), donc pas besoin d'extraction séparée — seulement
    // vérifier qu'une piste audio existe avant de l'ajouter au mix (une vidéo peut être muette).
    for composition in &project.compositions {
        for el in &composition.elements {
            let Element::Video(video_el) = el else {
                continue;
            };
            if video_el.muted || video_el.volume <= 0.001 {
                continue;
            }
            let Ok(source_path) = scene_core::paths::resolve_media_path(project_dir, &video_el.src)
            else {
                continue;
            };
            if !has_audio_stream(&source_path) {
                continue;
            }
            let base = el.base();
            let active_duration = base
                .duration
                .unwrap_or(composition.duration - base.start_time);
            // Même clamp que la sélection de frame vidéo (raster.rs) : la piste audio doit
            // suivre la même vitesse que l'image, sous peine de désynchronisation progressive.
            let speed = if video_el.playback_speed > 0.01 {
                video_el.playback_speed
            } else {
                1.0
            };
            audio_inputs.push(AudioMixInput {
                path: source_path,
                offset: video_el.video_offset,
                start_time: composition.start_time + base.start_time,
                volume: video_el.volume,
                fade_in: 0.0,
                fade_out: 0.0,
                duration: active_duration,
                speed,
                loop_audio: video_el.loop_video,
            });
        }
    }

    let result = mux_audio(&temp_video, &audio_inputs, output_path);
    let _ = std::fs::remove_file(&temp_video);
    let _ = std::fs::remove_dir_all(&scratch_dir);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use scene_core::model::*;

    fn empty_composition(id: &str, start_time: f64, duration: f64) -> Composition {
        Composition {
            id: id.into(),
            name: id.into(),
            start_time,
            duration,
            elements: vec![],
            transition_in: None,
            transition_out: None,
            overlap_next: 0.0,
        }
    }

    fn audio_track(id: &str, start_time: f64) -> AudioTrack {
        AudioTrack {
            id: id.into(),
            name: id.into(),
            src: format!("{id}.mp3"),
            start_time,
            duration: Some(1.0),
            volume: 1.0,
            audio_offset: 0.0,
            fade_in: 0.0,
            fade_out: 0.0,
            muted: false,
            solo: false,
        }
    }

    // `collect_project_audio_inputs` résout désormais chaque `src` sur disque (protection
    // contre les chemins qui sortiraient du dossier projet, voir `scene_core::paths`), donc les
    // tests doivent pointer vers des fichiers réels plutôt qu'un dossier fictif.
    fn temp_dir_with_files(test_name: &str, file_names: &[&str]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "letest-{test_name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        for name in file_names {
            std::fs::write(dir.join(name), b"fake").unwrap();
        }
        dir
    }

    #[test]
    fn audio_tracks_are_global_and_can_span_multiple_scenes() {
        // Piste posée à t=1 (absolu) sans durée : elle couvre les deux scènes jusqu'à la fin
        // du projet, indépendamment du découpage en scènes.
        let dir = temp_dir_with_files("audio-global", &["a1.mp3"]);
        let mut track = audio_track("a1", 1.0);
        track.duration = None;
        let project = Project {
            name: "p".into(),
            width: 100,
            height: 100,
            fps: 30,
            duration: 10.0,
            compositions: vec![
                empty_composition("c1", 0.0, 5.0),
                empty_composition("c2", 5.0, 5.0),
            ],
            audio_tracks: vec![track],
        };
        let inputs = collect_project_audio_inputs(&project, &dir);
        assert_eq!(inputs.len(), 1);
        assert_eq!(inputs[0].start_time, 1.0);
        // Durée par défaut : jusqu'à la fin du projet (10 - 1), pas de la scène.
        assert_eq!(inputs[0].duration, 9.0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn muted_tracks_are_excluded_and_solo_silences_non_solo_tracks() {
        let mut solo_track = audio_track("solo", 0.0);
        solo_track.solo = true;
        let mut muted_track = audio_track("muted", 0.0);
        muted_track.muted = true;
        let regular_track = audio_track("regular", 0.0);

        let dir = temp_dir_with_files("audio-solo-mute", &["solo.mp3", "muted.mp3", "regular.mp3"]);
        let project = Project {
            name: "p".into(),
            width: 100,
            height: 100,
            fps: 30,
            duration: 5.0,
            compositions: vec![empty_composition("c1", 0.0, 5.0)],
            audio_tracks: vec![solo_track, muted_track, regular_track],
        };
        let inputs = collect_project_audio_inputs(&project, &dir);
        assert_eq!(inputs.len(), 1, "seule la piste solo doit être mixée");
        assert!(inputs[0].path.ends_with("solo.mp3"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_track_whose_src_escapes_the_project_directory_is_silently_skipped() {
        let dir = temp_dir_with_files("audio-traversal", &[]);
        let project = Project {
            name: "p".into(),
            width: 100,
            height: 100,
            fps: 30,
            duration: 5.0,
            compositions: vec![empty_composition("c1", 0.0, 5.0)],
            audio_tracks: vec![audio_track("../etc/passwd", 0.0)],
        };
        let inputs = collect_project_audio_inputs(&project, &dir);
        assert!(
            inputs.is_empty(),
            "un src hors du dossier projet doit être ignoré, pas suivi"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn exports_a_minimal_project_to_a_valid_mp4() {
        let dir = std::env::temp_dir().join(format!(
            "letest-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let project = Project {
            name: "Export Test".into(),
            width: 160,
            height: 90,
            fps: 10,
            duration: 1.0,
            compositions: vec![Composition {
                id: "c1".into(),
                name: "Scene 1".into(),
                start_time: 0.0,
                duration: 1.0,
                elements: vec![Element::Shape(ShapeElement {
                    base: ElementBase {
                        id: "s1".into(),
                        name: "Rect".into(),
                        start_time: 0.0,
                        duration: None,
                        x: 10.0,
                        y: 10.0,
                        width: 50.0,
                        height: 50.0,
                        rotation: 0.0,
                        animations: vec![],
                        group_id: None,
                        blend_mode: None,
                    },
                    shape_type: ShapeType::Rectangle,
                    fill: "rgba(0,200,0,1)".into(),
                    stroke: "none".into(),
                    stroke_width: 0.0,
                    border_radius: None,
                    stroke_dash: None,
                    gradient_to: None,
                    gradient_angle: None,
                })],
                transition_in: None,
                transition_out: None,
                overlap_next: 0.0,
            }],
            audio_tracks: vec![],
        };

        let output_path = dir.join("out.mp4");
        let mut progress_calls = 0;
        export_video(
            &project,
            &dir,
            &output_path,
            ExportOverrides::default(),
            |_| progress_calls += 1,
        )
        .expect("export should succeed");

        assert!(output_path.exists(), "le fichier mp4 exporté doit exister");
        assert_eq!(
            progress_calls, 10,
            "un callback de progression par frame (10 frames à 10fps/1s)"
        );
        let metadata = std::fs::metadata(&output_path).unwrap();
        assert!(
            metadata.len() > 1000,
            "le mp4 exporté ne doit pas être vide/tronqué"
        );

        // Vérifie avec ffprobe que le fichier est un mp4 h264 valide de la bonne durée.
        let probe = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_name,width,height",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1",
            ])
            .arg(&output_path)
            .output()
            .expect("ffprobe doit être disponible");
        assert!(
            probe.status.success(),
            "ffprobe a échoué sur le fichier exporté"
        );
        let info = String::from_utf8_lossy(&probe.stdout);
        assert!(info.contains("codec_name=h264"), "codec inattendu : {info}");
        assert!(info.contains("width=160"), "largeur inattendue : {info}");
        assert!(info.contains("height=90"), "hauteur inattendue : {info}");

        assert!(
            !dir.join("out.export-scratch").exists(),
            "le dossier de scratch doit être nettoyé"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn export_overrides_resolution_and_fps_independently_of_project_settings() {
        let dir = std::env::temp_dir().join(format!(
            "letest-override-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let project = Project {
            name: "Export Override Test".into(),
            width: 160,
            height: 90,
            fps: 10,
            duration: 0.5,
            compositions: vec![Composition {
                id: "c1".into(),
                name: "Scene 1".into(),
                start_time: 0.0,
                duration: 0.5,
                elements: vec![],
                transition_in: None,
                transition_out: None,
                overlap_next: 0.0,
            }],
            audio_tracks: vec![],
        };

        let output_path = dir.join("out.mp4");
        export_video(
            &project,
            &dir,
            &output_path,
            ExportOverrides {
                width: Some(80),
                height: Some(60),
                fps: Some(5),
                crf: Some(30),
            },
            |_| {},
        )
        .expect("export with overrides should succeed");

        let probe = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=width,height",
                "-of",
                "default=noprint_wrappers=1",
            ])
            .arg(&output_path)
            .output()
            .expect("ffprobe doit être disponible");
        let info = String::from_utf8_lossy(&probe.stdout);
        assert!(
            info.contains("width=80"),
            "la largeur exportée doit suivre la surcharge, pas le projet : {info}"
        );
        assert!(
            info.contains("height=60"),
            "la hauteur exportée doit suivre la surcharge, pas le projet : {info}"
        );
        // Le projet original ne doit pas être modifié par l'export.
        assert_eq!(project.width, 160);
        assert_eq!(project.height, 90);
        assert_eq!(project.fps, 10);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn export_includes_audio_from_a_video_element_with_a_soundtrack() {
        let dir = std::env::temp_dir().join(format!(
            "letest-videoaudio-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        // Génère une source vidéo synthétique avec une piste audio (ton sinusoïdal).
        let video_src = dir.join("clip.mp4");
        let status = std::process::Command::new("ffmpeg")
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=64x64:d=1",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=1",
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                "-shortest",
            ])
            .arg(&video_src)
            .status()
            .expect("ffmpeg doit être disponible pour générer le clip de test");
        assert!(status.success(), "échec de génération du clip de test");

        let project = Project {
            name: "Video Audio Test".into(),
            width: 64,
            height: 64,
            fps: 10,
            duration: 1.0,
            compositions: vec![Composition {
                id: "c1".into(),
                name: "Scene 1".into(),
                start_time: 0.0,
                duration: 1.0,
                elements: vec![Element::Video(VideoElement {
                    base: ElementBase {
                        id: "v1".into(),
                        name: "Clip".into(),
                        start_time: 0.0,
                        duration: None,
                        x: 0.0,
                        y: 0.0,
                        width: 100.0,
                        height: 100.0,
                        rotation: 0.0,
                        animations: vec![],
                        group_id: None,
                        blend_mode: None,
                    },
                    src: "clip.mp4".into(),
                    fit_mode: FitMode::Cover,
                    background_color: None,
                    image_pan: None,
                    video_offset: 0.0,
                    corner_radius: None,
                    border_color: None,
                    border_width: None,
                    volume: 1.0,
                    muted: false,
                    playback_speed: 1.0,
                    loop_video: false,
                })],
                transition_in: None,
                transition_out: None,
                overlap_next: 0.0,
            }],
            audio_tracks: vec![],
        };

        let output_path = dir.join("out.mp4");
        export_video(
            &project,
            &dir,
            &output_path,
            ExportOverrides::default(),
            |_| {},
        )
        .expect("export should succeed");

        let probe = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_name",
                "-of",
                "csv=p=0",
            ])
            .arg(&output_path)
            .output()
            .expect("ffprobe doit être disponible");
        let info = String::from_utf8_lossy(&probe.stdout);
        assert!(
            info.contains("aac"),
            "le mp4 exporté doit contenir la piste audio du clip vidéo : {info}"
        );

        // Même projet avec l'élément vidéo muet : son audio ne doit pas être mixé.
        let mut muted_project = project.clone();
        let Element::Video(video_el) = &mut muted_project.compositions[0].elements[0] else {
            unreachable!();
        };
        video_el.muted = true;
        let muted_output = dir.join("out-muted.mp4");
        export_video(
            &muted_project,
            &dir,
            &muted_output,
            ExportOverrides::default(),
            |_| {},
        )
        .expect("muted export should succeed");
        let probe = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_name",
                "-of",
                "csv=p=0",
            ])
            .arg(&muted_output)
            .output()
            .expect("ffprobe doit être disponible");
        assert!(
            probe.stdout.is_empty(),
            "un élément vidéo muet ne doit apporter aucune piste audio : {}",
            String::from_utf8_lossy(&probe.stdout)
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
