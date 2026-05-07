import type {
  TargetCodec,
  TargetContainer,
  TargetResolution,
  TdarrFile,
  TdarrPluginInput,
  TdarrResponse,
} from "../tdarr/types";

const TARGET_CODECS: TargetCodec[] = ["hevc", "h264"];
const TARGET_CONTAINERS: TargetContainer[] = ["mkv", "mp4", "avi", "ts", "original"];
const TARGET_RESOLUTIONS: TargetResolution[] = ["none", "720p", "480p"];

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return fallback;
};

const parseNumber = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseEnum = <T extends string>(value: unknown, allowed: T[], fallback: T): T => {
  const normalized = typeof value === "string" ? (value.trim().toLowerCase() as T) : fallback;
  return allowed.includes(normalized) ? normalized : fallback;
};

export const parseExcludedGpuIds = (value: unknown): number[] => {
  if (typeof value !== "string") return [];
  const unique = new Set<number>();
  for (const entry of value.split(",")) {
    const gpuId = Number(entry.trim());
    if (Number.isInteger(gpuId) && gpuId >= 0) unique.add(gpuId);
  }
  return [...unique];
};

export const normalizeInputs = (
  rawInputs: Record<string, unknown>,
  response: TdarrResponse
): TdarrPluginInput => {
  const target_codec = parseEnum(rawInputs.target_codec, TARGET_CODECS, "hevc");
  const container = parseEnum(rawInputs.container, TARGET_CONTAINERS, "mkv");
  const target_resolution = parseEnum(rawInputs.target_resolution, TARGET_RESOLUTIONS, "none");

  const normalized: TdarrPluginInput = {
    target_codec,
    container,
    target_resolution,
    target_bitrate_multiplier: Math.max(0, parseNumber(rawInputs.target_bitrate_multiplier, 0.5)),
    try_use_gpu: parseBoolean(rawInputs.try_use_gpu, true),
    bitrate_cutoff: Math.max(0, parseNumber(rawInputs.bitrate_cutoff, 0)),
    enable_10bit: parseBoolean(rawInputs.enable_10bit, false),
    bframes_enabled: parseBoolean(rawInputs.bframes_enabled, false),
    bframes_value: Math.max(0, Math.round(parseNumber(rawInputs.bframes_value, 5))),
    force_conform: parseBoolean(rawInputs.force_conform, false),
    exclude_gpus: typeof rawInputs.exclude_gpus === "string" ? rawInputs.exclude_gpus : "",
    exclude_gpu_ids: parseExcludedGpuIds(rawInputs.exclude_gpus),
  };

  if (normalized.target_bitrate_multiplier === 0) {
    response.infoLog += "target_bitrate_multiplier resolved to 0. No bitrate reduction target is configured.\n";
  }
  return normalized;
};

export const resolveTargetContainer = (inputs: TdarrPluginInput, file: TdarrFile): string =>
  inputs.container === "original" ? (file.container ?? "mkv") : inputs.container;

export interface DurationResult {
  duration: number;
  valid: boolean;
}

export const resolveDurationSeconds = (file: TdarrFile, response: TdarrResponse): DurationResult => {
  const candidates: unknown[] = [
    file.ffProbeData?.format?.duration,
    file.meta?.Duration,
    file.ffProbeData?.streams?.[0]?.duration,
  ];
  for (const candidate of candidates) {
    const parsed = typeof candidate === "number" ? candidate : Number(candidate);
    if (isFiniteNonNegative(parsed) && parsed > 0) {
      return { duration: parsed, valid: true };
    }
  }
  response.infoLog += "Unable to determine media duration. Skipping transcode.\n";
  return { duration: 0, valid: false };
};

export interface BitrateResult {
  currentBitrate: number;
  targetBitrate: number;
  minimumBitrate: number;
  maximumBitrate: number;
  valid: boolean;
}

export const calculateBitrates = (
  file: TdarrFile,
  durationSeconds: number,
  multiplier: number,
  response: TdarrResponse
): BitrateResult => {
  const fileSizeMb = typeof file.file_size === "number" ? file.file_size : Number(file.file_size);
  if (!isFiniteNonNegative(fileSizeMb) || fileSizeMb <= 0) {
    response.infoLog += "Unable to calculate bitrate from file_size. Skipping transcode.\n";
    return {
      currentBitrate: 0,
      targetBitrate: 0,
      minimumBitrate: 0,
      maximumBitrate: 0,
      valid: false,
    };
  }
  const currentBitrate = (fileSizeMb * 1024 * 1024 * 8) / durationSeconds;
  if (!Number.isFinite(currentBitrate) || currentBitrate <= 0) {
    response.infoLog += "Computed current bitrate is invalid. Skipping transcode.\n";
    return {
      currentBitrate: 0,
      targetBitrate: 0,
      minimumBitrate: 0,
      maximumBitrate: 0,
      valid: false,
    };
  }
  const targetBitrate = currentBitrate * multiplier;
  if (!Number.isFinite(targetBitrate) || targetBitrate <= 0) {
    response.infoLog += "Computed target bitrate is invalid. Skipping transcode.\n";
    return {
      currentBitrate: 0,
      targetBitrate: 0,
      minimumBitrate: 0,
      maximumBitrate: 0,
      valid: false,
    };
  }
  return {
    currentBitrate,
    targetBitrate,
    minimumBitrate: targetBitrate * 0.7,
    maximumBitrate: targetBitrate * 1.3,
    valid: true,
  };
};

export const getContainerConformanceDrops = (container: string, streamCodecName: string): boolean => {
  const codec = streamCodecName.trim().toLowerCase();
  if (container === "mkv") {
    return codec === "mov_text" || codec === "eia_608" || codec === "timed_id3";
  }
  if (container === "mp4") {
    return (
      codec === "hdmv_pgs_subtitle" ||
      codec === "eia_608" ||
      codec === "subrip" ||
      codec === "timed_id3"
    );
  }
  return false;
};
