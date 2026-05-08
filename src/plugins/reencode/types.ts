import type { Media } from "../../tdarr/types";

export namespace Reencode {
  export interface Policy {
    targetCodec: Media.VideoCodec;
    targetBitrateMultiplier: number;
    targetResolution: Media.VideoResolutionTarget;
    tryUseGpu: boolean;
    container: Media.ContainerPreference;
    bitrateCutoff: number;
    enable10Bit: boolean;
    bFrames: {
      enabled: boolean;
      count: number;
    };
    forceConform: boolean;
    excludedGpuIds: readonly number[];
  }

  export interface NormalizedInputResult {
    policy: Policy;
    warnings: readonly string[];
  }
}
