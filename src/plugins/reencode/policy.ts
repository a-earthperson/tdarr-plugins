import {
  isFiniteNonNegative,
  parseBoolean,
  parseEnum,
  parseFiniteNumber,
} from "../../common/parse";
import type { Media, Tdarr } from "../../tdarr/types";
import { Media as MediaValues } from "../../tdarr/types";
import type { Reencode } from "./types";

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
  rawInputs: Record<string, unknown>
): Reencode.NormalizedInputResult => {
  const warnings: string[] = [];
  const targetBitrateMultiplier = Math.max(
    0,
    parseFiniteNumber(rawInputs.target_bitrate_multiplier, 0.5)
  );

  if (targetBitrateMultiplier === 0) {
    warnings.push(
      "target_bitrate_multiplier resolved to 0; no valid bitrate target is configured."
    );
  }

  return {
    policy: {
      targetCodec: parseEnum(rawInputs.target_codec, MediaValues.videoCodecs, "hevc"),
      container: parseEnum(rawInputs.container, [...MediaValues.outputContainers, "original"], "mkv"),
      targetResolution: parseEnum(
        rawInputs.target_resolution,
        MediaValues.videoResolutionTargets,
        "none"
      ),
      targetBitrateMultiplier,
      tryUseGpu: parseBoolean(rawInputs.try_use_gpu, true),
      bitrateCutoff: Math.max(0, parseFiniteNumber(rawInputs.bitrate_cutoff, 0)),
      enable10Bit: parseBoolean(rawInputs.enable_10bit, false),
      bFrames: {
        enabled: parseBoolean(rawInputs.bframes_enabled, false),
        count: Math.max(0, Math.round(parseFiniteNumber(rawInputs.bframes_value, 5))),
      },
      forceConform: parseBoolean(rawInputs.force_conform, false),
      excludedGpuIds: parseExcludedGpuIds(rawInputs.exclude_gpus),
    },
    warnings,
  };
};

export interface TargetContainerResult {
  container: Media.OutputContainer;
  warnings: readonly string[];
}

export const resolveTargetContainer = (
  policy: Reencode.Policy,
  file: Tdarr.MediaMetadata
): TargetContainerResult => {
  if (policy.container !== "original") {
    return { container: policy.container, warnings: [] };
  }
  const normalized = typeof file.container === "string" ? file.container.trim().toLowerCase() : "";
  if (MediaValues.outputContainers.includes(normalized as Media.OutputContainer)) {
    return { container: normalized as Media.OutputContainer, warnings: [] };
  }
  return {
    container: "mkv",
    warnings: ["Input requested original container, but source container was unavailable or unsupported; using mkv."],
  };
};

export const resolveDurationSeconds = (
  file: Tdarr.MediaMetadata
): Media.DurationResult => {
  const candidates: unknown[] = [
    file.ffProbeData?.format?.duration,
    file.meta?.Duration,
    file.ffProbeData?.streams?.[0]?.duration,
  ];
  for (const candidate of candidates) {
    const parsed = typeof candidate === "number" ? candidate : Number(candidate);
    if (isFiniteNonNegative(parsed) && parsed > 0) {
      return { kind: "ok", seconds: parsed };
    }
  }
  return {
    kind: "invalid",
    seconds: 0,
    reason: "Unable to determine media duration.",
  };
};

export const calculateBitrateBudget = (
  file: Tdarr.MediaMetadata,
  durationSeconds: number,
  multiplier: number
): Media.BitrateBudgetResult => {
  const fileSizeMb = typeof file.file_size === "number" ? file.file_size : Number(file.file_size);
  if (!isFiniteNonNegative(fileSizeMb) || fileSizeMb <= 0) {
    return {
      kind: "invalid",
      reason: "Unable to calculate bitrate from file_size.",
    };
  }

  const current = (fileSizeMb * 1024 * 1024 * 8) / durationSeconds;
  if (!Number.isFinite(current) || current <= 0) {
    return {
      kind: "invalid",
      reason: "Computed current bitrate is invalid.",
    };
  }

  const target = current * multiplier;
  if (!Number.isFinite(target) || target <= 0) {
    return {
      kind: "invalid",
      reason: "Computed target bitrate is invalid.",
    };
  }

  return {
    kind: "ok",
    budget: {
      current,
      target,
      minimum: target * 0.7,
      maximum: target * 1.3,
    },
  };
};

export const shouldDropForContainerConformance = (
  container: Media.OutputContainer,
  streamCodecName: string
): boolean => {
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
