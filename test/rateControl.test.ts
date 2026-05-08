import { describe, expect, test } from "vitest";
import { getEncoderRateControl } from "../src/ffmpeg/rateControl";

describe("rate control", () => {
  test("uses nvenc vbr hq profile", () => {
    const result = getEncoderRateControl({
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
    const result = getEncoderRateControl({
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
});
