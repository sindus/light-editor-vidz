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
    /// Vitesse de lecture de la source vidéo associée (1.0 = normale). Doit rester cohérente
    /// avec la vitesse appliquée aux frames vidéo (`playback_speed`), sous peine de désynchro
    /// audio/vidéo progressive sur les clips accélérés/ralentis.
    pub speed: f64,
    /// Si la source est plus courte que `duration`, la boucler plutôt que de laisser le silence
    /// pour le reste — doit suivre le même choix que la vidéo (`VideoElement.loop_video`).
    pub loop_audio: bool,
}

/// Chaîne de filtres `atempo` équivalente à `speed`, en décomposant en facteurs dans
/// l'intervalle `[0.5, 2.0]` supporté par une seule instance du filtre ffmpeg `atempo`.
fn atempo_chain(speed: f64) -> String {
    let mut remaining = speed;
    let mut factors = Vec::new();
    while remaining < 0.5 {
        factors.push(0.5);
        remaining /= 0.5;
    }
    while remaining > 2.0 {
        factors.push(2.0);
        remaining /= 2.0;
    }
    factors.push(remaining);
    factors
        .iter()
        .map(|f| format!("atempo={f}"))
        .collect::<Vec<_>>()
        .join(",")
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
        if input.loop_audio {
            cmd.args(["-stream_loop", "-1"]);
        }
        cmd.args(["-ss", &input.offset.max(0.0).to_string(), "-i"])
            .arg(&input.path);
    }

    let mut filter = String::new();
    let mut mix_labels = Vec::new();
    for (i, input) in inputs.iter().enumerate() {
        let idx = i + 1; // 0 = vidéo
        let label = format!("a{i}");
        let delay_ms = (input.start_time.max(0.0) * 1000.0).round() as i64;
        // L'ajustement de tempo doit précéder `adelay` : il change la durée de l'audio, qui doit
        // être stabilisée avant de le positionner sur la timeline globale.
        let speed = input.speed.clamp(0.1, 4.0);
        let mut chain = format!("[{idx}:a]");
        if input.loop_audio {
            // Le flux est bouclé à l'infini par `-stream_loop -1` côté entrée ; on le retaille
            // ici à la durée réellement consommée en temps source (avant le changement de
            // tempo), sous peine d'un mix `amix`/`-shortest` qui ne se termine jamais.
            chain.push_str(&format!("atrim=duration={},", input.duration * speed));
        }
        if (speed - 1.0).abs() > 0.001 {
            chain.push_str(&atempo_chain(speed));
            chain.push(',');
        }
        chain.push_str(&format!(
            "adelay={delay_ms}|{delay_ms},volume={vol}",
            vol = input.volume.clamp(0.0, 2.0)
        ));
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
        return s.to_string();
    }
    // `s.len() - max_len` peut tomber au milieu d'un caractère UTF-8 multi-octet (la sortie
    // ffmpeg peut contenir des chemins/accents non-ASCII) : on recule jusqu'à la frontière de
    // caractère la plus proche pour éviter un panic sur un découpage de `&str` invalide.
    let mut start = s.len() - max_len;
    while start > 0 && !s.is_char_boundary(start) {
        start -= 1;
    }
    format!("…{}", &s[start..])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn product_of_atempo_factors(chain: &str) -> f64 {
        chain
            .split(',')
            .map(|f| f.strip_prefix("atempo=").unwrap().parse::<f64>().unwrap())
            .product()
    }

    #[test]
    fn atempo_chain_is_a_single_filter_within_the_native_range() {
        assert_eq!(atempo_chain(1.5), "atempo=1.5");
        assert_eq!(atempo_chain(0.5), "atempo=0.5");
        assert_eq!(atempo_chain(2.0), "atempo=2");
    }

    #[test]
    fn atempo_chain_splits_out_of_range_speeds_into_factors_within_0_5_to_2() {
        for speed in [0.1, 0.25, 3.0, 4.0] {
            let chain = atempo_chain(speed);
            for factor in chain
                .split(',')
                .map(|f| f.strip_prefix("atempo=").unwrap().parse::<f64>().unwrap())
            {
                assert!(
                    (0.5..=2.0).contains(&factor),
                    "facteur {factor} hors de l'intervalle supporté par ffmpeg pour vitesse={speed}"
                );
            }
            assert!(
                (product_of_atempo_factors(&chain) - speed).abs() < 1e-9,
                "le produit des facteurs doit reconstituer la vitesse demandée ({speed})"
            );
        }
    }

    #[test]
    fn tail_returns_input_unchanged_when_shorter_than_max_len() {
        assert_eq!(tail("short", 2000), "short");
    }

    #[test]
    fn tail_truncates_and_prefixes_with_ellipsis() {
        let s = "a".repeat(2010);
        let result = tail(&s, 2000);
        assert!(result.starts_with('…'));
        assert_eq!(result.chars().count(), 2001);
    }

    #[test]
    fn tail_does_not_panic_when_the_cut_point_falls_inside_a_multibyte_char() {
        // Chaque "é" fait 2 octets en UTF-8 (frontières de caractère aux offsets pairs) : avec
        // `max_len` impair, `len - max_len` tombe systématiquement au milieu d'un caractère.
        let s = "é".repeat(1500); // 3000 octets, 1500 caractères
        let result = tail(&s, 1999); // 3000 - 1999 = 1001 (impair, pas une frontière de caractère)
        assert!(result.starts_with('…'));
        assert!(result.chars().skip(1).all(|c| c == 'é'));
    }
}
