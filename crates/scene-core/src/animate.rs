//! Résolution d'animation pour l'export (rendu natif). Port Rust de `src/lib/animate.ts` —
//! les deux doivent rester en synchro jusqu'à l'unification via un pont wasm partagé.

use crate::model::{
    Animation, AnimationDirection, AnimationType, Easing, ImagePan, ImagePanType, Transition,
    TransitionType,
};

pub fn apply_ease(t: f64, easing: Easing) -> f64 {
    let c = t.clamp(0.0, 1.0);
    match easing {
        Easing::Linear => c,
        Easing::Power1In => c * c,
        Easing::Power1Out => c * (2.0 - c),
        Easing::Power1InOut => {
            if c < 0.5 {
                2.0 * c * c
            } else {
                -1.0 + (4.0 - 2.0 * c) * c
            }
        }
        Easing::Power2In => c * c * c,
        Easing::Power2Out => {
            let p = c - 1.0;
            p * p * p + 1.0
        }
        Easing::Power2InOut => {
            if c < 0.5 {
                4.0 * c * c * c
            } else {
                1.0 - (-2.0 * c + 2.0).powi(3) / 2.0
            }
        }
        Easing::Power3In => c * c * c * c,
        Easing::Power3Out => {
            let p = c - 1.0;
            1.0 - p * p * p * p
        }
        Easing::Power3InOut => {
            if c < 0.5 {
                8.0 * c * c * c * c
            } else {
                1.0 - (-2.0 * c + 2.0).powi(4) / 2.0
            }
        }
        Easing::Bounce => {
            let n1 = 7.5625;
            let d1 = 2.75;
            let mut x = c;
            if x < 1.0 / d1 {
                n1 * x * x
            } else if x < 2.0 / d1 {
                x -= 1.5 / d1;
                n1 * x * x + 0.75
            } else if x < 2.5 / d1 {
                x -= 2.25 / d1;
                n1 * x * x + 0.9375
            } else {
                x -= 2.625 / d1;
                n1 * x * x + 0.984375
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ResolvedTransform {
    pub opacity: f64,
    pub dx_pct: f64,
    pub dy_pct: f64,
    pub scale: f64,
    pub rotate_deg: f64,
    pub blur_px: f64,
}

impl Default for ResolvedTransform {
    fn default() -> Self {
        Self {
            opacity: 1.0,
            dx_pct: 0.0,
            dy_pct: 0.0,
            scale: 1.0,
            rotate_deg: 0.0,
            blur_px: 0.0,
        }
    }
}

fn shape_for(anim_type: AnimationType, p: f64) -> ResolvedTransform {
    let id = ResolvedTransform::default();
    match anim_type {
        AnimationType::Fade => ResolvedTransform { opacity: p, ..id },
        AnimationType::SlideLeft => ResolvedTransform {
            dx_pct: (1.0 - p) * 50.0,
            ..id
        },
        AnimationType::SlideRight => ResolvedTransform {
            dx_pct: -(1.0 - p) * 50.0,
            ..id
        },
        AnimationType::SlideUp => ResolvedTransform {
            dy_pct: (1.0 - p) * 50.0,
            ..id
        },
        AnimationType::SlideDown => ResolvedTransform {
            dy_pct: -(1.0 - p) * 50.0,
            ..id
        },
        AnimationType::FadeLeft => ResolvedTransform {
            opacity: p,
            dx_pct: (1.0 - p) * 30.0,
            ..id
        },
        AnimationType::FadeRight => ResolvedTransform {
            opacity: p,
            dx_pct: -(1.0 - p) * 30.0,
            ..id
        },
        AnimationType::FadeUp => ResolvedTransform {
            opacity: p,
            dy_pct: (1.0 - p) * 30.0,
            ..id
        },
        AnimationType::FadeDown => ResolvedTransform {
            opacity: p,
            dy_pct: -(1.0 - p) * 30.0,
            ..id
        },
        AnimationType::ZoomIn => ResolvedTransform {
            scale: 0.5 + 0.5 * p,
            ..id
        },
        AnimationType::ZoomOut => ResolvedTransform {
            scale: 1.5 - 0.5 * p,
            ..id
        },
        AnimationType::Rotate => ResolvedTransform {
            rotate_deg: -180.0 * (1.0 - p),
            ..id
        },
        AnimationType::Flip => ResolvedTransform {
            scale: p.max(0.02),
            ..id
        },
        AnimationType::Blur => ResolvedTransform {
            blur_px: (1.0 - p) * 12.0,
            ..id
        },
        AnimationType::Bounce => ResolvedTransform {
            scale: 0.3 + 0.7 * p,
            ..id
        },
        AnimationType::Drop => ResolvedTransform {
            opacity: p,
            dy_pct: -(1.0 - p) * 120.0,
            ..id
        },
        _ => id,
    }
}

/// `local_element_time` : temps écoulé depuis `start_time` de l'élément.
/// `active_duration` : durée totale d'activité de l'élément dans la composition.
pub fn resolve_element_animations(
    animations: &[Animation],
    local_element_time: f64,
    active_duration: f64,
) -> ResolvedTransform {
    let mut acc = ResolvedTransform::default();
    for anim in animations {
        let duration = anim.duration.max(0.01);
        let raw = match anim.direction {
            AnimationDirection::In => local_element_time / duration,
            AnimationDirection::Out => {
                (local_element_time - (active_duration - duration)) / duration
            }
        };
        let eased = apply_ease(raw.clamp(0.0, 1.0), anim.easing);
        let progress = match anim.direction {
            AnimationDirection::In => eased,
            AnimationDirection::Out => 1.0 - eased,
        };
        let clamped_progress = match anim.direction {
            AnimationDirection::In => {
                if local_element_time >= duration {
                    1.0
                } else {
                    progress
                }
            }
            AnimationDirection::Out => {
                if local_element_time <= active_duration - duration {
                    1.0
                } else {
                    progress
                }
            }
        };

        let shape = shape_for(anim.animation_type, clamped_progress);
        let is_fade_type = matches!(
            anim.animation_type,
            AnimationType::Fade
                | AnimationType::Drop
                | AnimationType::FadeUp
                | AnimationType::FadeDown
                | AnimationType::FadeLeft
                | AnimationType::FadeRight
        );
        let opacity_factor = if anim.with_fade || is_fade_type {
            shape.opacity
        } else {
            1.0
        };

        acc.opacity *= opacity_factor;
        acc.dx_pct += shape.dx_pct;
        acc.dy_pct += shape.dy_pct;
        acc.scale *= shape.scale;
        acc.rotate_deg += shape.rotate_deg;
        acc.blur_px = acc.blur_px.max(shape.blur_px);
    }
    acc
}

fn transition_shape(transition_type: TransitionType, progress: f64) -> ResolvedTransform {
    let id = ResolvedTransform::default();
    match transition_type {
        TransitionType::Fade => ResolvedTransform {
            opacity: progress,
            ..id
        },
        TransitionType::SlideLeft => ResolvedTransform {
            dx_pct: (1.0 - progress) * 100.0,
            ..id
        },
        TransitionType::SlideRight => ResolvedTransform {
            dx_pct: -(1.0 - progress) * 100.0,
            ..id
        },
        TransitionType::SlideUp => ResolvedTransform {
            dy_pct: (1.0 - progress) * 100.0,
            ..id
        },
        TransitionType::SlideDown => ResolvedTransform {
            dy_pct: -(1.0 - progress) * 100.0,
            ..id
        },
        TransitionType::Zoom => ResolvedTransform {
            opacity: progress,
            scale: 0.85 + 0.15 * progress,
            ..id
        },
        TransitionType::Blur => ResolvedTransform {
            opacity: progress,
            blur_px: (1.0 - progress) * 20.0,
            ..id
        },
        _ => id,
    }
}

pub fn resolve_composition_transition(
    transition: Option<&Transition>,
    kind: AnimationDirection,
    local_comp_time: f64,
    comp_duration: f64,
) -> ResolvedTransform {
    let Some(transition) = transition else {
        return ResolvedTransform::default();
    };
    let duration = transition.duration.max(0.01);
    let raw = match kind {
        AnimationDirection::In => {
            if local_comp_time >= duration {
                return ResolvedTransform::default();
            }
            local_comp_time / duration
        }
        AnimationDirection::Out => {
            let window_start = comp_duration - duration;
            if local_comp_time <= window_start {
                return ResolvedTransform::default();
            }
            (local_comp_time - window_start) / duration
        }
    };
    let eased = apply_ease(raw.clamp(0.0, 1.0), transition.easing);
    let progress = match kind {
        AnimationDirection::In => eased,
        AnimationDirection::Out => 1.0 - eased,
    };
    transition_shape(transition.transition_type, progress)
}

/// Ken Burns : transform continu appliqué au média sur toute sa durée active.
pub fn resolve_image_pan(
    pan: Option<&ImagePan>,
    local_element_time: f64,
    active_duration: f64,
) -> (f64, f64, f64) {
    // -> (scale, translate_x_pct, translate_y_pct)
    let Some(pan) = pan else {
        return (1.0, 0.0, 0.0);
    };
    let progress = if active_duration > 0.0 {
        (local_element_time / active_duration).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let i = pan.intensity;
    match pan.pan_type {
        ImagePanType::ZoomIn => (1.0 + i * 0.1 + i * 0.1 * progress, 0.0, 0.0),
        ImagePanType::ZoomOut => (1.0 + i * 0.2 - i * 0.1 * progress, 0.0, 0.0),
        ImagePanType::PanLeft => (1.0 + i * 0.15, i * 8.0 * (1.0 - 2.0 * progress), 0.0),
        ImagePanType::PanRight => (1.0 + i * 0.15, -i * 8.0 * (1.0 - 2.0 * progress), 0.0),
        ImagePanType::PanUp => (1.0 + i * 0.15, 0.0, i * 8.0 * (1.0 - 2.0 * progress)),
        ImagePanType::PanDown => (1.0 + i * 0.15, 0.0, -i * 8.0 * (1.0 - 2.0 * progress)),
    }
}
