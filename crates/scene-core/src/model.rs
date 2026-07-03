//! Modèle de données unique de light-editor-vidz : Project -> Composition -> Element.
//!
//! Un seul système de coordonnées (x/y = coin haut-gauche, width/height, rotation),
//! partagé par la preview (wasm) et l'export (natif). Pas de conversion ancre/coin
//! comme dans l'ancien projet. `x`/`y`/`width`/`height` sont exprimés en **pourcentage
//! du canvas** (0-100), pas en pixels absolus : la position reste correcte quelle que
//! soit la résolution du projet ou le niveau de zoom de l'aperçu.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Project {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub duration: f64,
    pub compositions: Vec<Composition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Composition {
    pub id: String,
    pub name: String,
    /// Recalculé automatiquement à partir des durées + overlap_next, jamais édité directement.
    pub start_time: f64,
    pub duration: f64,
    pub elements: Vec<Element>,
    /// Piste(s) audio de la scène. `AudioTrack.start_time` est relatif au début de cette
    /// composition (même convention que `ElementBase.start_time`), pas à la timeline globale.
    pub audio_tracks: Vec<AudioTrack>,
    pub transition_in: Option<Transition>,
    pub transition_out: Option<Transition>,
    /// Chevauchement temporel (secondes) avec la composition suivante, pour les fondus-enchaînés.
    pub overlap_next: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ElementBase {
    pub id: String,
    pub name: String,
    /// Temps relatif au début de la composition.
    pub start_time: f64,
    /// None = dure jusqu'à la fin de la composition.
    pub duration: Option<f64>,
    /// Pourcentage de la largeur du canvas (0-100).
    pub x: f64,
    /// Pourcentage de la hauteur du canvas (0-100).
    pub y: f64,
    /// Pourcentage de la largeur du canvas (0-100).
    pub width: f64,
    /// Pourcentage de la hauteur du canvas (0-100).
    pub height: f64,
    pub rotation: f64,
    pub animations: Vec<Animation>,
    /// Identifiant partagé par tous les éléments d'un même groupe (None = pas groupé).
    /// Sélectionner/déplacer un élément groupé agit sur tout le groupe (logique frontend
    /// uniquement, ne change rien au rendu).
    pub group_id: Option<String>,
    /// None = mode de fusion normal (source-over).
    pub blend_mode: Option<BlendMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Element {
    Text(TextElement),
    Image(ImageElement),
    Video(VideoElement),
    Shape(ShapeElement),
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TextElement {
    #[serde(flatten)]
    pub base: ElementBase,
    pub content: String,
    pub alignment: TextAlign,
    pub vertical_alignment: VerticalAlign,
    pub color: String,
    pub background_color: Option<String>,
    /// Exprimé en `cqw` (% de la largeur du canvas) pour rester proportionnel quelle
    /// que soit la résolution du projet. None = taille automatique (auto-fit : la plus grande
    /// taille qui tient dans la boîte, voir `raster::FrameRenderer::autofit_font_size_px`).
    pub font_size: Option<f64>,
    pub font_family: Option<String>,
    pub font_weight: Option<FontWeight>,
    pub font_style: Option<FontStyle>,
    /// Exprimé en `cqw` (même unité que `font_size`), peut être négatif.
    pub letter_spacing: Option<f64>,
    /// Multiplicateur de la hauteur de ligne par défaut (1.0 = valeur actuelle du moteur).
    pub line_height: Option<f64>,
    /// Couleur (rgba) de l'ombre portée du texte, décalage fixe non configurable.
    pub text_shadow: Option<String>,
    pub underline: bool,
    pub strikethrough: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ImageElement {
    #[serde(flatten)]
    pub base: ElementBase,
    pub src: String,
    pub fit_mode: FitMode,
    pub background_color: Option<String>,
    pub image_pan: Option<ImagePan>,
    pub corner_radius: Option<f64>,
    pub border_color: Option<String>,
    pub border_width: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct VideoElement {
    #[serde(flatten)]
    pub base: ElementBase,
    pub src: String,
    pub fit_mode: FitMode,
    pub background_color: Option<String>,
    pub image_pan: Option<ImagePan>,
    /// Point d'entrée (secondes) dans le fichier source.
    pub video_offset: f64,
    pub corner_radius: Option<f64>,
    pub border_color: Option<String>,
    pub border_width: Option<f64>,
    /// 0.0 à 1.0, indépendant du volume global des pistes audio.
    pub volume: f64,
    /// 1.0 = vitesse normale.
    pub playback_speed: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ShapeElement {
    #[serde(flatten)]
    pub base: ElementBase,
    pub shape_type: ShapeType,
    pub fill: String,
    pub stroke: String,
    pub stroke_width: f64,
    pub border_radius: Option<f64>,
    /// Longueur (px logiques) des tirets ; None = trait plein.
    pub stroke_dash: Option<f64>,
    /// Seconde couleur : si présente, `fill` devient un dégradé linéaire vers `gradient_to`.
    pub gradient_to: Option<String>,
    /// Degrés, 0 = gauche→droite. Ignoré si `gradient_to` est None.
    pub gradient_angle: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AudioTrack {
    pub id: String,
    pub name: String,
    pub src: String,
    /// Relatif au début de la composition qui contient cette piste (même convention que
    /// `ElementBase.start_time`).
    pub start_time: f64,
    pub duration: Option<f64>,
    pub volume: f64,
    pub audio_offset: f64,
    /// Durée (secondes) du fondu d'entrée.
    pub fade_in: f64,
    /// Durée (secondes) du fondu de sortie.
    pub fade_out: f64,
    pub muted: bool,
    /// Si au moins une piste du projet a `solo = true`, seules les pistes solo sont audibles.
    pub solo: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "kebab-case")]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Animation {
    pub animation_type: AnimationType,
    pub direction: AnimationDirection,
    pub duration: f64,
    pub easing: Easing,
    pub with_fade: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Transition {
    pub transition_type: TransitionType,
    pub duration: f64,
    pub easing: Easing,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ImagePan {
    pub pan_type: ImagePanType,
    /// 0.0 à 1.0
    pub intensity: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum ImagePanType {
    ZoomIn,
    ZoomOut,
    PanLeft,
    PanRight,
    PanUp,
    PanDown,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "kebab-case")]
pub enum FitMode {
    FitHeight,
    FitWidth,
    FitLargest,
    Cover,
    Stretch,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum ShapeType {
    Rectangle,
    Ellipse,
    Triangle,
    Line,
    Arrow,
    Star,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum TextAlign {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAlign {
    Top,
    Middle,
    Bottom,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum FontWeight {
    Normal,
    Bold,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum FontStyle {
    Normal,
    Italic,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum AnimationDirection {
    In,
    Out,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "kebab-case")]
pub enum AnimationType {
    Fade,
    SlideLeft,
    SlideRight,
    SlideUp,
    SlideDown,
    ZoomIn,
    ZoomOut,
    Rotate,
    Flip,
    Blur,
    FadeUp,
    FadeDown,
    FadeLeft,
    FadeRight,
    SkewLeft,
    SkewRight,
    Roll,
    Spin,
    Bounce,
    Drop,
    /// Réservé au texte.
    Typewriter,
    /// Réservé au texte.
    WordReveal,
    /// Réservé au texte.
    LineReveal,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "kebab-case")]
pub enum TransitionType {
    SlideLeft,
    SlideRight,
    SlideUp,
    SlideDown,
    Zoom,
    FlipH,
    FlipV,
    RotateCw,
    RotateCcw,
    Blur,
    WipeLeft,
    WipeRight,
    WipeUp,
    WipeDown,
    Fade,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "kebab-case")]
pub enum Easing {
    Linear,
    Power1In,
    Power1Out,
    Power1InOut,
    Power2In,
    Power2Out,
    Power2InOut,
    Power3In,
    Power3Out,
    Power3InOut,
    Bounce,
}

impl Element {
    pub fn base(&self) -> &ElementBase {
        match self {
            Element::Text(e) => &e.base,
            Element::Image(e) => &e.base,
            Element::Video(e) => &e.base,
            Element::Shape(e) => &e.base,
        }
    }

    pub fn base_mut(&mut self) -> &mut ElementBase {
        match self {
            Element::Text(e) => &mut e.base,
            Element::Image(e) => &mut e.base,
            Element::Video(e) => &mut e.base,
            Element::Shape(e) => &mut e.base,
        }
    }
}
