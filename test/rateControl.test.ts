import { describe, expect, test } from "vitest";
import { getEncoderRateControl } from "../src/ffmpeg/rateControl";

describe("rate control", () => {
  test("uses nvenc vbr hq profile", () => {
    const result = getEncoderRateControl({
      encoder: "hevc_nvenc",
      currentBitrate: 8_000_000,
      targetBitrate: 4_000_000,
      maximumBitrate: 5_200_000,
    });
    expect(result.description).toContain("NVENC");
    expect(result.tokens).toContain("-rc:v");
    expect(result.tokens).toContain("vbr");
  });

  test("uses qsv extbrc flags", () => {
    const result = getEncoderRateControl({
      encoder: "hevc_qsv",
      currentBitrate: 8_000_000,
      targetBitrate: 4_000_000,
      maximumBitrate: 5_200_000,
    });
    expect(result.tokens).toContain("-extbrc");
    expect(result.tokens).toContain("1");
  });
});
