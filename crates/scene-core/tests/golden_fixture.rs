//! Fixture de référence croisée Rust/TS pour la logique dupliquée volontairement entre
//! `scene-core` (export natif) et `src/lib/animate.ts` + `src/lib/timeline.ts` (preview live) —
//! voir la doc de `scene_core::animate` pour la justification (pas de pont wasm sur ce chemin
//! chaud). Ce test régénère la fixture en mémoire à partir des fonctions Rust publiques et la
//! compare au fichier committé `fixtures/animation-golden.json` : toute dérive du côté Rust est
//! détectée ici. Le côté TS est validé par `src/lib/animateGolden.test.ts` /
//! `src/lib/timelineGolden.test.ts`, qui chargent la même fixture et vérifient que
//! `resolveElementAnimations`/`resolveCompositionTransition`/`resolveWipeProgress`/`applyEase`/
//! `recomputeStartTimes` produisent des valeurs identiques (aux arrondis flottants près).
//!
//! Pour régénérer intentionnellement la fixture après un changement de comportement assumé :
//! `cargo test -p scene-core --test golden_fixture -- --ignored write_golden_fixture`.

use scene_core::animate::{
    apply_ease, resolve_composition_transition, resolve_element_animations, resolve_wipe,
    ResolvedTransform,
};
use scene_core::model::{
    Animation, AnimationDirection, AnimationType, Composition, Easing, Element, Project,
    Transition, TransitionType,
};
use scene_core::timeline::recompute_start_times;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
struct EasingCase {
    easing: Easing,
    t: f64,
    expected: f64,
}

#[derive(Serialize)]
struct ElementAnimationCase {
    animations: Vec<Animation>,
    local_element_time: f64,
    active_duration: f64,
    expected: ResolvedTransform,
}

#[derive(Serialize)]
struct CompositionTransitionCase {
    transition: Transition,
    kind: AnimationDirection,
    local_comp_time: f64,
    comp_duration: f64,
    expected: ResolvedTransform,
}

#[derive(Serialize)]
struct WipeResult {
    r#type: TransitionType,
    progress: f64,
}

#[derive(Serialize)]
struct WipeCase {
    transition: Transition,
    kind: AnimationDirection,
    local_comp_time: f64,
    comp_duration: f64,
    expected: Option<WipeResult>,
}

#[derive(Serialize)]
struct TimelineCompositionInput {
    duration: f64,
    overlap_next: f64,
}

#[derive(Serialize)]
struct TimelineCase {
    compositions: Vec<TimelineCompositionInput>,
    expected_start_times: Vec<f64>,
    expected_project_duration: f64,
}

#[derive(Serialize)]
struct GoldenFixture {
    easing_cases: Vec<EasingCase>,
    element_animation_cases: Vec<ElementAnimationCase>,
    composition_transition_cases: Vec<CompositionTransitionCase>,
    wipe_cases: Vec<WipeCase>,
    timeline_cases: Vec<TimelineCase>,
}

const ALL_ANIMATION_TYPES: [AnimationType; 19] = [
    AnimationType::Fade,
    AnimationType::SlideLeft,
    AnimationType::SlideRight,
    AnimationType::SlideUp,
    AnimationType::SlideDown,
    AnimationType::ZoomIn,
    AnimationType::ZoomOut,
    AnimationType::Rotate,
    AnimationType::Flip,
    AnimationType::Blur,
    AnimationType::FadeUp,
    AnimationType::FadeDown,
    AnimationType::FadeLeft,
    AnimationType::FadeRight,
    AnimationType::SkewLeft,
    AnimationType::SkewRight,
    AnimationType::Roll,
    AnimationType::Spin,
    AnimationType::Bounce,
];

