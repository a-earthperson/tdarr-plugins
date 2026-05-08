import type { Tdarr } from "../../tdarr/types";
import type { TwoPassLoudness } from "./types";

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export class AudioStreamCollection {
  public constructor(public readonly streams: readonly TwoPassLoudness.AudioStream[]) {}

  public get length(): number {
    return this.streams.length;
  }

  public isEmpty(): boolean {
    return this.streams.length === 0;
  }

  public toArray(): TwoPassLoudness.AudioStream[] {
    return [...this.streams];
  }
}

export class AudioStreamDetector {
  public detect(file: Tdarr.MediaMetadata): AudioStreamCollection {
    let audioIndex: number = 0;
    const streams: readonly Tdarr.FileStream[] = file.ffProbeData?.streams ?? [];
    return new AudioStreamCollection(
      streams.flatMap((stream, streamIndex) => {
        if (normalize(stream.codec_type) !== "audio") return [];
        const audioStream: TwoPassLoudness.AudioStream = {
          streamIndex,
          audioIndex,
          codecName: normalize(stream.codec_name) || "unknown",
        };
        audioIndex += 1;
        return [audioStream];
      }),
    );
  }
}

export function detectAudioStreams(file: Tdarr.MediaMetadata): TwoPassLoudness.AudioStream[] {
  return new AudioStreamDetector().detect(file).toArray();
}
