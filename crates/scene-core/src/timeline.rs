//! Calcul des positions temporelles dérivées : l'utilisateur ne définit jamais
//! `Composition::start_time` directement, il redimensionne des blocs dans la timeline.

use crate::model::{Composition, Element, ElementBase, Project};

/// Recalcule `start_time` de chaque composition à partir de leurs durées et de
/// `overlap_next` (chevauchement avec la composition suivante, pour les transitions
/// croisées). Doit être appelé après toute mutation de durée/ordre des compositions.
pub fn recompute_start_times(project: &mut Project) {
    let mut cursor = 0.0;
    for i in 0..project.compositions.len() {
        project.compositions[i].start_time = cursor;
        let duration = project.compositions[i].duration;
        let overlap = project.compositions[i].overlap_next.max(0.0);
        cursor += (duration - overlap).max(0.0);
    }
    project.duration = cursor
        + project
            .compositions
            .last()
            .map(|c| c.overlap_next.max(0.0))
            .unwrap_or(0.0);
}

/// Composition active à l'instant global `t`, avec le temps local (relatif à son début).
/// Port Rust de `src/lib/timeline.ts::resolveActiveComposition` — duplication assumée, voir la
/// doc de `crate::animate`. `recompute_start_times` est validé contre son port TS par
/// `crates/scene-core/tests/golden_fixture.rs` + `src/lib/timelineGolden.test.ts`.
pub fn resolve_active_composition(project: &Project, t: f64) -> Option<(&Composition, f64)> {
    for comp in &project.compositions {
        if t >= comp.start_time && t < comp.start_time + comp.duration {
            return Some((comp, t - comp.start_time));
        }
    }
    if let Some(last) = project.compositions.last() {
        if t >= last.start_time + last.duration {
            return Some((last, last.duration));
        }
    }
    project.compositions.first().map(|c| (c, 0.0))
}

pub fn is_element_active(el: &Element, local_time: f64) -> bool {
    let base: &ElementBase = el.base();
    if local_time < base.start_time {
        return false;
    }
    match base.duration {
        Some(d) => local_time < base.start_time + d,
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Composition;

    fn comp(id: &str, duration: f64, overlap_next: f64) -> Composition {
        Composition {
            id: id.to_string(),
            name: id.to_string(),
            start_time: 0.0,
            duration,
            elements: vec![],
            audio_tracks: vec![],
            transition_in: None,
            transition_out: None,
            overlap_next,
        }
    }

    fn empty_project(compositions: Vec<Composition>) -> Project {
        Project {
            name: "test".into(),
            width: 1080,
            height: 1920,
            fps: 30,
            duration: 0.0,
            compositions,
        }
    }

    #[test]
    fn sequential_without_overlap() {
        let mut project = empty_project(vec![comp("a", 3.0, 0.0), comp("b", 2.0, 0.0)]);
        recompute_start_times(&mut project);
        assert_eq!(project.compositions[0].start_time, 0.0);
        assert_eq!(project.compositions[1].start_time, 3.0);
        assert_eq!(project.duration, 5.0);
    }

    #[test]
    fn overlap_shifts_next_composition_earlier() {
        let mut project = empty_project(vec![comp("a", 3.0, 1.0), comp("b", 2.0, 0.0)]);
        recompute_start_times(&mut project);
        assert_eq!(project.compositions[0].start_time, 0.0);
        assert_eq!(project.compositions[1].start_time, 2.0);
        assert_eq!(project.duration, 4.0);
    }

    #[test]
    fn single_composition() {
        let mut project = empty_project(vec![comp("a", 5.0, 0.0)]);
        recompute_start_times(&mut project);
        assert_eq!(project.compositions[0].start_time, 0.0);
        assert_eq!(project.duration, 5.0);
    }
}
