import { describe, expect, test } from "vitest";
import { getEncoderRateControl, RateControlPlanner } from "../src/ffmpeg/rateControl";
import type { Ffmpeg } from "../src/tdarr/types";

describe("rate control", () => {
  test("uses nvenc vbr hq profile", () => {
    const result: Ffmpeg.RateControlPlan = getEncoderRateControl({
      encoderName: "hevc_nvenc",
      bitrate: {
        current: 8_000_000,
        target: 4_000_000,
        minimum: 2_800_000,
        maximum: 5_200_000,
      },
    });
    expect(result.description).toContain("NVENC");
    expect(result.args).toContain("-rc:v");
    expect(result.args).toContain("vbr");
  });

  test("uses qsv extbrc flags", () => {
    const result: Ffmpeg.RateControlPlan = getEncoderRateControl({
      encoderName: "hevc_qsv",
      bitrate: {
        current: 8_000_000,
        target: 4_000_000,
        minimum: 2_800_000,
        maximum: 5_200_000,
      },
    });
    expect(result.args).toContain("-extbrc");
    expect(result.args).toContain("1");
  });

  test("RateControlPlanner dispatches by encoder strategy", () => {
    const result: Ffmpeg.RateControlPlan = new RateControlPlanner().plan({
      encoderName: "libx265",
      bitrate: {
        current: 8_000_000,
        target: 4_000_000,
        minimum: 2_800_000,
        maximum: 5_200_000,
      },
    });

    expect(result.description).toBe("software encoder bitrate mode");
  });
});
