import { FfmpegArguments } from "./args";
import type { Ffmpeg, Media } from "../tdarr/types";

interface ResolutionTarget {
  landscape: { width: number; height: number };
  portrait: { width: number; height: number };
}

const resolutionTargets: Record<Exclude<Media.VideoResolutionTarget, "none">, ResolutionTarget> = {
  "720p": {
    landscape: { width: 1280, height: 720 },
    portrait: { width: 720, height: 1280 },
  },
  "480p": {
    landscape: { width: 854, height: 480 },
    portrait: { width: 480, height: 854 },
  },
};

const getResolutionTarget = (
  targetResolution: Media.VideoResolutionTarget,
  width: number,
  height: number
): { width: number; height: number } | null => {
  if (targetResolution === "none") return null;
  const target = resolutionTargets[targetResolution];
  if (!target) return null;
  return width >= height ? target.landscape : target.portrait;
};

export const streamNeedsResize = (
  stream: { width?: number; height?: number },
  targetResolution: Media.VideoResolutionTarget
): boolean => {
  if (
    targetResolution === "none" ||
    typeof stream.width !== "number" ||
    typeof stream.height !== "number"
  ) {
    return false;
  }
  const target = getResolutionTarget(targetResolution, stream.width, stream.height);
  if (!target) return false;
  return stream.width > target.width || stream.height > target.height;
};

export const getResolutionFilter = (
  encoder: string,
  targetResolution: Media.VideoResolutionTarget
): string => {
  if (targetResolution === "none") return "";
  const target = resolutionTargets[targetResolution];
  if (!target) return "";
  const scaleFactor = `min(1,if(gte(iw,ih),min(${target.landscape.width}/iw,${target.landscape.height}/ih),min(${target.portrait.width}/iw,${target.portrait.height}/ih)))`;
  const filterName = encoder.includes("nvenc") ? "scale_cuda" : "scale";
  return `${filterName}=w='trunc(iw*${scaleFactor}/2)*2':h='trunc(ih*${scaleFactor}/2)*2'`;
};

export const upsertVideoFilterTokens = (
  tokens: Ffmpeg.Argv,
  videoFilter: string
): Ffmpeg.Argv => {
  return FfmpegArguments.of(tokens).upsertVideoFilter(videoFilter).toArray();
};
