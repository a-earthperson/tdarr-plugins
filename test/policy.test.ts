import { describe, expect, test } from "vitest";
import { calculateBitrateBudget, normalizeInputs, resolveDurationSeconds } from "../src/plugins/reencode/policy";
import type { Media } from "../src/tdarr/types";

describe("transcode policy", () => {
  test("normalizes Tdarr-shaped raw inputs into domain policy", () => {
    const result: ReturnType<typeof normalizeInputs> = normalizeInputs({
      target_codec: "HEVC",
      target_bitrate_multiplier: "0",
      target_resolution: "720p",
      try_use_gpu: "true",
      container: "original",
      exclude_gpus: "0, 2, nope, 2, -1",
    });

    expect(result.policy).toMatchObject({
      targetCodec: "hevc",
      targetResolution: "720p",
      tryUseGpu: true,
      container: "original",
      targetBitrateMultiplier: 0,
      excludedGpuIds: [0, 2],
    });
    expect(result.warnings).toHaveLength(1);
  });

  test("returns invalid bitrate result instead of emitting NaN arguments", () => {
    const duration: Media.DurationResult = resolveDurationSeconds({
      ffProbeData: {
        format: { duration: "0" },
        streams: [],
      },
    });
    expect(duration.kind).toBe("invalid");

    const bitrate: Media.BitrateBudgetResult = calculateBitrateBudget({ file_size: 100 }, 100, 0);
    expect(bitrate.kind).toBe("invalid");
    expect(bitrate.reason).toContain("target bitrate");
  });
});