const ALL_TRANSITION_TYPES: [TransitionType; 15] = [
    TransitionType::SlideLeft,
    TransitionType::SlideRight,
    TransitionType::SlideUp,
    TransitionType::SlideDown,
    TransitionType::Zoom,
    TransitionType::FlipH,
    TransitionType::FlipV,
    TransitionType::RotateCw,
    TransitionType::RotateCcw,
    TransitionType::Blur,
    TransitionType::WipeLeft,
    TransitionType::WipeRight,
    TransitionType::WipeUp,
    TransitionType::WipeDown,
    TransitionType::Fade,
];

const WIPE_TYPES: [TransitionType; 4] = [
    TransitionType::WipeLeft,
    TransitionType::WipeRight,
    TransitionType::WipeUp,
    TransitionType::WipeDown,
];

const ALL_EASINGS: [Easing; 11] = [
    Easing::Linear,
    Easing::Power1In,
    Easing::Power1Out,
    Easing::Power1InOut,
    Easing::Power2In,
    Easing::Power2Out,
    Easing::Power2InOut,
    Easing::Power3In,
    Easing::Power3Out,
    Easing::Power3InOut,
    Easing::Bounce,
];

fn mk_anim(
    animation_type: AnimationType,
    direction: AnimationDirection,
    with_fade: bool,
) -> Animation {
    Animation {
        animation_type,
        direction,
        duration: 1.0,
        easing: Easing::Linear,
        with_fade,
    }
}

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/animation-golden.json")
}

