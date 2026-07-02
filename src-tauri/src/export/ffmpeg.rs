//! Pilotage de ffmpeg pour l'encodage vidéo et le mixage audio. Le binaire est résolu via
//! `scene_core::ffmpeg_path::ffmpeg_binary()` — PATH système par défaut, ou binaire
//! packagé si `LIGHT_EDITOR_VIDZ_FFMPEG` est défini au démarrage (voir `lib.rs`).

use scene_core::ffmpeg_path::ffmpeg_binary;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

pub struct VideoEncoder {
    child: std::process::Child,
}

impl VideoEncoder {
    /// Démarre un process ffmpeg qui lit des frames RGBA brutes sur stdin et encode en h264/mp4.
    pub fn start(width: u32, height: u32, fps: u32, output_path: &Path) -> Result<Self, String> {
        let child = Command::new(ffmpeg_binary())
            .args([
                "-y",
                "-f",
                "rawvideo",
                "-pixel_format",
                "rgba",
                "-video_size",
                &format!("{width}x{height}"),
                "-framerate",
                &fps.to_string(),
                "-i",
                "pipe:0",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(output_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to launch ffmpeg (is it installed and in PATH?): {e}"))?;
        Ok(Self { child })
    }

    pub fn write_frame(&mut self, rgba: &[u8]) -> Result<(), String> {
        self.child
            .stdin
            .as_mut()
            .ok_or("ffmpeg stdin unavailable")?
            .write_all(rgba)
            .map_err(|e| format!("Failed to write frame to ffmpeg: {e}"))
    }

    pub fn finish(mut self) -> Result<(), String> {
        drop(self.child.stdin.take());
        let output = self
            .child
            .wait_with_output()
            .map_err(|e| format!("Failed to wait for ffmpeg: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ffmpeg failed: {}", tail(&stderr, 2000)));
        }
        Ok(())
    }
}

pub struct AudioMixInput {
    pub path: std::path::PathBuf,
    /// Décalage (secondes) dans le fichier source à partir duquel commencer la lecture.
    pub offset: f64,
    /// Position (secondes) sur la timeline globale à laquelle la piste doit démarrer.
    pub start_time: f64,
    pub volume: f64,
}

/// Mixe/mux les pistes audio sur la vidéo déjà encodée (silencieuse). Si `inputs` est vide,
/// copie simplement `video_path` vers `output_path`.
pub fn mux_audio(
    video_path: &Path,
    inputs: &[AudioMixInput],
    output_path: &Path,
) -> Result<(), String> {
    if inputs.is_empty() {
        std::fs::copy(video_path, output_path)
            .map_err(|e| format!("Failed to copy final video: {e}"))?;
        return Ok(());
    }

    let mut cmd = Command::new(ffmpeg_binary());
    cmd.args(["-y", "-i"]).arg(video_path);
    for input in inputs {
        cmd.args(["-ss", &input.offset.max(0.0).to_string(), "-i"])
            .arg(&input.path);
    }

    let mut filter = String::new();
    let mut mix_labels = Vec::new();
    for (i, input) in inputs.iter().enumerate() {
        let idx = i + 1; // 0 = vidéo
        let label = format!("a{i}");
        let delay_ms = (input.start_time.max(0.0) * 1000.0).round() as i64;
        filter.push_str(&format!(
            "[{idx}:a]adelay={delay_ms}|{delay_ms},volume={vol}[{label}];",
            vol = input.volume.clamp(0.0, 2.0)
        ));
        mix_labels.push(format!("[{label}]"));
    }
    if inputs.len() == 1 {
        filter.push_str(&format!("{}anull[aout]", mix_labels[0]));
    } else {
        filter.push_str(&format!(
            "{}amix=inputs={}:duration=first:normalize=0[aout]",
            mix_labels.join(""),
            inputs.len()
        ));
    }

    cmd.args([
        "-filter_complex",
        &filter,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
    ]);
    cmd.arg(output_path);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to launch ffmpeg (audio mixing): {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "ffmpeg failed (audio mixing): {}",
            tail(&stderr, 2000)
        ));
    }
    Ok(())
}

fn tail(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("…{}", &s[s.len() - max_len..])
    }
}
