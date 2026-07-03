//! Résolution d'animation pour l'export (rendu natif). Port Rust de `src/lib/animate.ts`.
//!
//! Duplication assumée (pas de pont wasm) : ce calcul est appelé à chaque frame pour chaque
//! élément pendant la preview temps réel, où le coût de sérialisation JSON d'un pont wasm
//! dépasserait le gain (le calcul lui-même est trivial). Le risque réel de la duplication —
//! une divergence silencieuse entre les deux implémentations — est couvert par
//! `crates/scene-core/tests/golden_fixture.rs` et `src/lib/animateGolden.test.ts`, qui
//! valident les deux implémentations contre la même fixture de référence
//! (`fixtures/animation-golden.json`).

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

#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct ResolvedTransform {
    pub opacity: f64,
    pub dx_pct: f64,
    pub dy_pct: f64,
    pub scale: f64,
    pub rotate_deg: f64,
    pub skew_deg: f64,
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
            skew_deg: 0.0,
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
        AnimationType::SkewLeft => ResolvedTransform {
            skew_deg: -20.0 * (1.0 - p),
            ..id
        },
        AnimationType::SkewRight => ResolvedTransform {
            skew_deg: 20.0 * (1.0 - p),
            ..id
        },
        AnimationType::Roll => ResolvedTransform {
            rotate_deg: -360.0 * (1.0 - p),
            dx_pct: (1.0 - p) * 40.0,
            ..id
        },
        AnimationType::Spin => ResolvedTransform {
            rotate_deg: -720.0 * (1.0 - p),
            scale: p.max(0.02),
            ..id
        },
        _ => id,
    }
}

/// Progression (0..1) d'une animation individuelle sur sa fenêtre in/out, easing appliqué.
/// Factorisé hors de `resolve_element_animations` car aussi utilisé par `resolve_text_reveal`
/// (typewriter/word-reveal/line-reveal), qui a besoin de la progression brute plutôt que
/// d'une `ResolvedTransform`.
fn animation_progress(anim: &Animation, local_element_time: f64, active_duration: f64) -> f64 {
    let duration = anim.duration.max(0.01);
    let raw = match anim.direction {
        AnimationDirection::In => local_element_time / duration,
        AnimationDirection::Out => (local_element_time - (active_duration - duration)) / duration,
    };
    let eased = apply_ease(raw.clamp(0.0, 1.0), anim.easing);
    let progress = match anim.direction {
        AnimationDirection::In => eased,
        AnimationDirection::Out => 1.0 - eased,
    };
    match anim.direction {
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
        let clamped_progress = animation_progress(anim, local_element_time, active_duration);
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
        acc.skew_deg += shape.skew_deg;
        acc.blur_px = acc.blur_px.max(shape.blur_px);
    }
    acc
}

/// Animation de révélation de texte (typewriter/word-reveal/line-reveal), réservée au texte et
/// non exprimable via `ResolvedTransform` (une transform affine) : le rendu doit savoir combien
/// de caractères/mots/lignes afficher, pas juste une opacité/position. Retourne le premier type
/// de révélation trouvé parmi les animations de l'élément, avec sa progression (0..1).
pub fn resolve_text_reveal(
    animations: &[Animation],
    local_element_time: f64,
    active_duration: f64,
) -> Option<(AnimationType, f64)> {
    animations.iter().find_map(|anim| {
        matches!(
            anim.animation_type,
            AnimationType::Typewriter | AnimationType::WordReveal | AnimationType::LineReveal
        )
        .then(|| {
            (
                anim.animation_type,
                animation_progress(anim, local_element_time, active_duration),
            )
        })
    })
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
        TransitionType::FlipH | TransitionType::FlipV => ResolvedTransform {
            opacity: progress,
            scale: progress.max(0.02),
            ..id
        },
        TransitionType::RotateCw => ResolvedTransform {
            opacity: progress,
            rotate_deg: 360.0 * (1.0 - progress),
            ..id
        },
        TransitionType::RotateCcw => ResolvedTransform {
            opacity: progress,
            rotate_deg: -360.0 * (1.0 - progress),
            ..id
        },
        // Les wipes ne sont pas exprimables via une transform affine : ils sont résolus
        // séparément par `resolve_wipe` et appliqués comme un masque de clip (voir raster.rs).
        _ => id,
    }
}

