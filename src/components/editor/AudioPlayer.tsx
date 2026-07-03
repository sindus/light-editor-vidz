import { useEffect, useRef } from "react";
import type { AudioTrack } from "../../bindings/AudioTrack";
import type { Project } from "../../bindings/Project";
import { assetUrl } from "../../lib/assetUrl";
import { allAudioTracksWithTiming, isAudioTrackActive, isTrackAudible } from "../../lib/audio";

interface TrackProps {
  track: AudioTrack;
  startTime: number;
  projectDir: string;
  currentTime: number;
  playing: boolean;
  audible: boolean;
}

function SingleAudio({ track, startTime, projectDir, currentTime, playing, audible }: TrackProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const active = isAudioTrackActive(startTime, track.duration, currentTime);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.volume = audible ? track.volume : 0;
    if (!active) {
      audio.pause();
      return;
    }
    const targetTime = currentTime - startTime + track.audio_offset;
    if (Math.abs(audio.currentTime - targetTime) > 0.25) {
      audio.currentTime = Math.max(0, targetTime);
    }
    if (playing) audio.play().catch(() => {});
    else audio.pause();
  }, [active, audible, currentTime, playing, track.volume, startTime, track.audio_offset]);

  return <audio ref={ref} src={assetUrl(projectDir, track.src)} />;
}

/** Lecture des pistes audio (toutes compositions confondues), synchronisée sur l'horloge
 * globale de l'éditeur (invisible). */
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
  const tracks = allAudioTracksWithTiming(project);
  const allTracks = tracks.map((t) => t.track);
  return (
    <>
      {tracks.map(({ track, absoluteStartTime }) => (
        <SingleAudio
          key={track.id}
          track={track}
          startTime={absoluteStartTime}
          projectDir={projectDir}
          currentTime={currentTime}
          playing={playing}
          audible={isTrackAudible(track, allTracks)}
        />
      ))}
    </>
  );
}
