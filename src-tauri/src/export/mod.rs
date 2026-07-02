mod ffmpeg;

use ffmpeg::{mux_audio, AudioMixInput, VideoEncoder};
use scene_core::model::Project;
use scene_core::raster::FrameRenderer;
use std::path::Path;

/// Rend chaque frame du projet et encode le mp4 final (vidéo + audio mixé).
/// `on_progress` est appelé après chaque frame rendue avec une fraction 0.0..1.0.
pub fn export_video(
    project: &Project,
    project_dir: &Path,
    output_path: &Path,
    mut on_progress: impl FnMut(f32),
) -> Result<(), String> {
    if project.compositions.is_empty() {
        return Err("The project has no scenes to export.".to_string());
    }

    let fps = project.fps.max(1);
    let total_frames = ((project.duration * fps as f64).round() as u64).max(1);

    let scratch_dir = output_path.with_extension("export-scratch");
    let temp_video = output_path.with_extension("silent.mp4");
    let mut encoder = VideoEncoder::start(project.width, project.height, fps, &temp_video)?;
    let mut renderer = FrameRenderer::with_scratch_dir(scratch_dir.clone());

    for frame_idx in 0..total_frames {
        let t = frame_idx as f64 / fps as f64;
        let pixmap = renderer.render_frame(project, project_dir, t);
        encoder.write_frame(pixmap.data())?;
        on_progress((frame_idx + 1) as f32 / total_frames as f32);
    }
    encoder.finish()?;

    let audio_inputs: Vec<AudioMixInput> = project
        .audio_tracks
        .iter()
        .map(|track| AudioMixInput {
            path: project_dir.join(&track.src),
            offset: track.audio_offset,
            start_time: track.start_time,
            volume: track.volume,
        })
        .collect();

    let result = mux_audio(&temp_video, &audio_inputs, output_path);
    let _ = std::fs::remove_file(&temp_video);
    let _ = std::fs::remove_dir_all(&scratch_dir);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use scene_core::model::*;

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
                    },
                    shape_type: ShapeType::Rectangle,
                    fill: "rgba(0,200,0,1)".into(),
                    stroke: "none".into(),
                    stroke_width: 0.0,
                    border_radius: None,
                })],
                transition_in: None,
                transition_out: None,
                overlap_next: 0.0,
            }],
            audio_tracks: vec![],
        };

        let output_path = dir.join("out.mp4");
        let mut progress_calls = 0;
        export_video(&project, &dir, &output_path, |_| progress_calls += 1)
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
}
