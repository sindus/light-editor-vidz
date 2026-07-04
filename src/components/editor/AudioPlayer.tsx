import { useEffect, useRef, useState } from "react";
import type { AudioTrack } from "../../bindings/AudioTrack";
import type { Project } from "../../bindings/Project";
import { acquireMediaObjectUrl } from "../../lib/mediaCache";
import { isAudioTrackActive, isTrackAudible } from "../../lib/audio";

interface TrackProps {
  track: AudioTrack;
  projectDir: string;
  currentTime: number;
  playing: boolean;
  audible: boolean;
}

function SingleAudio({ track, projectDir, currentTime, playing, audible }: TrackProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const active = isAudioTrackActive(track.start_time, track.duration, currentTime);

  // Même contournement que la vidéo (voir `read_media_file` côté Rust) : WebKitGTK peut refuser
  // un `<audio src="asset://...">` en silence — la piste semble jouer mais reste inaudible.
  // Charger les octets et lire depuis une URL `blob:` (partagée via `mediaCache`).
  useEffect(() => {
    let cancelled = false;
    const { promise, release } = acquireMediaObjectUrl(projectDir, track.src);
    promise
      .then((url) => {
        if (!cancelled) setBlobSrc(url);
      })
      .catch(() => {
        // Fichier introuvable/illisible : piste silencieuse, pas de quoi bloquer l'éditeur.
      });
    return () => {
      cancelled = true;
      release();
    };
  }, [projectDir, track.src]);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.volume = audible ? Math.min(1, Math.max(0, track.volume)) : 0;
    if (!active) {
      audio.pause();
      return;
    }
    // `track.start_time` est absolu sur la timeline globale (pistes non rattachées aux scènes).
    const targetTime = currentTime - track.start_time + track.audio_offset;
    if (Math.abs(audio.currentTime - targetTime) > 0.25) {
      audio.currentTime = Math.max(0, targetTime);
    }
    if (playing) audio.play().catch(() => {});
    else audio.pause();
  }, [active, audible, currentTime, playing, track.volume, track.start_time, track.audio_offset, blobSrc]);

  return <audio ref={ref} src={blobSrc ?? undefined} preload="auto" />;
}

/** Lecture des pistes audio globales du projet, synchronisée sur l'horloge de l'éditeur
 * (invisible). */
export default function AudioPlayer({
  project,
  projectDir,
  currentTime,
  playing,
}: {
  project: Project;
  projectDir: string;
  currentTime: number;
  playing: boolean;
}) {
  return (
    <>
      {project.audio_tracks.map((track) => (
        <SingleAudio
          key={track.id}
          track={track}
          projectDir={projectDir}
          currentTime={currentTime}
          playing={playing}
          audible={isTrackAudible(track, project.audio_tracks)}
        />
      ))}
    </>
  );
}
