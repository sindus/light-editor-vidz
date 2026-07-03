//! Modèle de scène et moteur de résolution. `model`/`timeline`/`project` sont partagés
//! (bindings TS générés via ts-rs) ; `animate` est porté (dupliqué, volontairement) côté
//! TS pour la preview temps réel — voir la doc de ce module ; `raster` est natif (export mp4).

pub mod animate;
pub mod ffmpeg_path;
pub mod model;
pub mod paths;
pub mod project;
pub mod raster;
pub mod timeline;
