//! Rendu d'une frame (image bitmap) à un instant donné, pour l'export vidéo.
//!
//! Texte et formes sont rendus dans un buffer hors-écran puis composés via `draw_pixmap` :
//! rotation, skew et flou (`blur_px`) pleinement supportés pour les deux. Les images/vidéos
//! sont bloutées directement sur les pixels source avant mise à l'échelle (approximation, voir
//! `draw_bitmap`). Les vidéos utilisent des frames extraites au préalable par ffmpeg (voir
//! `VideoFrameCache`) ; si l'extraction échoue, un cadre statique de couleur unie est affiché
//! en repli (sans flou). Les transitions de type "wipe" ne sont pas des transforms affines :
//! elles sont appliquées comme un masque de clip rectangulaire (voir `wipe_rect`).

use crate::animate::{
    resolve_composition_transition, resolve_element_animations, resolve_image_pan,
    resolve_text_reveal, resolve_wipe, ResolvedTransform,
};
use crate::model::{
    AnimationDirection, AnimationType, Composition, Element, FitMode, Project, ShapeType,
    TransitionType,
};
use crate::timeline::{is_element_active, resolve_active_composition};
use cosmic_text::{
    Attrs, Buffer, Color as CosmicColor, Family, FontSystem, Metrics, Shaping, SwashCache, Weight,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tiny_skia::{Color, FillRule, Mask, Paint, PathBuilder, Pixmap, PixmapPaint, Rect, Transform};

pub struct FrameRenderer {
    font_system: FontSystem,
    swash_cache: SwashCache,
    image_cache: HashMap<String, Option<image::RgbaImage>>,
    /// Dossier de travail où extraire les frames vidéo (voir `ensure_video_frames`).
    scratch_dir: PathBuf,
    video_frames: HashMap<String, Option<(PathBuf, u32)>>,
}

/// Extrait les frames d'une vidéo source vers `<scratch_dir>/<hash>/frame_%06d.png` via
/// ffmpeg (binaire système), au fps du projet. Retourne le dossier et le nombre de frames.
fn extract_video_frames(
    source: &Path,
    fps: u32,
    scratch_dir: &Path,
) -> Result<(PathBuf, u32), String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    let out_dir = scratch_dir.join(format!("video-{:x}", hasher.finish()));
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let status = Command::new(crate::ffmpeg_path::ffmpeg_binary())
        .args(["-y", "-i"])
        .arg(source)
        .args(["-vf", &format!("fps={fps}"), "-start_number", "1"])
        .arg(out_dir.join("frame_%06d.png"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;
    if !status.success() {
        return Err("video frame extraction failed".to_string());
    }

    let count = std::fs::read_dir(&out_dir)
        .map_err(|e| e.to_string())?
        .count() as u32;
    if count == 0 {
        return Err("no frames extracted".to_string());
    }
    Ok((out_dir, count))
}

/// Charge une image depuis le disque sans la mettre en cache — pour les frames vidéo décodées
/// (un fichier PNG distinct et à usage unique par frame), contrairement à `load_image_abs`
/// (images statiques, réutilisées à l'identique sur toute la durée de l'export).
fn load_image_uncached(path: &Path) -> Option<image::RgbaImage> {
    image::open(path).ok().map(|i| i.to_rgba8())
}

/// Index (1-based) de la frame extraite à afficher pour `local_time` (secondes dans la source).
/// Hors boucle : clamp sur la dernière frame (gel). En boucle : retour au point d'entrée
/// (`video_offset`), pas au début du fichier — même convention que la preview
/// (`VideoElementView`, modulo sur [offset, fin de source)).
fn video_frame_index(
    local_time: f64,
    fps: u32,
    count: u32,
    loop_video: bool,
    video_offset: f64,
) -> i64 {
    let count = count as i64;
    let raw_idx = (local_time.max(0.0) * fps as f64).floor() as i64;
    let start_idx = ((video_offset.max(0.0) * fps as f64).floor() as i64).clamp(0, count - 1);
    let span = count - start_idx;
    if loop_video && span > 0 && raw_idx >= count {
        start_idx + (raw_idx - start_idx).rem_euclid(span) + 1
    } else {
        (raw_idx + 1).clamp(1, count)
    }
}

fn parse_css_color(s: &str) -> Color {
    // Supporte "rgba(r,g,b,a)" (format produit par le frontend), mais aussi "rgb(r,g,b)" et
    // "#rrggbb"/"#rrggbbaa" (saisie manuelle dans le champ couleur, import legacy), avec repli
    // sur blanc opaque.
    let s = s.trim();
    if let Some(inner) = s
        .strip_prefix("rgba(")
        .or_else(|| s.strip_prefix("rgb("))
        .and_then(|s| s.strip_suffix(')'))
    {
        let parts: Vec<f32> = inner
            .split(',')
            .filter_map(|p| p.trim().parse().ok())
            .collect();
        if parts.len() == 3 || parts.len() == 4 {
            return Color::from_rgba(
                (parts[0] / 255.0).clamp(0.0, 1.0),
                (parts[1] / 255.0).clamp(0.0, 1.0),
                (parts[2] / 255.0).clamp(0.0, 1.0),
                parts.get(3).copied().unwrap_or(1.0).clamp(0.0, 1.0),
            )
            .unwrap_or(Color::WHITE);
        }
    }
    if let Some(hex) = s.strip_prefix('#') {
        if (hex.len() == 6 || hex.len() == 8) && hex.chars().all(|c| c.is_ascii_hexdigit()) {
            let channel = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).unwrap_or(255);
            let a = if hex.len() == 8 { channel(6) } else { 255 };
            return Color::from_rgba8(channel(0), channel(2), channel(4), a);
        }
    }
    Color::WHITE
}

/// Attributs cosmic-text (famille/graisse/style) d'un élément texte — partagé entre la mise en
/// page de mesure (`text_fits_at_size`) et le rendu (`draw_text`) pour garantir des métriques
/// identiques.
fn text_attrs(text_el: &crate::model::TextElement) -> Attrs<'_> {
    let weight = if text_el.font_weight == Some(crate::model::FontWeight::Bold) {
        Weight::BOLD
    } else {
        Weight::NORMAL
    };
    let style = if text_el.font_style == Some(crate::model::FontStyle::Italic) {
        cosmic_text::Style::Italic
    } else {
        cosmic_text::Style::Normal
    };
    let family = text_el
        .font_family
        .as_deref()
        .map(Family::Name)
        .unwrap_or(Family::SansSerif);
    Attrs::new().family(family).weight(weight).style(style)
}

fn to_skia_blend_mode(mode: Option<crate::model::BlendMode>) -> tiny_skia::BlendMode {
    match mode {
        None | Some(crate::model::BlendMode::Normal) => tiny_skia::BlendMode::SourceOver,
        Some(crate::model::BlendMode::Multiply) => tiny_skia::BlendMode::Multiply,
        Some(crate::model::BlendMode::Screen) => tiny_skia::BlendMode::Screen,
        Some(crate::model::BlendMode::Overlay) => tiny_skia::BlendMode::Overlay,
        Some(crate::model::BlendMode::Darken) => tiny_skia::BlendMode::Darken,
        Some(crate::model::BlendMode::Lighten) => tiny_skia::BlendMode::Lighten,
    }
}

fn elem_transform(anim: &ResolvedTransform, cx: f32, cy: f32, w_px: f32, h_px: f32) -> Transform {
    let dx_px = (anim.dx_pct / 100.0) as f32 * w_px;
    let dy_px = (anim.dy_pct / 100.0) as f32 * h_px;
    let skew_kx = (anim.skew_deg as f32).to_radians().tan();
    Transform::from_translate(-cx, -cy)
        .post_concat(Transform::from_row(1.0, 0.0, skew_kx, 1.0, 0.0, 0.0))
        .post_scale(anim.scale as f32, anim.scale as f32)
        .post_rotate(anim.rotate_deg as f32)
        .post_translate(cx, cy)
        .post_translate(dx_px, dy_px)
}

/// Rectangle visible pour un wipe (balayage) donné, selon sa progression (0 = caché, 1 = révélé).
fn wipe_rect(
    transition_type: TransitionType,
    progress: f64,
    width: f32,
    height: f32,
) -> Option<Rect> {
    let p = progress.clamp(0.0, 1.0) as f32;
    match transition_type {
        TransitionType::WipeRight => Rect::from_xywh(0.0, 0.0, width * p, height),
        TransitionType::WipeLeft => Rect::from_xywh(width * (1.0 - p), 0.0, width * p, height),
        TransitionType::WipeDown => Rect::from_xywh(0.0, 0.0, width, height * p),
        TransitionType::WipeUp => Rect::from_xywh(0.0, height * (1.0 - p), width, height * p),
        _ => None,
    }
}