/// Progression (0..1) et type de wipe actif pour la transition donnée, si c'en est un.
/// Les wipes (balayage à bord dur) ne peuvent pas s'exprimer via `ResolvedTransform` (une
/// transform affine) : ils sont appliqués comme un masque de clip rectangulaire côté rendu.
pub fn resolve_wipe(
    transition: Option<&Transition>,
    kind: AnimationDirection,
    local_comp_time: f64,
    comp_duration: f64,
) -> Option<(TransitionType, f64)> {
    let transition = transition?;
    let is_wipe = matches!(
        transition.transition_type,
        TransitionType::WipeLeft
            | TransitionType::WipeRight
            | TransitionType::WipeUp
            | TransitionType::WipeDown
    );
    if !is_wipe {
        return None;
    }
    let duration = transition.duration.max(0.01);
    let raw = match kind {
        AnimationDirection::In => {
            if local_comp_time >= duration {
                return None;
            }
            local_comp_time / duration
        }
        AnimationDirection::Out => {
            let window_start = comp_duration - duration;
            if local_comp_time <= window_start {
                return None;
            }
            (local_comp_time - window_start) / duration
        }
    };
    let eased = apply_ease(raw.clamp(0.0, 1.0), transition.easing);
    let progress = match kind {
        AnimationDirection::In => eased,
        AnimationDirection::Out => 1.0 - eased,
    };
    Some((transition.transition_type, progress))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn anim(animation_type: AnimationType, direction: AnimationDirection) -> Animation {
        Animation {
            animation_type,
            direction,
            duration: 1.0,
            easing: Easing::Linear,
            with_fade: false,
        }
    }

    #[test]
    fn skew_animations_produce_a_non_zero_skew_that_settles_to_zero() {
        let mid = resolve_element_animations(
            &[anim(AnimationType::SkewLeft, AnimationDirection::In)],
            0.5,
            2.0,
        );
        assert_ne!(mid.skew_deg, 0.0);
        let settled = resolve_element_animations(
            &[anim(AnimationType::SkewLeft, AnimationDirection::In)],
            2.0,
            2.0,
        );
        assert_eq!(settled.skew_deg, 0.0);
    }

    #[test]
    fn roll_and_spin_rotate_and_settle() {
        for t in [AnimationType::Roll, AnimationType::Spin] {
            let mid = resolve_element_animations(&[anim(t, AnimationDirection::In)], 0.5, 2.0);
            assert_ne!(mid.rotate_deg, 0.0, "{t:?} should rotate mid-animation");
            let settled = resolve_element_animations(&[anim(t, AnimationDirection::In)], 2.0, 2.0);
            assert_eq!(
                settled.rotate_deg, 0.0,
                "{t:?} should settle to no rotation"
            );
        }
    }

    #[test]
    fn flip_and_rotate_transitions_are_no_longer_identity() {
        for t in [
            TransitionType::FlipH,
            TransitionType::FlipV,
            TransitionType::RotateCw,
            TransitionType::RotateCcw,
        ] {
            let transition = Transition {
                transition_type: t,
                duration: 1.0,
                easing: Easing::Linear,
            };
            let shape =
                resolve_composition_transition(Some(&transition), AnimationDirection::In, 0.5, 2.0);
            let id = ResolvedTransform::default();
            assert!(
                shape.rotate_deg != id.rotate_deg || shape.scale != id.scale,
                "{t:?} mid-transition should differ from identity"
            );
        }
    }

    #[test]
    fn resolve_wipe_only_matches_wipe_transitions() {
        let wipe = Transition {
            transition_type: TransitionType::WipeLeft,
            duration: 1.0,
            easing: Easing::Linear,
        };
        let result = resolve_wipe(Some(&wipe), AnimationDirection::In, 0.5, 2.0);
        assert!(matches!(result, Some((TransitionType::WipeLeft, p)) if p > 0.0 && p < 1.0));

        let fade = Transition {
            transition_type: TransitionType::Fade,
            duration: 1.0,
            easing: Easing::Linear,
        };
        assert!(resolve_wipe(Some(&fade), AnimationDirection::In, 0.5, 2.0).is_none());
        assert!(resolve_wipe(None, AnimationDirection::In, 0.5, 2.0).is_none());
    }

    #[test]
    fn resolve_text_reveal_finds_the_first_reveal_type_animation() {
        let animations = [
            anim(AnimationType::Fade, AnimationDirection::In),
            anim(AnimationType::Typewriter, AnimationDirection::In),
        ];
        let result = resolve_text_reveal(&animations, 0.5, 2.0);
        assert!(matches!(result, Some((AnimationType::Typewriter, p)) if (p - 0.5).abs() < 0.01));
    }

    #[test]
    fn resolve_text_reveal_is_none_without_a_reveal_animation() {
        let animations = [anim(AnimationType::Fade, AnimationDirection::In)];
        assert!(resolve_text_reveal(&animations, 0.5, 2.0).is_none());
    }
}
