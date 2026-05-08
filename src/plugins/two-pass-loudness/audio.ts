import type { Tdarr } from "../../tdarr/types";
import type { TwoPassLoudness } from "./types";

const normalize = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const detectAudioStreams = (
  file: Tdarr.MediaMetadata
): TwoPassLoudness.AudioStream[] => {
  let audioIndex = 0;
  const streams = file.ffProbeData?.streams ?? [];
  return streams.flatMap((stream, streamIndex) => {
    if (normalize(stream.codec_type) !== "audio") return [];
    const audioStream: TwoPassLoudness.AudioStream = {
      streamIndex,
      audioIndex,
      codecName: normalize(stream.codec_name) || "unknown",
    };
    audioIndex += 1;
    return [audioStream];
  });
};