fn build_fixture() -> GoldenFixture {
    let ts_for_easing = [0.0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1.0];
    let easing_cases: Vec<EasingCase> = ALL_EASINGS
        .iter()
        .flat_map(|&easing| {
            ts_for_easing.iter().map(move |&t| EasingCase {
                easing,
                t,
                expected: apply_ease(t, easing),
            })
        })
        .collect();

    // duration=1.0, easing=linear => local_element_time == progress directement, ce qui isole
    // la logique de `shape_for`/composition de celle (déjà couverte ci-dessus) de `apply_ease`.
    let local_times = [0.0, 0.25, 0.5, 0.75, 1.0];
    let active_duration = 5.0;
    let mut element_animation_cases = Vec::new();
    for &animation_type in &ALL_ANIMATION_TYPES {
        for &with_fade in &[false, true] {
            for &local in &local_times {
                let anim = mk_anim(animation_type, AnimationDirection::In, with_fade);
                let expected =
                    resolve_element_animations(std::slice::from_ref(&anim), local, active_duration);
                element_animation_cases.push(ElementAnimationCase {
                    animations: vec![anim],
                    local_element_time: local,
                    active_duration,
                    expected,
                });
            }
        }
    }
    // Composition de plusieurs animations (accumulation opacity*=, dx/dy+=, scale*=, blur=max).
    let combos: Vec<Vec<Animation>> = vec![
        vec![
            mk_anim(AnimationType::Fade, AnimationDirection::In, false),
            mk_anim(AnimationType::SlideLeft, AnimationDirection::In, false),
        ],
        vec![
            mk_anim(AnimationType::ZoomIn, AnimationDirection::In, true),
            mk_anim(AnimationType::Rotate, AnimationDirection::In, false),
        ],
        vec![
            mk_anim(AnimationType::Blur, AnimationDirection::In, false),
            mk_anim(AnimationType::SkewLeft, AnimationDirection::In, false),
            mk_anim(AnimationType::Bounce, AnimationDirection::In, true),
        ],
    ];
    for combo in combos {
        for &local in &local_times {
            let expected = resolve_element_animations(&combo, local, active_duration);
            element_animation_cases.push(ElementAnimationCase {
                animations: combo.clone(),
                local_element_time: local,
                active_duration,
                expected,
            });
        }
    }

    let comp_duration = 5.0;
    let mut composition_transition_cases = Vec::new();
    for &transition_type in &ALL_TRANSITION_TYPES {
        for &kind in &[AnimationDirection::In, AnimationDirection::Out] {
            for &local in &local_times {
                let local_comp_time = match kind {
                    AnimationDirection::In => local,
                    AnimationDirection::Out => comp_duration - 1.0 + local,
                };
                let transition = Transition {
                    transition_type,
                    duration: 1.0,
                    easing: Easing::Linear,
                };
                let expected = resolve_composition_transition(
                    Some(&transition),
                    kind,
                    local_comp_time,
                    comp_duration,
                );
                composition_transition_cases.push(CompositionTransitionCase {
                    transition,
                    kind,
                    local_comp_time,
                    comp_duration,
                    expected,
                });
            }
        }
    }

    let mut wipe_cases = Vec::new();
    for &transition_type in &WIPE_TYPES {
        for &kind in &[AnimationDirection::In, AnimationDirection::Out] {
            for &local in &local_times {
                let local_comp_time = match kind {
                    AnimationDirection::In => local,
                    AnimationDirection::Out => comp_duration - 1.0 + local,
                };
                let transition = Transition {
                    transition_type,
                    duration: 1.0,
                    easing: Easing::Linear,
                };
                let result = resolve_wipe(Some(&transition), kind, local_comp_time, comp_duration);
                wipe_cases.push(WipeCase {
                    transition,
                    kind,
                    local_comp_time,
                    comp_duration,
                    expected: result.map(|(r#type, progress)| WipeResult { r#type, progress }),
                });
            }
        }
    }

    let timeline_matrices: Vec<Vec<(f64, f64)>> = vec![
        vec![(3.0, 0.0), (2.0, 0.0)],
        vec![(3.0, 1.0), (2.0, 0.0)],
        vec![(5.0, 0.0)],
        vec![(4.0, 0.5), (3.0, 1.0), (2.0, 0.0)],
        vec![],
    ];
    let timeline_cases: Vec<TimelineCase> = timeline_matrices
        .into_iter()
        .map(|matrix| {
            let compositions: Vec<Composition> = matrix
                .iter()
                .enumerate()
                .map(|(i, &(duration, overlap_next))| Composition {
                    id: format!("c{i}"),
                    name: format!("c{i}"),
                    start_time: 0.0,
                    duration,
                    elements: Vec::<Element>::new(),
                    audio_tracks: vec![],
                    transition_in: None,
                    transition_out: None,
                    overlap_next,
                })
                .collect();
            let mut project = Project {
                name: "golden".into(),
                width: 100,
                height: 100,
                fps: 30,
                duration: 0.0,
                compositions,
            };
            recompute_start_times(&mut project);
            TimelineCase {
                compositions: matrix
                    .into_iter()
                    .map(|(duration, overlap_next)| TimelineCompositionInput {
                        duration,
                        overlap_next,
                    })
                    .collect(),
                expected_start_times: project.compositions.iter().map(|c| c.start_time).collect(),
                expected_project_duration: project.duration,
            }
        })
        .collect();

    GoldenFixture {
        easing_cases,
        element_animation_cases,
        composition_transition_cases,
        wipe_cases,
        timeline_cases,
    }
}

#[test]
fn golden_fixture_matches_committed_file() {
    let fixture = build_fixture();
    let json = serde_json::to_string_pretty(&fixture).unwrap();
    let committed = std::fs::read_to_string(fixture_path()).unwrap_or_default();
    assert_eq!(
        json.trim(),
        committed.trim(),
        "la fixture committée ne correspond plus à la sortie de scene-core::animate/timeline — \
         si ce changement est intentionnel, régénère-la avec \
         `cargo test -p scene-core --test golden_fixture -- --ignored write_golden_fixture`, \
         puis vérifie `src/lib/animateGolden.test.ts`/`src/lib/timelineGolden.test.ts`"
    );
}

#[test]
#[ignore]
fn write_golden_fixture() {
    let fixture = build_fixture();
    let json = serde_json::to_string_pretty(&fixture).unwrap();
    std::fs::write(fixture_path(), json).unwrap();
}
