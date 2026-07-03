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
    /// `crf` (0-51, x264) surcharge le contrôle de qualité par défaut du `-preset medium` si fourni.
    pub fn start(
        width: u32,
        height: u32,
        fps: u32,
        crf: Option<u32>,
        output_path: &Path,
    ) -> Result<Self, String> {
        let mut args = vec![
            "-y".to_string(),
            "-f".to_string(),
            "rawvideo".to_string(),
            "-pixel_format".to_string(),
            "rgba".to_string(),
            "-video_size".to_string(),
            format!("{width}x{height}"),
            "-framerate".to_string(),
            fps.to_string(),
            "-i".to_string(),
            "pipe:0".to_string(),
            "-c:v".to_string(),
            "libx264".to_string(),
            "-preset".to_string(),
            "medium".to_string(),
        ];
        if let Some(crf) = crf {
            args.push("-crf".to_string());
            args.push(crf.clamp(0, 51).to_string());
        }
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());

        let child = Command::new(ffmpeg_binary())
            .args(&args)
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
    /// Durée (secondes) du fondu d'entrée/sortie ; 0.0 = pas de fondu.
    pub fade_in: f64,
    pub fade_out: f64,
    /// Durée totale (secondes) de la piste dans le mix, nécessaire pour placer le fade-out.
    pub duration: f64,
}

/// Indique si `path` contient au moins une piste audio (ex : une source vidéo peut ne pas en
/// avoir). Best-effort via ffprobe : en cas d'échec (binaire absent, format non lisible), on
/// suppose "pas d'audio" plutôt que de faire échouer tout l'export sur une vérification annexe.
pub fn has_audio_stream(path: &Path) -> bool {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
        ])
        .arg(path)
        .output();
    match output {
        Ok(out) => out.status.success() && !out.stdout.is_empty(),
        Err(_) => false,
    }
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
        let mut chain = format!(
            "[{idx}:a]adelay={delay_ms}|{delay_ms},volume={vol}",
            vol = input.volume.clamp(0.0, 2.0)
        );
        if input.fade_in > 0.0 {
            chain.push_str(&format!(",afade=t=in:st=0:d={}", input.fade_in));
        }
        if input.fade_out > 0.0 {
            let fade_out_start = (input.start_time + input.duration - input.fade_out).max(0.0);
            chain.push_str(&format!(
                ",afade=t=out:st={}:d={}",
                fade_out_start, input.fade_out
            ));
        }
        chain.push_str(&format!("[{label}];"));
        filter.push_str(&chain);
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
