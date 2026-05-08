import { parseBoolean, parseEnum, parseFiniteNumber } from "../../common/parse";
import { MediaFile } from "../../core/mediaFile";
import type { Media, Tdarr } from "../../tdarr/types";
import { Media as MediaValues } from "../../tdarr/types";
import type { Reencode } from "./types";

export function parseExcludedGpuIds(value: unknown): number[] {
  if (typeof value !== "string") return [];
  const unique: Set<number> = new Set<number>();
  for (const entry of value.split(",")) {
    const gpuId: number = Number(entry.trim());
    if (Number.isInteger(gpuId) && gpuId >= 0) unique.add(gpuId);
  }
  return [...unique];
}

export class ReencodePolicy implements Reencode.Policy {
  public constructor(
    public readonly targetCodec: Media.VideoCodec,
    public readonly targetBitrateMultiplier: number,
    public readonly targetResolution: Media.VideoResolutionTarget,
    public readonly tryUseGpu: boolean,
    public readonly container: Media.ContainerPreference,
    public readonly bitrateCutoff: number,
    public readonly enable10Bit: boolean,
    public readonly bFrames: Reencode.Policy["bFrames"],
    public readonly forceConform: boolean,
    public readonly excludedGpuIds: readonly number[],
  ) {}

  public static fromInputs(rawInputs: Record<string, unknown>): Reencode.NormalizedInputResult {
    const warnings: string[] = [];
    const targetBitrateMultiplier: number = Math.max(0, parseFiniteNumber(rawInputs.target_bitrate_multiplier, 0.5));

    if (targetBitrateMultiplier === 0) {
      warnings.push("target_bitrate_multiplier resolved to 0; no valid bitrate target is configured.");
    }

    return {
      policy: new ReencodePolicy(
        parseEnum(rawInputs.target_codec, MediaValues.videoCodecs, "hevc"),
        targetBitrateMultiplier,
        parseEnum(rawInputs.target_resolution, MediaValues.videoResolutionTargets, "none"),
        parseBoolean(rawInputs.try_use_gpu, true),
        parseEnum(rawInputs.container, [...MediaValues.outputContainers, "original"], "mkv"),
        Math.max(0, parseFiniteNumber(rawInputs.bitrate_cutoff, 0)),
        parseBoolean(rawInputs.enable_10bit, false),
        {
          enabled: parseBoolean(rawInputs.bframes_enabled, false),
          count: Math.max(0, Math.round(parseFiniteNumber(rawInputs.bframes_value, 5))),
        },
        parseBoolean(rawInputs.force_conform, false),
        parseExcludedGpuIds(rawInputs.exclude_gpus),
      ),
      warnings,
    };
  }

  public encoderSelectionPolicy(): {
    targetCodec: Media.VideoCodec;
    tryUseGpu: boolean;
    excludedGpuIds: readonly number[];
  } {
    return {
      targetCodec: this.targetCodec,
      tryUseGpu: this.tryUseGpu,
      excludedGpuIds: this.excludedGpuIds,
    };
  }
}

export function normalizeInputs(rawInputs: Record<string, unknown>): Reencode.NormalizedInputResult {
  return ReencodePolicy.fromInputs(rawInputs);
}

export interface TargetContainerResult {
  container: Media.OutputContainer;
  warnings: readonly string[];
}

export function resolveTargetContainer(policy: Reencode.Policy, file: Tdarr.MediaMetadata): TargetContainerResult {
  return new MediaFile(file).resolveContainer(policy.container);
}

export function resolveDurationSeconds(file: Tdarr.MediaMetadata): Media.DurationResult {
  return new MediaFile(file).duration();
}

export function calculateBitrateBudget(
  file: Tdarr.MediaMetadata,
  durationSeconds: number,
  multiplier: number,
): Media.BitrateBudgetResult {
  return new MediaFile(file).bitrateBudget(durationSeconds, multiplier);
}

export function shouldDropForContainerConformance(container: Media.OutputContainer, streamCodecName: string): boolean {
  const codec: string = streamCodecName.trim().toLowerCase();
  if (container === "mkv") {
    return codec === "mov_text" || codec === "eia_608" || codec === "timed_id3";
  }
  if (container === "mp4") {
    return codec === "hdmv_pgs_subtitle" || codec === "eia_608" || codec === "subrip" || codec === "timed_id3";
  }
  return false;
}
