import { isFiniteNonNegative } from "../common/parse";
import type { Media, Tdarr } from "../tdarr/types";
import { Media as MediaValues } from "../tdarr/types";

export class MediaFile {
  public constructor(public readonly metadata: Tdarr.MediaMetadata) {}

  public isVideo(): boolean {
    return this.metadata.fileMedium === "video";
  }

  public get streams(): readonly Tdarr.FileStream[] {
    return this.metadata.ffProbeData?.streams ?? [];
  }

  public resolveContainer(preference: Media.ContainerPreference): {
    container: Media.OutputContainer;
    warnings: readonly string[];
  } {
    if (preference !== "original") {
      return { container: preference, warnings: [] };
    }
    const normalized =
      typeof this.metadata.container === "string"
        ? this.metadata.container.trim().toLowerCase()
        : "";
    if (MediaValues.outputContainers.includes(normalized as Media.OutputContainer)) {
      return { container: normalized as Media.OutputContainer, warnings: [] };
    }
    return {
      container: "mkv",
      warnings: [
        "Input requested original container, but source container was unavailable or unsupported; using mkv.",
      ],
    };
  }

  public duration(): Media.DurationResult {
    const candidates: unknown[] = [
      this.metadata.ffProbeData?.format?.duration,
      this.metadata.meta?.Duration,
      this.metadata.ffProbeData?.streams?.[0]?.duration,
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
  }

  public bitrateBudget(durationSeconds: number, multiplier: number): Media.BitrateBudgetResult {
    const fileSizeMb =
      typeof this.metadata.file_size === "number"
        ? this.metadata.file_size
        : Number(this.metadata.file_size);
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
  }

  public tag(name: string): string | undefined {
    return this.metadata.ffProbeData?.format?.tags?.[name];
  }
}
