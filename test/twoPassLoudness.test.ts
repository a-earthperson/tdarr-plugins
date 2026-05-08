import { describe, expect, test } from "vitest";
import { detectAudioStreams } from "../src/plugins/two-pass-loudness/audio";
import {
  buildFirstPassArgs,
  buildSecondPassArgs,
  parseLoudnormValuesFromReport,
  renderPreset,
} from "../src/plugins/two-pass-loudness/loudnorm";
import { normalizeInputs } from "../src/plugins/two-pass-loudness/policy";
import type { Tdarr } from "../src/tdarr/types";

const policy = normalizeInputs({
  i: "-23",
  lra: "7",
  tp: "-2",
  output_codec: "aac",
  output_bitrate: "192k",
}).policy;

describe("two-pass loudness plugin helpers", () => {
  test("detects all audio streams with stable audio indexes", () => {
    const file: Tdarr.MediaMetadata = {
      ffProbeData: {
        streams: [
          { codec_type: "video", codec_name: "h264" },
          { codec_type: "audio", codec_name: "ac3" },
          { codec_type: "subtitle", codec_name: "subrip" },
          { codec_type: "audio", codec_name: "aac" },
        ],
      },
    };

    expect(detectAudioStreams(file)).toEqual([
      { streamIndex: 1, audioIndex: 0, codecName: "ac3" },
      { streamIndex: 3, audioIndex: 1, codecName: "aac" },
    ]);
  });

  test("parses multiple loudnorm JSON payloads from a Tdarr report", () => {
    const report = `
[Parsed_loudnorm_0 @ abc]
{
  "input_i" : "-18.00",
  "input_tp" : "-1.00",
  "input_lra" : "5.00",
  "input_thresh" : "-28.00",
  "target_offset" : "-5.00"
}
[Parsed_loudnorm_1 @ def]
{
  "input_i" : "-20.00",
  "input_tp" : "-2.00",
  "input_lra" : "4.00",
  "input_thresh" : "-30.00",
  "target_offset" : "-3.00"
}`;

    const parsed = parseLoudnormValuesFromReport(report);
    expect(parsed).toHaveLength(2);
    expect(parsed[1].input_i).toBe("-20.00");
  });

  test("first pass analyzes every audio stream", () => {
    const args = buildFirstPassArgs({
      audioStreams: [
        { streamIndex: 1, audioIndex: 0, codecName: "ac3" },
        { streamIndex: 3, audioIndex: 1, codecName: "aac" },
      ],
      policy,
    });
    const preset = renderPreset(args);

    expect(preset).toContain("[0:1]loudnorm=");
    expect(preset).toContain("[0:3]loudnorm=");
    expect(preset).toContain("NORMALISATIONSTAGE=FirstPassComplete");
  });

  test("second pass preserves originals and appends normalized audio streams", () => {
    const args = buildSecondPassArgs({
      audioStreams: [
        { streamIndex: 1, audioIndex: 0, codecName: "ac3" },
        { streamIndex: 3, audioIndex: 1, codecName: "aac" },
      ],
      measuredValues: [
        {
          input_i: "-18.00",
          input_tp: "-1.00",
          input_lra: "5.00",
          input_thresh: "-28.00",
          target_offset: "-5.00",
        },
        {
          input_i: "-20.00",
          input_tp: "-2.00",
          input_lra: "4.00",
          input_thresh: "-30.00",
          target_offset: "-3.00",
        },
      ],
      policy,
    });
    const preset = renderPreset(args);

    expect(preset).toContain("-map 0");
    expect(preset).toContain("-map [ln0]");
    expect(preset).toContain("-map [ln1]");
    expect(preset).toContain("-c:a:2 aac");
    expect(preset).toContain("-c:a:3 aac");
    expect(preset).toContain("NORMALISATIONSTAGE=Complete");
  });
});