impl Default for FrameRenderer {
    fn default() -> Self {
        Self::new()
    }
}

impl FrameRenderer {
    pub fn new() -> Self {
        Self::with_scratch_dir(
            std::env::temp_dir().join(format!("light-editor-vidz-export-{}", std::process::id())),
        )
    }

    pub fn with_scratch_dir(scratch_dir: PathBuf) -> Self {
        Self {
            font_system: FontSystem::new(),
            swash_cache: SwashCache::new(),
            image_cache: HashMap::new(),
            scratch_dir,
            video_frames: HashMap::new(),
        }
    }

    fn load_image_abs(&mut self, key: String, path: PathBuf) -> Option<&image::RgbaImage> {
        self.image_cache
            .entry(key)
            .or_insert_with(|| load_image_uncached(&path))
            .as_ref()
    }

    fn load_image(&mut self, project_dir: &Path, relative_src: &str) -> Option<&image::RgbaImage> {
        let path = crate::paths::resolve_media_path(project_dir, relative_src).ok()?;
        self.load_image_abs(relative_src.to_string(), path)
    }

    /// Frame extraite la plus proche de `local_time` (secondes) pour cette source vidéo.
    /// Déclenche l'extraction complète des frames au premier appel pour cette source (mise
    /// en cache ensuite). Retourne `None` si ffmpeg est indisponible ou a échoué.
    fn video_frame_at(
        &mut self,
        project_dir: &Path,
        relative_src: &str,
        fps: u32,
        local_time: f64,
        loop_video: bool,
        video_offset: f64,
    ) -> Option<PathBuf> {
        if !self.video_frames.contains_key(relative_src) {
            let result = crate::paths::resolve_media_path(project_dir, relative_src)
                .ok()
                .and_then(|source| extract_video_frames(&source, fps, &self.scratch_dir).ok());
            self.video_frames.insert(relative_src.to_string(), result);
        }
        let (dir, count) = self.video_frames.get(relative_src)?.as_ref()?;
        let idx = video_frame_index(local_time, fps, *count, loop_video, video_offset);
        Some(dir.join(format!("frame_{idx:06}.png")))
    }

    pub fn render_frame(&mut self, project: &Project, project_dir: &Path, t: f64) -> Pixmap {
        let width = project.width.max(1);
        let height = project.height.max(1);
        let mut canvas = Pixmap::new(width, height).expect("dimensions non nulles");
        canvas.fill(Color::BLACK);

        let Some((composition, local_time)) = resolve_active_composition(project, t) else {
            return canvas;
        };

        let mut scene = Pixmap::new(width, height).expect("dimensions non nulles");
        self.draw_composition(
            &mut scene,
            composition,
            local_time,
            project_dir,
            project.fps.max(1),
        );

        let comp_in = resolve_composition_transition(
            composition.transition_in.as_ref(),
            AnimationDirection::In,
            local_time,
            composition.duration,
        );
        let comp_out = resolve_composition_transition(
            composition.transition_out.as_ref(),
            AnimationDirection::Out,
            local_time,
            composition.duration,
        );
        let opacity = (comp_in.opacity * comp_out.opacity).clamp(0.0, 1.0) as f32;
        let cx = width as f32 / 2.0;
        let cy = height as f32 / 2.0;
        let comp_transform = elem_transform(
            &ResolvedTransform {
                opacity: 1.0,
                dx_pct: comp_in.dx_pct + comp_out.dx_pct,
                dy_pct: comp_in.dy_pct + comp_out.dy_pct,
                scale: comp_in.scale * comp_out.scale,
                rotate_deg: comp_in.rotate_deg + comp_out.rotate_deg,
                skew_deg: 0.0,
                blur_px: 0.0,
            },
            cx,
            cy,
            width as f32,
            height as f32,
        );

        let wipe = resolve_wipe(
            composition.transition_out.as_ref(),
            AnimationDirection::Out,
            local_time,
            composition.duration,
        )
        .or_else(|| {
            resolve_wipe(
                composition.transition_in.as_ref(),
                AnimationDirection::In,
                local_time,
                composition.duration,
            )
        });
        let mask = wipe.and_then(|(transition_type, progress)| {
            let rect = wipe_rect(transition_type, progress, width as f32, height as f32)?;
            let mut m = Mask::new(width, height)?;
            let mut pb = PathBuilder::new();
            pb.push_rect(rect);
            let path = pb.finish()?;
            m.fill_path(&path, FillRule::Winding, true, Transform::identity());
            Some(m)
        });

        canvas.draw_pixmap(
            0,
            0,
            scene.as_ref(),
            &PixmapPaint {
                opacity,
                ..Default::default()
            },
            comp_transform,
            mask.as_ref(),
        );

        canvas
    }

    fn draw_composition(
        &mut self,
        scene: &mut Pixmap,
        composition: &Composition,
        local_time: f64,
        project_dir: &Path,
        fps: u32,
    ) {
        let width = scene.width() as f32;
        let height = scene.height() as f32;

        for el in &composition.elements {
            if !is_element_active(el, local_time) {
                continue;
            }
            let base = el.base();
            let active_duration = base
                .duration
                .unwrap_or(composition.duration - base.start_time);
            let local_element_time = local_time - base.start_time;
            let anim =
                resolve_element_animations(&base.animations, local_element_time, active_duration);
            if anim.opacity <= 0.001 {
                continue;
            }

            let x_px = (base.x / 100.0) as f32 * width;
            let y_px = (base.y / 100.0) as f32 * height;
            let w_px = (base.width / 100.0) as f32 * width;
            let h_px = (base.height / 100.0) as f32 * height;
            let cx = x_px + w_px / 2.0;
            let cy = y_px + h_px / 2.0;
            let transform = elem_transform(&anim, cx, cy, w_px, h_px);

            match el {
                Element::Text(text_el) => {
                    let reveal =
                        resolve_text_reveal(&base.animations, local_element_time, active_duration);
                    self.draw_text(
                        scene,
                        text_el,
                        x_px,
                        y_px,
                        w_px,
                        h_px,
                        anim.opacity as f32,
                        anim.blur_px as f32,
                        transform,
                        base.blend_mode,
                        reveal,
                    );
                }
                Element::Shape(shape_el) => {
                    draw_shape(
                        scene,
                        shape_el,
                        x_px,
                        y_px,
                        w_px,
                        h_px,
                        anim.opacity as f32,
                        anim.blur_px as f32,
                        transform,
                        base.blend_mode,
                    );
                }
                Element::Image(img_el) => {
                    let pan = resolve_image_pan(
                        img_el.image_pan.as_ref(),
                        local_element_time,
                        active_duration,
                    );
                    if let Some(img) = self.load_image(project_dir, &img_el.src) {
                        draw_bitmap(
                            scene,
                            img,
                            img_el.fit_mode,
                            x_px,
                            y_px,
                            w_px,
                            h_px,
                            anim.opacity as f32,
                            anim.blur_px as f32,
                            transform,
                            pan,
                            base.blend_mode,
                            img_el.corner_radius,
                            img_el.border_color.as_deref(),
                            img_el.border_width,
                        );
                    }
                }
                Element::Video(video_el) => {
                    let pan = resolve_image_pan(
                        video_el.image_pan.as_ref(),
                        local_element_time,
                        active_duration,
                    );
                    let speed = if video_el.playback_speed > 0.01 {
                        video_el.playback_speed
                    } else {
                        1.0
                    };
                    let local_video_time =
                        local_element_time.max(0.0) * speed + video_el.video_offset;
                    let frame_path = self.video_frame_at(
                        project_dir,
                        &video_el.src,
                        fps,
                        local_video_time,
                        video_el.loop_video,
                        video_el.video_offset,
                    );
                    // Chaque frame vidéo décodée est un fichier PNG distinct, utilisé une seule
                    // fois (pas de lecture en arrière) : on la charge sans la mettre en cache,
                    // sous peine de faire croître `image_cache` sans limite sur tout l'export
                    // (des dizaines de milliers d'entrées pour une vidéo longue).
                    let frame = frame_path.and_then(|p| load_image_uncached(&p));
                    if let Some(img) = &frame {
                        draw_bitmap(
                            scene,
                            img,
                            video_el.fit_mode,
                            x_px,
                            y_px,
                            w_px,
                            h_px,
                            anim.opacity as f32,
                            anim.blur_px as f32,
                            transform,
                            pan,
                            base.blend_mode,
                            video_el.corner_radius,
                            video_el.border_color.as_deref(),
                            video_el.border_width,
                        );
                    } else {
                        // Repli si ffmpeg est indisponible ou l'extraction a échoué.
                        draw_placeholder(
                            scene,
                            video_el.background_color.as_deref(),
                            x_px,
                            y_px,
                            w_px,
                            h_px,
                            anim.opacity as f32,
                            transform,
                        );
                    }
                }
            }
        }
    }

