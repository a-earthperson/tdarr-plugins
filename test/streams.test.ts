import { describe, expect, test } from "vitest";
import { analyzeStreams, streamMapTokens } from "../src/streams/analyze";

describe("stream analysis", () => {
  test("drops unsupported and disposable streams", () => {
    const result = analyzeStreams({
      streams: [
        { codec_type: "video", codec_name: "mjpeg" },
        { codec_type: "video", codec_name: "h264", width: 1920, height: 1080 },
        { codec_type: "audio", codec_name: "ac3" },
        { codec_type: "subtitle", codec_name: "unknown" },
      ],
      targetResolution: "720p",
      forceConform: false,
      targetContainer: "mkv",
    });
    expect(result.primaryVideoStreamIndex).toBe(1);
    expect(result.passthroughStreamIndexes).toEqual([2]);
    expect(result.mappingChanged).toBe(true);
    expect(result.decisions).toContainEqual({
      kind: "drop-disposable-video",
      streamIndex: 0,
      codecName: "mjpeg",
    });
  });

  test("creates map token list", () => {
    expect(streamMapTokens([1, 0, 2])).toEqual(["-map", "0:1", "-map", "0:0", "-map", "0:2"]);
  });
});