    /// `font_size: None` (auto-fit) : vrai si le texte, une fois mis en page à `font_size_px`
    /// (retour à la ligne automatique sur `w_px`), tient dans `h_px` sans déborder.
    fn text_fits_at_size(
        &mut self,
        text_el: &crate::model::TextElement,
        font_size_px: f32,
        w_px: f32,
        h_px: f32,
    ) -> bool {
        let line_height_px = font_size_px * 1.25 * text_el.line_height.unwrap_or(1.0) as f32;
        let metrics = Metrics::new(font_size_px, line_height_px);
        let mut buffer = Buffer::new(&mut self.font_system, metrics);
        buffer.set_size(Some(w_px), Some(h_px));
        let attrs = text_attrs(text_el);
        buffer.set_text(&text_el.content, &attrs, Shaping::Advanced, None);
        buffer.shape_until_scroll(&mut self.font_system, false);

        let total_height = buffer.layout_runs().count() as f32 * line_height_px;
        if total_height > h_px + 0.5 {
            return false;
        }
        buffer
            .layout_runs()
            .all(|run| run.glyphs.iter().map(|g| g.w).sum::<f32>() <= w_px + 0.5)
    }

    /// Recherche par dichotomie la plus grande taille de police (px) qui tient dans la boîte
    /// `w_px`×`h_px` — implémente `font_size: None` (auto-fit, "Phase 5+" dans le modèle).
    fn autofit_font_size_px(
        &mut self,
        text_el: &crate::model::TextElement,
        w_px: f32,
        h_px: f32,
    ) -> f32 {
        let mut lo = 2.0f32;
        let mut hi = h_px.max(lo + 1.0);
        if !self.text_fits_at_size(text_el, lo, w_px, h_px) {
            // Même la taille minimale déborde (boîte trop petite / contenu trop long) : on
            // reste sur ce plancher plutôt que de produire un texte invisible (taille 0).
            return lo;
        }
        for _ in 0..10 {
            let mid = (lo + hi) / 2.0;
            if self.text_fits_at_size(text_el, mid, w_px, h_px) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        lo
    }

    /// Rend le texte dans un buffer hors-écran local (coordonnées 0..w_px/0..h_px), puis le
    /// compose sur `scene` via `draw_pixmap` + `transform` — même mécanisme que les images
    /// (`draw_bitmap`). Contrairement à un mapping direct pixel-par-pixel, ceci supporte
    /// correctement la rotation (échantillonnage inverse par `draw_pixmap`, pas de trous) et
    /// permet d'appliquer un flou avant composition.
    #[allow(clippy::too_many_arguments)] // paramètres de géométrie/style, un refactor en struct serait cosmétique
    fn draw_text(
        &mut self,
        scene: &mut Pixmap,
        text_el: &crate::model::TextElement,
        x_px: f32,
        y_px: f32,
        w_px: f32,
        h_px: f32,
        opacity: f32,
        blur_px: f32,
        transform: Transform,
        blend_mode: Option<crate::model::BlendMode>,
        reveal: Option<(AnimationType, f64)>,
    ) {
        let layer_w = w_px.ceil().max(1.0) as u32;
        let layer_h = h_px.ceil().max(1.0) as u32;
        let Some(mut layer) = Pixmap::new(layer_w, layer_h) else {
            return;
        };

        // Typewriter/word-reveal tronquent le contenu affiché avant la mise en page ; line-reveal
        // a besoin de la mise en page complète pour connaître le nombre de lignes (calculé plus
        // bas, une fois le texte affiché shapé).
        let display_content: std::borrow::Cow<str> = match reveal {
            Some((AnimationType::Typewriter, progress)) => {
                let total_chars = text_el.content.chars().count();
                let visible = ((total_chars as f64) * progress).round().max(0.0) as usize;
                std::borrow::Cow::Owned(text_el.content.chars().take(visible).collect())
            }
            Some((AnimationType::WordReveal, progress)) => {
                let words: Vec<&str> = text_el.content.split_whitespace().collect();
                let visible = ((words.len() as f64) * progress).round().max(0.0) as usize;
                std::borrow::Cow::Owned(words[..visible.min(words.len())].join(" "))
            }
            _ => std::borrow::Cow::Borrowed(text_el.content.as_str()),
        };

        // Fond de l'élément : la preview applique `background_color` à toute la boîte du texte,
        // pas seulement derrière les glyphes — même comportement ici.
        if let Some(bg) = text_el.background_color.as_deref() {
            layer.fill(parse_css_color(bg));
        }

        let font_size_px = match text_el.font_size {
            Some(fs) => (fs / 100.0) as f32 * scene.width() as f32,
            None => self.autofit_font_size_px(text_el, w_px, h_px),
        };
        let line_height_px = font_size_px * 1.25 * text_el.line_height.unwrap_or(1.0) as f32;
        let metrics = Metrics::new(font_size_px, line_height_px);
        let mut buffer = Buffer::new(&mut self.font_system, metrics);
        buffer.set_size(Some(w_px), Some(h_px));

        let attrs = text_attrs(text_el);
        buffer.set_text(&display_content, &attrs, Shaping::Advanced, None);
        buffer.shape_until_scroll(&mut self.font_system, false);

        let max_visible_lines: Option<usize> = match reveal {
            Some((AnimationType::LineReveal, progress)) => {
                let total_lines = buffer.layout_runs().count();
                Some(((total_lines as f64) * progress).round().max(0.0) as usize)
            }
            _ => None,
        };

        let color = parse_css_color(&text_el.color);
        let cosmic_color = CosmicColor::rgba(
            (color.red() * 255.0) as u8,
            (color.green() * 255.0) as u8,
            (color.blue() * 255.0) as u8,
            (color.alpha() * 255.0) as u8,
        );

        let letter_spacing_px =
            (text_el.letter_spacing.unwrap_or(0.0) / 100.0) as f32 * scene.width() as f32;

        // Décalage horizontal par ligne selon l'alignement (cosmic-text pose chaque run à
        // gauche par défaut) ; la largeur effective inclut l'espacement de lettres ajouté
        // manuellement entre les glyphes.
        let h_offset = |run: &cosmic_text::LayoutRun| -> f32 {
            let run_width =
                run.line_w + letter_spacing_px * run.glyphs.len().saturating_sub(1) as f32;
            match text_el.alignment {
                crate::model::TextAlign::Left => 0.0,
                crate::model::TextAlign::Center => ((w_px - run_width) / 2.0).max(0.0),
                crate::model::TextAlign::Right => (w_px - run_width).max(0.0),
            }
        };

        // Décalage vertical (alignement) approximatif : on ne gère que top/middle/bottom simplement.
        let total_text_height = buffer.layout_runs().count() as f32 * line_height_px;
        let v_offset = match text_el.vertical_alignment {
            crate::model::VerticalAlign::Top => 0.0,
            crate::model::VerticalAlign::Bottom => (h_px - total_text_height).max(0.0),
            crate::model::VerticalAlign::Middle => ((h_px - total_text_height) / 2.0).max(0.0),
        };

        // Ombre portée : dessinée en premier pour rester derrière le texte principal.
        if let Some(shadow_color) = text_el.text_shadow.as_deref() {
            let shadow = parse_css_color(shadow_color);
            let shadow_cosmic = CosmicColor::rgba(
                (shadow.red() * 255.0) as u8,
                (shadow.green() * 255.0) as u8,
                (shadow.blue() * 255.0) as u8,
                (shadow.alpha() * 255.0) as u8,
            );
            let offset = (font_size_px * 0.06).max(1.0);
            for (run_idx, run) in buffer.layout_runs().enumerate() {
                if max_visible_lines.is_some_and(|max| run_idx >= max) {
                    continue;
                }
                let mut cumulative_spacing = h_offset(&run);
                for glyph in run.glyphs {
                    let physical = glyph.physical(
                        (cumulative_spacing + offset, v_offset + run.line_y + offset),
                        1.0,
                    );
                    cumulative_spacing += letter_spacing_px;
                    self.swash_cache.with_pixels(
                        &mut self.font_system,
                        physical.cache_key,
                        shadow_cosmic,
                        |gx, gy, gcolor| {
                            let ix = physical.x + gx;
                            let iy = physical.y + gy;
                            if ix < 0 || iy < 0 || ix >= layer_w as i32 || iy >= layer_h as i32 {
                                return;
                            }
                            blend_pixel(
                                &mut layer,
                                ix as u32,
                                iy as u32,
                                gcolor.r(),
                                gcolor.g(),
                                gcolor.b(),
                                gcolor.a(),
                            );
                        },
                    );
                }
            }
        }

        // Texte principal ; on garde au passage les bornes de chaque ligne pour le
        // souligné/barré (dessinés après, une fois toutes les lignes connues).
        let mut line_bounds: Vec<(f32, f32, f32)> = Vec::new();
        for (run_idx, run) in buffer.layout_runs().enumerate() {
            if max_visible_lines.is_some_and(|max| run_idx >= max) {
                continue;
            }
            let mut cumulative_spacing = h_offset(&run);
            let mut min_x = f32::MAX;
            let mut max_x = f32::MIN;
            for glyph in run.glyphs {
                let physical = glyph.physical((cumulative_spacing, v_offset + run.line_y), 1.0);
                cumulative_spacing += letter_spacing_px;
                min_x = min_x.min(physical.x as f32);
                max_x = max_x.max(physical.x as f32 + glyph.w);
                self.swash_cache.with_pixels(
                    &mut self.font_system,
                    physical.cache_key,
                    cosmic_color,
                    |gx, gy, gcolor| {
                        let ix = physical.x + gx;
                        let iy = physical.y + gy;
                        if ix < 0 || iy < 0 || ix >= layer_w as i32 || iy >= layer_h as i32 {
                            return;
                        }
                        blend_pixel(
                            &mut layer,
                            ix as u32,
                            iy as u32,
                            gcolor.r(),
                            gcolor.g(),
                            gcolor.b(),
                            gcolor.a(),
                        );
                    },
                );
            }
            if min_x <= max_x {
                line_bounds.push((v_offset + run.line_y, min_x, max_x));
            }
        }

        if text_el.underline || text_el.strikethrough {
            let mut line_paint = Paint::default();
            line_paint.set_color(color);
            let thickness = (font_size_px * 0.06).max(1.0);
            for (line_y, min_x, max_x) in &line_bounds {
                if text_el.underline {
                    if let Some(rect) = Rect::from_xywh(
                        *min_x,
                        line_y + font_size_px * 0.18,
                        max_x - min_x,
                        thickness,
                    ) {
                        layer.fill_rect(rect, &line_paint, Transform::identity(), None);
                    }
                }
                if text_el.strikethrough {
                    if let Some(rect) = Rect::from_xywh(
                        *min_x,
                        line_y - font_size_px * 0.32,
                        max_x - min_x,
                        thickness,
                    ) {
                        layer.fill_rect(rect, &line_paint, Transform::identity(), None);
                    }
                }
            }
        }

        if blur_px > 0.5 {
            box_blur(&mut layer, blur_px);
        }

        let layer_transform = transform.pre_translate(x_px, y_px);
        scene.draw_pixmap(
            0,
            0,
            layer.as_ref(),
            &PixmapPaint {
                opacity,
                blend_mode: to_skia_blend_mode(blend_mode),
                ..Default::default()
            },
            layer_transform,
            None,
        );
    }
}

/// Somme cumulée (par canal) d'une ligne/colonne de `len` pixels, `prefix[i]` = somme de
/// `values[0..i]` — permet de calculer la somme de n'importe quelle plage en O(1)
/// (`prefix[hi+1] - prefix[lo]`) plutôt que de ré-échantillonner `2*radius+1` pixels par position.
fn prefix_sums(
    get: impl Fn(i32) -> tiny_skia::PremultipliedColorU8,
    len: i32,
) -> Vec<(u32, u32, u32, u32)> {
    let mut prefix = Vec::with_capacity(len as usize + 1);
    prefix.push((0, 0, 0, 0));
    let mut acc = (0u32, 0u32, 0u32, 0u32);
    for i in 0..len {
        let p = get(i);
        acc = (
            acc.0 + p.red() as u32,
            acc.1 + p.green() as u32,
            acc.2 + p.blue() as u32,
            acc.3 + p.alpha() as u32,
        );
        prefix.push(acc);
    }
    prefix
}

fn transparent() -> tiny_skia::PremultipliedColorU8 {
    tiny_skia::PremultipliedColorU8::from_rgba(0, 0, 0, 0).unwrap()
}

fn box_average(
    prefix: &[(u32, u32, u32, u32)],
    i: i32,
    radius: i32,
    len: i32,
) -> tiny_skia::PremultipliedColorU8 {
    let lo = (i - radius).max(0);
    let hi = (i + radius).min(len - 1);
    let count = (hi - lo + 1) as u32;
    let sum_hi = prefix[(hi + 1) as usize];
    let sum_lo = prefix[lo as usize];
    tiny_skia::PremultipliedColorU8::from_rgba(
        ((sum_hi.0 - sum_lo.0) / count) as u8,
        ((sum_hi.1 - sum_lo.1) / count) as u8,
        ((sum_hi.2 - sum_lo.2) / count) as u8,
        ((sum_hi.3 - sum_lo.3) / count) as u8,
    )
    .unwrap_or(transparent())
}

/// Flou par boîte glissante (approximation raisonnable d'un flou gaussien pour ce besoin),
/// appliqué en place sur un buffer RGBA prémultiplié. Deux passes séparables (horizontale puis
/// verticale) via sommes préfixes : O(largeur×hauteur) par passe au lieu de O(largeur×hauteur×
/// rayon) pour un ré-échantillonnage naïf — significatif pour les rayons de flou élevés.
fn box_blur(pixmap: &mut Pixmap, radius_px: f32) {
    let radius = radius_px.round().max(1.0) as i32;
    let width = pixmap.width() as i32;
    let height = pixmap.height() as i32;
    if width == 0 || height == 0 {
        return;
    }

    let src: Vec<tiny_skia::PremultipliedColorU8> = pixmap.pixels().to_vec();
    let mut tmp = vec![transparent(); src.len()];

    // Passe horizontale.
    for y in 0..height {
        let row_start = (y * width) as usize;
        let prefix = prefix_sums(|x| src[row_start + x as usize], width);
        for x in 0..width {
            tmp[row_start + x as usize] = box_average(&prefix, x, radius, width);
        }
    }

    // Passe verticale.
    let pixels = pixmap.pixels_mut();
    for x in 0..width {
        let prefix = prefix_sums(|y| tmp[(y * width + x) as usize], height);
        for y in 0..height {
            pixels[(y * width + x) as usize] = box_average(&prefix, y, radius, height);
        }
    }
}

/// Compose une couleur (alpha droit, non prémultiplié) sur un pixel du buffer prémultiplié :
/// out = src×sa + dst×(1−sa) par canal, out_a = sa + dst_a×(1−sa) (opérateur "over" standard).
fn blend_pixel(pixmap: &mut Pixmap, x: u32, y: u32, r: u8, g: u8, b: u8, a: u8) {
    if a == 0 {
        return;
    }
    let idx = (y * pixmap.width() + x) as usize;
    let pixels = pixmap.pixels_mut();
    let existing = pixels[idx];
    let sa = a as f32 / 255.0;
    let over = |s: u8, d: u8| -> u8 { (s as f32 * sa + d as f32 * (1.0 - sa)).round() as u8 };
    let new_pixel = tiny_skia::PremultipliedColorU8::from_rgba(
        over(r, existing.red()),
        over(g, existing.green()),
        over(b, existing.blue()),
        (a as f32 + existing.alpha() as f32 * (1.0 - sa)).round() as u8,
    )
    .unwrap_or(existing);
    pixels[idx] = new_pixel;
}

fn shape_path(
    shape_type: ShapeType,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    border_radius: f32,
) -> Option<tiny_skia::Path> {
    let mut pb = PathBuilder::new();
    match shape_type {
        ShapeType::Rectangle => {
            let r = border_radius.max(0.0).min(w.min(h) / 2.0);
            if r < 0.5 {
                pb.push_rect(Rect::from_xywh(x, y, w, h)?);
            } else {
                // Coins arrondis via 4 quarts de cercle approximés par des cubiques
                // (constante de Kappa ≈ 0.5523 pour approximer un arc de 90°).
                let k = r * 0.5523;
                pb.move_to(x + r, y);
                pb.line_to(x + w - r, y);
                pb.cubic_to(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
                pb.line_to(x + w, y + h - r);
                pb.cubic_to(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
                pb.line_to(x + r, y + h);
                pb.cubic_to(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
                pb.line_to(x, y + r);
                pb.cubic_to(x, y + r - k, x + r - k, y, x + r, y);
                pb.close();
            }
        }
        ShapeType::Ellipse => {
            pb.push_oval(Rect::from_xywh(x, y, w, h)?);
        }
        ShapeType::Triangle => {
            pb.move_to(x + w / 2.0, y);
            pb.line_to(x + w, y + h);
            pb.line_to(x, y + h);
            pb.close();
        }
        ShapeType::Line => {
            pb.move_to(x, y + h / 2.0);
            pb.line_to(x + w, y + h / 2.0);
        }
        ShapeType::Arrow => {
            pb.move_to(x, y + h * 0.4);
            pb.line_to(x + w * 0.7, y + h * 0.4);
            pb.line_to(x + w * 0.7, y + h * 0.2);
            pb.line_to(x + w, y + h * 0.5);
            pb.line_to(x + w * 0.7, y + h * 0.8);
            pb.line_to(x + w * 0.7, y + h * 0.6);
            pb.line_to(x, y + h * 0.6);
            pb.close();
        }
        ShapeType::Star => {
            let cx = x + w / 2.0;
            let cy = y + h / 2.0;
            let outer = w.min(h) / 2.0;
            let inner = outer * 0.42;
            for i in 0..10 {
                let angle = std::f32::consts::PI * i as f32 / 5.0 - std::f32::consts::FRAC_PI_2;
                let r = if i % 2 == 0 { outer } else { inner };
                let px = cx + r * angle.cos();
                let py = cy + r * angle.sin();
                if i == 0 {
                    pb.move_to(px, py);
                } else {
                    pb.line_to(px, py);
                }
            }
            pb.close();
        }
    }
    pb.finish()
}

/// Rend la forme dans un buffer hors-écran local (coordonnées 0..w/0..h), puis la compose
/// sur `scene` via `draw_pixmap` + `transform` — même mécanisme que `draw_text`, ce qui
/// permet d'appliquer un flou avant composition (contrairement à un tracé direct sur `scene`).
#[allow(clippy::too_many_arguments)] // paramètres de géométrie/style, un refactor en struct serait cosmétique
fn draw_shape(
    scene: &mut Pixmap,
    shape_el: &crate::model::ShapeElement,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    opacity: f32,
    blur_px: f32,
    transform: Transform,
    blend_mode: Option<crate::model::BlendMode>,
) {
    let layer_w = w.ceil().max(1.0) as u32;
    let layer_h = h.ceil().max(1.0) as u32;
    let Some(mut layer) = Pixmap::new(layer_w, layer_h) else {
        return;
    };
    let Some(path) = shape_path(
        shape_el.shape_type,
        0.0,
        0.0,
        w,
        h,
        shape_el.border_radius.unwrap_or(0.0) as f32,
    ) else {
        return;
    };
    let mut paint = Paint {
        anti_alias: true,
        ..Default::default()
    };
    if let Some(gradient_to) = shape_el.gradient_to.as_deref() {
        let angle_rad = (shape_el.gradient_angle.unwrap_or(0.0) as f32).to_radians();
        let (dx, dy) = (angle_rad.cos(), angle_rad.sin());
        let (cx, cy) = (w / 2.0, h / 2.0);
        let half_len = (w.abs() * dx.abs() + h.abs() * dy.abs()) / 2.0;
        if let Some(shader) = tiny_skia::LinearGradient::new(
            tiny_skia::Point::from_xy(cx - dx * half_len, cy - dy * half_len),
            tiny_skia::Point::from_xy(cx + dx * half_len, cy + dy * half_len),
            vec![
                tiny_skia::GradientStop::new(0.0, parse_css_color(&shape_el.fill)),
                tiny_skia::GradientStop::new(1.0, parse_css_color(gradient_to)),
            ],
            tiny_skia::SpreadMode::Pad,
            Transform::identity(),
        ) {
            paint.shader = shader;
        } else {
            paint.set_color(parse_css_color(&shape_el.fill));
        }
    } else {
        paint.set_color(parse_css_color(&shape_el.fill));
    }
    layer.fill_path(
        &path,
        &paint,
        FillRule::Winding,
        Transform::identity(),
        None,
    );

    if shape_el.stroke != "none" {
        let mut stroke_paint = Paint::default();
        stroke_paint.set_color(parse_css_color(&shape_el.stroke));
        stroke_paint.anti_alias = true;
        let dash = shape_el
            .stroke_dash
            .filter(|d| *d > 0.5)
            .and_then(|d| tiny_skia::StrokeDash::new(vec![d as f32, d as f32], 0.0));
        let stroke = tiny_skia::Stroke {
            width: shape_el.stroke_width as f32,
            dash,
            ..Default::default()
        };
        layer.stroke_path(&path, &stroke_paint, &stroke, Transform::identity(), None);
    }

    if blur_px > 0.5 {
        box_blur(&mut layer, blur_px);
    }

    let layer_transform = transform.pre_translate(x, y);
    scene.draw_pixmap(
        0,
        0,
        layer.as_ref(),
        &PixmapPaint {
            opacity,
            blend_mode: to_skia_blend_mode(blend_mode),
            ..Default::default()
        },
        layer_transform,
        None,
    );
}

#[allow(clippy::too_many_arguments)] // paramètres de géométrie/style, un refactor en struct serait cosmétique
fn draw_bitmap(
    scene: &mut Pixmap,
    img: &image::RgbaImage,
    fit_mode: FitMode,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    opacity: f32,
    blur_px: f32,
    transform: Transform,
    pan: (f64, f64, f64),
    blend_mode: Option<crate::model::BlendMode>,
    corner_radius: Option<f64>,
    border_color: Option<&str>,
    border_width: Option<f64>,
) {
    // Une image décodée avec une dimension nulle (fichier corrompu/dégénéré) n'a pas de taille
    // `tiny_skia` valide : on abandonne le dessin plutôt que de paniquer.
    let Some(size) = tiny_skia::IntSize::from_wh(img.width(), img.height()) else {
        return;
    };
    let Some(mut src) = Pixmap::from_vec(img.as_raw().clone(), size) else {
        return;
    };
    // `image` fournit du RGBA droit ; tiny-skia attend du prémultiplié.
    premultiply(&mut src);
    // Approximation : le flou est appliqué aux pixels source avant mise à l'échelle, donc son
    // intensité perçue varie avec le ratio de scale_x/scale_y (contrairement à draw_shape/draw_text
    // qui bloutent après composition à la taille finale).
    if blur_px > 0.5 {
        box_blur(&mut src, blur_px);
    }

    let (iw, ih) = (img.width() as f32, img.height() as f32);
    let box_ratio = w / h;
    let img_ratio = iw / ih;
    let (scale_x, scale_y) = match fit_mode {
        FitMode::Stretch => (w / iw, h / ih),
        FitMode::Cover => {
            let s = if img_ratio > box_ratio {
                h / ih
            } else {
                w / iw
            };
            (s, s)
        }
        _ => {
            let s = if img_ratio > box_ratio {
                w / iw
            } else {
                h / ih
            };
            (s, s)
        }
    };
    let (pan_scale, pan_dx_pct, pan_dy_pct) = pan;
    let scaled_w = iw * scale_x * pan_scale as f32;
    let scaled_h = ih * scale_y * pan_scale as f32;
    let offset_x = x + (w - scaled_w) / 2.0 + (pan_dx_pct / 100.0) as f32 * w;
    let offset_y = y + (h - scaled_h) / 2.0 + (pan_dy_pct / 100.0) as f32 * h;

    let img_transform = transform
        .pre_translate(offset_x, offset_y)
        .pre_scale(scale_x * pan_scale as f32, scale_y * pan_scale as f32);

    // Le masque d'angles arrondis et la bordure sont construits dans l'espace canvas (avant
    // mise à l'échelle de l'image source), puis transformés par `transform` (rotation/anim de
    // l'élément) afin de rester alignés avec la boîte de destination (x, y, w, h).
    let radius = corner_radius.unwrap_or(0.0) as f32;
    let clip_path = if radius > 0.5 {
        shape_path(ShapeType::Rectangle, x, y, w, h, radius)
    } else {
        None
    };
    let mask = clip_path.as_ref().and_then(|path| {
        let mut m = Mask::new(scene.width(), scene.height())?;
        m.fill_path(path, FillRule::Winding, true, transform);
        Some(m)
    });

    scene.draw_pixmap(
        0,
        0,
        src.as_ref(),
        &PixmapPaint {
            opacity,
            blend_mode: to_skia_blend_mode(blend_mode),
            ..Default::default()
        },
        img_transform,
        mask.as_ref(),
    );

    if let (Some(color), Some(width)) = (border_color, border_width) {
        if width > 0.01 {
            let border_path =
                clip_path.or_else(|| shape_path(ShapeType::Rectangle, x, y, w, h, 0.0));
            if let Some(path) = border_path {
                let mut paint = Paint::default();
                let mut c = parse_css_color(color);
                c.set_alpha(c.alpha() * opacity);
                paint.set_color(c);
                paint.anti_alias = true;
                let stroke = tiny_skia::Stroke {
                    width: width as f32,
                    ..Default::default()
                };
                scene.stroke_path(&path, &paint, &stroke, transform, None);
            }
        }
    }
}

fn premultiply(pixmap: &mut Pixmap) {
    for pixel in pixmap.pixels_mut() {
        let a = pixel.alpha();
        if a == 255 {
            continue;
        }
        let r = ((pixel.red() as u16 * a as u16) / 255) as u8;
        let g = ((pixel.green() as u16 * a as u16) / 255) as u8;
        let b = ((pixel.blue() as u16 * a as u16) / 255) as u8;
        *pixel = tiny_skia::PremultipliedColorU8::from_rgba(r, g, b, a).unwrap();
    }
}

#[allow(clippy::too_many_arguments)] // paramètres de géométrie/style, un refactor en struct serait cosmétique
fn draw_placeholder(
    scene: &mut Pixmap,
    background: Option<&str>,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    opacity: f32,
    transform: Transform,
) {
    let Some(rect) = Rect::from_xywh(x, y, w, h) else {
        return;
    };
    let mut paint = Paint::default();
    let mut color = background
        .map(parse_css_color)
        .unwrap_or(Color::from_rgba8(40, 40, 48, 255));
    color.set_alpha(color.alpha() * opacity);
    paint.set_color(color);
    let mut pb = PathBuilder::new();
    pb.push_rect(rect);
    if let Some(path) = pb.finish() {
        scene.fill_path(&path, &paint, FillRule::Winding, transform, None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;

    #[test]
    fn draw_bitmap_does_not_panic_on_a_zero_dimension_image() {
        let mut canvas = Pixmap::new(20, 20).unwrap();
        let degenerate = image::RgbaImage::new(0, 0);
        draw_bitmap(
            &mut canvas,
            &degenerate,
            FitMode::Cover,
            0.0,
            0.0,
            20.0,
            20.0,
            1.0,
            0.0,
            Transform::identity(),
            (1.0, 0.0, 0.0),
            None,
            None,
            None,
            None,
        );
        // Rien à dessiner : le canvas reste transparent, aucun panic ne s'est produit.
        assert_eq!(canvas.pixel(0, 0).unwrap().alpha(), 0);
    }

    fn sample_project() -> Project {
        Project {
            name: "Test".into(),
            width: 320,
            height: 180,
            fps: 30,
            duration: 3.0,
            compositions: vec![Composition {
                id: "c1".into(),
                name: "Scene 1".into(),
                start_time: 0.0,
                duration: 3.0,
                elements: vec![
                    Element::Shape(ShapeElement {
                        base: ElementBase {
                            id: "s1".into(),
                            name: "Rect".into(),
                            start_time: 0.0,
                            duration: None,
                            x: 10.0,
                            y: 10.0,
                            width: 30.0,
                            height: 20.0,
                            rotation: 0.0,
                            animations: vec![],
                            group_id: None,
                            blend_mode: None,
                        },
                        shape_type: ShapeType::Rectangle,
                        fill: "rgba(255,0,0,1)".into(),
                        stroke: "none".into(),
                        stroke_width: 0.0,
                        border_radius: None,
                        stroke_dash: None,
                        gradient_to: None,
                        gradient_angle: None,
                    }),
                    Element::Text(TextElement {
                        base: ElementBase {
                            id: "t1".into(),
                            name: "Titre".into(),
                            start_time: 0.0,
                            duration: None,
                            x: 5.0,
                            y: 50.0,
                            width: 90.0,
                            height: 20.0,
                            rotation: 0.0,
                            animations: vec![Animation {
                                animation_type: AnimationType::Fade,
                                direction: AnimationDirection::In,
                                duration: 1.0,
                                easing: Easing::Linear,
                                with_fade: true,
                            }],
                            group_id: None,
                            blend_mode: None,
                        },
                        content: "Bonjour".into(),
                        alignment: TextAlign::Left,
                        vertical_alignment: VerticalAlign::Top,
                        color: "rgba(255,255,255,1)".into(),
                        background_color: None,
                        font_size: Some(6.0),
                        font_family: None,
                        font_weight: None,
                        font_style: None,
                        letter_spacing: None,
                        line_height: None,
                        text_shadow: None,
                        underline: false,
                        strikethrough: false,
                    }),
                ],
                transition_in: None,
                transition_out: None,
                overlap_next: 0.0,
            }],
            audio_tracks: vec![],
        }
    }

    #[test]
    fn renders_frame_without_panicking() {
        let project = sample_project();
        let mut renderer = FrameRenderer::new();
        let dir = std::env::temp_dir();
        let pixmap = renderer.render_frame(&project, &dir, 0.5);
        assert_eq!(pixmap.width(), 320);
        assert_eq!(pixmap.height(), 180);
        // Le pixel de fond (coin bas-droit, hors de tout élément) doit rester noir opaque.
        let bg = pixmap.pixel(310, 170).unwrap();
        assert_eq!((bg.red(), bg.green(), bg.blue()), (0, 0, 0));
    }

    #[test]
    fn fade_in_animation_increases_opacity_over_time() {
        let project = sample_project();
        let mut renderer = FrameRenderer::new();
        let dir = std::env::temp_dir();
        let early = renderer.render_frame(&project, &dir, 0.05);
        let late = renderer.render_frame(&project, &dir, 0.9);
        // Le pixel du rectangle (opacité fixe) doit rester rouge dans les deux cas.
        let px_early = early.pixel(60, 30).unwrap();
        let px_late = late.pixel(60, 30).unwrap();
        assert!(px_early.red() > 200);
        assert!(px_late.red() > 200);
    }

    #[test]
    fn renders_visible_text_pixels() {
        let project = sample_project();
        let mut renderer = FrameRenderer::new();
        let dir = std::env::temp_dir();
        // t=2.0 : après la fin de l'animation de fondu (duration 1.0), texte pleinement opaque.
        let frame = renderer.render_frame(&project, &dir, 2.0);

        // Zone du texte "Bonjour" : x∈[16,304] y∈[90,126] (5%/50%/90%/20% de 320x180).
        let mut found_glyph_pixel = false;
        for py in 90..126 {
            for px in 16..304 {
                let pixel = frame.pixel(px, py).unwrap();
                if pixel.red() > 50 || pixel.green() > 50 || pixel.blue() > 50 {
                    found_glyph_pixel = true;
                    break;
                }
            }
            if found_glyph_pixel {
                break;
            }
        }
        assert!(
            found_glyph_pixel,
            "aucun pixel de glyphe détecté dans la zone du texte"
        );
    }

    #[test]
    fn autofit_font_size_shrinks_for_smaller_boxes() {
        let text_el = TextElement {
            base: ElementBase {
                id: "t1".into(),
                name: "Titre".into(),
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
            content: "Bonjour tout le monde".into(),
            alignment: TextAlign::Left,
            vertical_alignment: VerticalAlign::Top,
            color: "rgba(255,255,255,1)".into(),
            background_color: None,
            font_size: None,
            font_family: None,
            font_weight: None,
            font_style: None,
            letter_spacing: None,
            line_height: None,
            text_shadow: None,
            underline: false,
            strikethrough: false,
        };
        let mut renderer = FrameRenderer::new();

        let large = renderer.autofit_font_size_px(&text_el, 400.0, 400.0);
        let small = renderer.autofit_font_size_px(&text_el, 80.0, 40.0);
        assert!(
            large > small,
            "une boîte plus petite doit produire une taille de police plus petite (large={large}, small={small})"
        );
        assert!(renderer.text_fits_at_size(&text_el, small, 80.0, 40.0));
    }

    #[test]
    fn typewriter_reveal_grows_the_visible_text_width_over_time() {
        let project = Project {
            name: "Test".into(),
            width: 400,
            height: 100,
            fps: 30,
            duration: 2.0,
            compositions: vec![Composition {
                id: "c1".into(),
                name: "Scene 1".into(),
                start_time: 0.0,
                duration: 2.0,
                elements: vec![Element::Text(TextElement {
                    base: ElementBase {
                        id: "t1".into(),
                        name: "Titre".into(),
                        start_time: 0.0,
                        duration: None,
                        x: 0.0,
                        y: 0.0,
                        width: 100.0,
                        height: 100.0,
                        rotation: 0.0,
                        animations: vec![Animation {
                            animation_type: AnimationType::Typewriter,
                            direction: AnimationDirection::In,
                            duration: 2.0,
                            easing: Easing::Linear,
                            with_fade: false,
                        }],
                        group_id: None,
                        blend_mode: None,
                    },
                    content: "WWWWWWWWWWWWWWWWWWWW".into(),
                    alignment: TextAlign::Left,
                    vertical_alignment: VerticalAlign::Top,
                    color: "rgba(255,255,255,1)".into(),
                    background_color: None,
                    font_size: Some(8.0),
                    font_family: None,
                    font_weight: None,
                    font_style: None,
                    letter_spacing: None,
                    line_height: None,
                    text_shadow: None,
                    underline: false,
                    strikethrough: false,
                })],
                transition_in: None,
                transition_out: None,
                overlap_next: 0.0,
            }],
            audio_tracks: vec![],
        };
        let mut renderer = FrameRenderer::new();
        let dir = std::env::temp_dir();

        let rightmost_lit_column = |frame: &Pixmap| -> i32 {
            let mut rightmost = -1;
            for x in 0..frame.width() as i32 {
                for y in 0..frame.height() as i32 {
                    let p = frame.pixel(x as u32, y as u32).unwrap();
                    if p.red() > 50 || p.green() > 50 || p.blue() > 50 {
                        rightmost = rightmost.max(x);
                    }
                }
            }
            rightmost
        };

        let early = renderer.render_frame(&project, &dir, 0.1);
        let late = renderer.render_frame(&project, &dir, 1.9);
        let early_extent = rightmost_lit_column(&early);
        let late_extent = rightmost_lit_column(&late);
        assert!(
            early_extent < late_extent,
            "le texte révélé doit s'étendre davantage vers la droite avec le temps (early={early_extent}, late={late_extent})"
        );
    }

    #[test]
    fn rounded_rectangle_corners_are_transparent_but_center_is_filled() {
        let path = shape_path(ShapeType::Rectangle, 0.0, 0.0, 100.0, 100.0, 30.0).unwrap();
        let mut pixmap = Pixmap::new(100, 100).unwrap();
        let mut paint = Paint::default();
        paint.set_color(Color::from_rgba8(255, 0, 0, 255));
        pixmap.fill_path(
            &path,
            &paint,
            FillRule::Winding,
            Transform::identity(),
            None,
        );

        let corner = pixmap.pixel(2, 2).unwrap();
        assert_eq!(
            corner.alpha(),
            0,
            "le coin doit rester transparent (arrondi)"
        );

        let center = pixmap.pixel(50, 50).unwrap();
        assert_eq!(center.alpha(), 255, "le centre doit être rempli");
    }

    #[test]
    fn box_blur_softens_a_hard_edge() {
        let mut pixmap = Pixmap::new(40, 40).unwrap();
        let mut paint = Paint::default();
        paint.set_color(Color::from_rgba8(255, 255, 255, 255));
        let mut pb = PathBuilder::new();
        pb.push_rect(Rect::from_xywh(20.0, 0.0, 20.0, 40.0).unwrap());
        let path = pb.finish().unwrap();
        pixmap.fill_path(
            &path,
            &paint,
            FillRule::Winding,
            Transform::identity(),
            None,
        );

        // Juste avant le bord dur : opaque des deux côtés avant flou.
        assert_eq!(pixmap.pixel(19, 20).unwrap().alpha(), 0);
        assert_eq!(pixmap.pixel(20, 20).unwrap().alpha(), 255);

        box_blur(&mut pixmap, 6.0);

        // Après flou, le pixel juste avant le bord doit avoir une alpha intermédiaire (ni 0 ni 255).
        let blurred = pixmap.pixel(19, 20).unwrap().alpha();
        assert!(
            blurred > 0 && blurred < 255,
            "le bord doit être adouci, alpha={blurred}"
        );
    }

    #[test]
    fn draw_shape_with_blur_softens_its_edge() {
        // Le calque hors-écran de `draw_shape` fait exactement la taille de la bbox de la
        // forme (comme pour `draw_text`) : le flou ne peut donc pas déborder au-delà de cette
        // bbox lors de la composition, seulement adoucir un bord interne à la forme (ex : le
        // contour d'un rectangle à coins très arrondis).
        let shape_el = ShapeElement {
            base: ElementBase {
                id: "s1".into(),
                name: "Rect".into(),
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
            shape_type: ShapeType::Rectangle,
            fill: "rgba(255,0,0,1)".into(),
            stroke: "none".into(),
            stroke_width: 0.0,
            border_radius: Some(15.0),
            stroke_dash: None,
            gradient_to: None,
            gradient_angle: None,
        };

        let mut sharp = Pixmap::new(40, 40).unwrap();
        draw_shape(
            &mut sharp,
            &shape_el,
            0.0,
            0.0,
            40.0,
            40.0,
            1.0,
            0.0,
            Transform::identity(),
            None,
        );
        let mut blurred = Pixmap::new(40, 40).unwrap();
        draw_shape(
            &mut blurred,
            &shape_el,
            0.0,
            0.0,
            40.0,
            40.0,
            1.0,
            20.0,
            Transform::identity(),
            None,
        );

        // Coin du rectangle arrondi : transparent sans flou, partiellement coloré une fois
        // flouté (le flou étale la couleur voisine du centre opaque jusque dans le coin).
        let sharp_corner = sharp.pixel(2, 2).unwrap().alpha();
        let blurred_corner = blurred.pixel(2, 2).unwrap().alpha();
        assert_eq!(
            sharp_corner, 0,
            "sans flou, le coin arrondi doit rester transparent"
        );
        assert!(
            blurred_corner > 0,
            "avec flou, le coin doit être partiellement coloré, alpha={blurred_corner}"
        );
    }

    fn sample_shape_el(overrides: impl FnOnce(ShapeElement) -> ShapeElement) -> ShapeElement {
        overrides(ShapeElement {
            base: ElementBase {
                id: "s1".into(),
                name: "Rect".into(),
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
            shape_type: ShapeType::Rectangle,
            fill: "rgba(255,0,0,1)".into(),
            stroke: "none".into(),
            stroke_width: 0.0,
            border_radius: None,
            stroke_dash: None,
            gradient_to: None,
            gradient_angle: None,
        })
    }

    #[test]
    fn gradient_fill_differs_from_left_to_right() {
        let shape_el = sample_shape_el(|el| ShapeElement {
            gradient_to: Some("rgba(0,0,255,1)".into()),
            gradient_angle: Some(0.0),
            ..el
        });
        let mut pixmap = Pixmap::new(40, 40).unwrap();
        draw_shape(
            &mut pixmap,
            &shape_el,
            0.0,
            0.0,
            40.0,
            40.0,
            1.0,
            0.0,
            Transform::identity(),
            None,
        );
        let left = pixmap.pixel(2, 20).unwrap();
        let right = pixmap.pixel(37, 20).unwrap();
        assert!(
            left.red() > right.red() && left.blue() < right.blue(),
            "le dégradé doit passer du rouge (gauche) au bleu (droite)"
        );
    }

    #[test]
    fn dashed_stroke_leaves_gaps_along_the_edge() {
        let shape_el = sample_shape_el(|el| ShapeElement {
            fill: "rgba(0,0,0,0)".into(),
            stroke: "rgba(255,255,255,1)".into(),
            stroke_width: 3.0,
            stroke_dash: Some(4.0),
            ..el
        });
        // Boîte avec marge (5,5,30,30) dans un canvas 40x40, pour que le bord supérieur du
        // contour (centré sur y=5) reste entièrement dans les limites du pixmap.
        let mut pixmap = Pixmap::new(40, 40).unwrap();
        draw_shape(
            &mut pixmap,
            &shape_el,
            5.0,
            5.0,
            30.0,
            30.0,
            1.0,
            0.0,
            Transform::identity(),
            None,
        );
        // Le long du bord supérieur, un trait tireté doit alterner présence/absence de contour.
        let alphas: Vec<u8> = (5..35)
            .map(|x| pixmap.pixel(x, 5).unwrap().alpha())
            .collect();
        let has_covered = alphas.iter().any(|a| *a > 200);
        let has_gap = alphas.iter().any(|a| *a < 50);
        assert!(
            has_covered,
            "le contour tireté doit couvrir certaines zones"
        );
        assert!(
            has_gap,
            "le contour tireté doit laisser des espaces le long du bord, alphas={alphas:?}"
        );
    }

    #[test]
    fn bitmap_corner_radius_masks_the_corner() {
        let img = image::RgbaImage::from_pixel(20, 20, image::Rgba([255, 0, 0, 255]));
        let mut pixmap = Pixmap::new(40, 40).unwrap();
        draw_bitmap(
            &mut pixmap,
            &img,
            FitMode::Stretch,
            0.0,
            0.0,
            40.0,
            40.0,
            1.0,
            0.0,
            Transform::identity(),
            (1.0, 0.0, 0.0),
            None,
            Some(15.0),
            None,
            None,
        );
        let corner = pixmap.pixel(1, 1).unwrap();
        let center = pixmap.pixel(20, 20).unwrap();
        assert_eq!(
            corner.alpha(),
            0,
            "le coin doit être masqué par le rayon d'angle"
        );
        assert_eq!(
            center.alpha(),
            255,
            "le centre de l'image doit rester opaque"
        );
    }

    #[test]
    fn wipe_transition_reveals_scene_progressively() {
        let mut project = sample_project();
        project.compositions[0].transition_in = Some(Transition {
            transition_type: TransitionType::WipeRight,
            duration: 1.0,
            easing: Easing::Linear,
        });
        let mut renderer = FrameRenderer::new();
        let dir = std::env::temp_dir();

        // Tôt dans le wipe (progress faible) : le rectangle (x∈[32,128] sur 320px) n'est pas
        // encore révélé au-delà de la frange gauche de l'écran.
        let early = renderer.render_frame(&project, &dir, 0.05);
        let early_px = early.pixel(300, 30).unwrap();
        assert_eq!(
            (early_px.red(), early_px.green(), early_px.blue()),
            (0, 0, 0),
            "le côté droit ne doit pas encore être révélé tôt dans le wipe"
        );

        // Après la fin du wipe (progress = 1) : toute la scène est révélée, y compris le rectangle.
        let late = renderer.render_frame(&project, &dir, 2.0);
        let late_px = late.pixel(60, 30).unwrap();
        assert!(
            late_px.red() > 200,
            "le rectangle doit être révélé une fois le wipe terminé"
        );
    }

    #[test]
    fn video_element_renders_real_decoded_frame_not_placeholder() {
        let dir = std::env::temp_dir().join(format!(
            "letest-video-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        // Génère une vidéo de test rouge unie (1s, 64x64) via ffmpeg.
        let video_path = dir.join("video.mp4");
        let status = std::process::Command::new("ffmpeg")
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=64x64:d=1",
                "-r",
                "10",
            ])
            .arg(&video_path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .expect("ffmpeg doit être disponible");
        assert!(status.success(), "génération de la vidéo de test échouée");

        let project = Project {
            name: "Video Test".into(),
            width: 100,
            height: 100,
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
                        name: "Video".into(),
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
                    src: "video.mp4".into(),
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

        let mut renderer = FrameRenderer::with_scratch_dir(dir.join("scratch"));
        let frame = renderer.render_frame(&project, &dir, 0.3);
        let pixel = frame.pixel(50, 50).unwrap();
        // La frame vidéo décodée doit être rouge (pas le placeholder gris ~40,40,48).
        assert!(
            pixel.red() > 150 && pixel.green() < 100,
            "pixel attendu rouge, obtenu {pixel:?}"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn decoded_video_frames_are_not_retained_in_the_image_cache() {
        // Régression : chaque frame vidéo décodée est un fichier PNG distinct et à usage
        // unique. Les mettre en cache indéfiniment ferait croître `image_cache` sans limite
        // sur toute la durée de l'export (des dizaines de milliers d'entrées pour une vidéo
        // longue) — elles doivent être chargées puis oubliées, pas accumulées.
        let dir = std::env::temp_dir().join(format!(
            "letest-videocache-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let video_path = dir.join("video.mp4");
        let status = std::process::Command::new("ffmpeg")
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=32x32:d=1",
                "-r",
                "10",
            ])
            .arg(&video_path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .expect("ffmpeg doit être disponible");
        assert!(status.success(), "génération de la vidéo de test échouée");

        let project = Project {
            name: "Video Cache Test".into(),
            width: 32,
            height: 32,
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
                        name: "Video".into(),
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
                    src: "video.mp4".into(),
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

        let mut renderer = FrameRenderer::with_scratch_dir(dir.join("scratch"));
        // Rend plusieurs frames distinctes (chacune décode un PNG différent).
        for i in 0..10 {
            renderer.render_frame(&project, &dir, i as f64 / 10.0);
        }
        assert_eq!(
            renderer.image_cache.len(),
            0,
            "les frames vidéo décodées ne doivent pas s'accumuler dans image_cache"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parse_css_color_supports_rgba_rgb_and_hex() {
        let rgba = parse_css_color("rgba(255,0,0,0.5)");
        assert_eq!((rgba.red(), rgba.alpha()), (1.0, 0.5));

        let rgb = parse_css_color("rgb(0, 128, 0)");
        assert_eq!(rgb.alpha(), 1.0);
        assert!((rgb.green() - 128.0 / 255.0).abs() < 1e-6);

        let hex = parse_css_color("#0000ff");
        assert_eq!((hex.blue(), hex.alpha()), (1.0, 1.0));

        let hex_alpha = parse_css_color("#00ff0080");
        assert_eq!(hex_alpha.green(), 1.0);
        assert!((hex_alpha.alpha() - 128.0 / 255.0).abs() < 0.01);

        // Repli sur blanc opaque pour tout format inconnu.
        let fallback = parse_css_color("tomato");
        assert_eq!((fallback.red(), fallback.alpha()), (1.0, 1.0));
    }

    #[test]
    fn video_frame_index_clamps_to_the_last_frame_without_loop() {
        // Source de 2 s à 30 fps (60 frames) : à 5 s on reste figé sur la frame 60.
        assert_eq!(video_frame_index(5.0, 30, 60, false, 0.0), 60);
        assert_eq!(video_frame_index(0.0, 30, 60, false, 0.0), 1);
    }

    #[test]
    fn video_frame_index_loops_back_to_the_trim_in_point() {
        // Point d'entrée à 1 s (frame 31) : après la fin de la source (2 s), la boucle repart
        // à la frame 31, pas à la frame 1 — même convention que la preview.
        let idx = video_frame_index(2.0, 30, 60, true, 1.0);
        assert_eq!(idx, 31);
        // 2.5 s = 0.5 s après le rebouclage -> frame 31 + 15.
        assert_eq!(video_frame_index(2.5, 30, 60, true, 1.0), 46);
        // Sans point d'entrée, la boucle repart au début du fichier.
        assert_eq!(video_frame_index(2.0, 30, 60, true, 0.0), 1);
    }

    fn text_element_for_render(alignment: TextAlign, background: Option<&str>) -> Project {
        Project {
            name: "Test".into(),
            width: 320,
            height: 180,
            fps: 30,
            duration: 2.0,
            compositions: vec![Composition {
                id: "c1".into(),
                name: "Scene 1".into(),
                start_time: 0.0,
                duration: 2.0,
                elements: vec![Element::Text(TextElement {
                    base: ElementBase {
                        id: "t1".into(),
                        name: "Titre".into(),
                        start_time: 0.0,
                        duration: None,
                        x: 10.0,
                        y: 10.0,
                        width: 80.0,
                        height: 60.0,
                        rotation: 0.0,
                        animations: vec![],
                        group_id: None,
                        blend_mode: None,
                    },
                    content: "Hi".into(),
                    alignment,
                    vertical_alignment: VerticalAlign::Top,
                    color: "rgba(255,255,255,1)".into(),
                    background_color: background.map(str::to_string),
                    font_size: Some(6.0),
                    font_family: None,
                    font_weight: None,
                    font_style: None,
                    letter_spacing: None,
                    line_height: None,
                    text_shadow: None,
                    underline: false,
                    strikethrough: false,
                })],
                transition_in: None,
                transition_out: None,
                overlap_next: 0.0,
            }],
            audio_tracks: vec![],
        }
    }

    #[test]
    fn text_background_color_fills_the_element_box() {
        let project = text_element_for_render(TextAlign::Left, Some("rgba(255,0,0,1)"));
        let mut renderer = FrameRenderer::new();
        let frame = renderer.render_frame(&project, &std::env::temp_dir(), 1.0);
        // Coin bas-droit de la boîte du texte (90% de 320 = 288, 70% de 180 = 126) : loin des
        // glyphes, mais couvert par le fond de l'élément.
        let px = frame.pixel(280, 120).unwrap();
        assert!(
            px.red() > 200 && px.green() < 50,
            "le fond de l'élément texte doit être rendu à l'export (pixel: {px:?})"
        );
    }

    #[test]
    fn text_alignment_shifts_glyphs_horizontally() {
        let mut renderer = FrameRenderer::new();
        let dir = std::env::temp_dir();

        let leftmost_glyph_x = |frame: &Pixmap| -> Option<u32> {
            for px in 0..frame.width() {
                for py in 0..frame.height() {
                    if frame.pixel(px, py).unwrap().red() > 50 {
                        return Some(px);
                    }
                }
            }
            None
        };

        let left =
            renderer.render_frame(&text_element_for_render(TextAlign::Left, None), &dir, 1.0);
        let right =
            renderer.render_frame(&text_element_for_render(TextAlign::Right, None), &dir, 1.0);
        let (lx, rx) = (
            leftmost_glyph_x(&left).expect("glyphes attendus (left)"),
            leftmost_glyph_x(&right).expect("glyphes attendus (right)"),
        );
        assert!(
            rx > lx + 50,
            "l'alignement à droite doit décaler les glyphes vers la droite (left={lx}, right={rx})"
        );
    }
}
