import { renderArguments } from "../../ffmpeg/args";
import type { Ffmpeg } from "../../tdarr/types";
import type { TwoPassLoudness } from "./types";

export const normalisationStageTag = "NORMALISATIONSTAGE";

export const parseJobName = (text: string): { jobId: string; start: number } => {
  const [withoutExtension] = text.split(".txt");
  const parts = withoutExtension.split("()");
  return {
    jobId: parts[3] ?? "",
    start: Number(parts[4] ?? 0),
  };
};

const findJsonBlockAfter = (lines: readonly string[], startIndex: number): string | null => {
  const collected: string[] = [];
  let collecting = false;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!collecting && !trimmed.includes("{")) continue;
    collecting = true;
    collected.push(trimmed);
    if (trimmed.includes("}")) break;
  }
  return collected.length > 0 ? collected.join("") : null;
};

const isLoudnormMeasuredValues = (value: unknown): value is TwoPassLoudness.LoudnormMeasuredValues => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.input_i === "string" &&
    typeof candidate.input_tp === "string" &&
    typeof candidate.input_lra === "string" &&
    typeof candidate.input_thresh === "string" &&
    typeof candidate.target_offset === "string"
  );
};

export class LoudnormReportParser {
  public parse(report: string): TwoPassLoudness.LoudnormMeasuredValues[] {
    const lines = report.split(/\r?\n/);
    const values: TwoPassLoudness.LoudnormMeasuredValues[] = [];

    lines.forEach((line, index) => {
      if (!line.includes("Parsed_loudnorm")) return;
      const jsonBlock = findJsonBlockAfter(lines, index);
      if (!jsonBlock) return;
      const parsed = JSON.parse(jsonBlock) as unknown;
      if (!isLoudnormMeasuredValues(parsed)) {
        throw new Error("Parsed loudnorm JSON did not contain expected measured values.");
      }
      values.push(parsed);
    });

    return values;
  }
}

export const parseLoudnormValuesFromReport = (
  report: string
): TwoPassLoudness.LoudnormMeasuredValues[] => new LoudnormReportParser().parse(report);

const loudnormAnalysisExpression = (
  policy: TwoPassLoudness.Policy
): string =>
  `loudnorm=I=${policy.integratedLoudness}:LRA=${policy.loudnessRange}:TP=${policy.truePeak}:print_format=json`;

const loudnormApplyExpression = (
  policy: TwoPassLoudness.Policy,
  measured: TwoPassLoudness.LoudnormMeasuredValues
): string =>
  `loudnorm=print_format=summary:linear=true:I=${policy.integratedLoudness}:LRA=${policy.loudnessRange}:TP=${policy.truePeak}:` +
  `measured_i=${measured.input_i}:measured_lra=${measured.input_lra}:measured_tp=${measured.input_tp}:` +
  `measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}`;

export class LoudnormCommandBuilder {
  public buildFirstPassArgs(params: {
    audioStreams: readonly TwoPassLoudness.AudioStream[];
    policy: TwoPassLoudness.Policy;
    nullOutput?: string;
  }): Ffmpeg.Argv {
    const labels = params.audioStreams.map((_, index) => `ln${index}`);
    const filterComplex = params.audioStreams
      .map(
        (stream, index) =>
          `[0:${stream.streamIndex}]${loudnormAnalysisExpression(params.policy)}[${labels[index]}]`
      )
      .join(";");

    return [
      "<io>",
      "-filter_complex",
      filterComplex,
      ...labels.flatMap((label) => ["-map", `[${label}]`]),
      "-f",
      "null",
      params.nullOutput ?? "NUL",
      "-map",
      "0",
      "-c",
      "copy",
      "-metadata",
      `${normalisationStageTag}=FirstPassComplete`,
    ];
  }

  public buildSecondPassArgs(params: {
    audioStreams: readonly TwoPassLoudness.AudioStream[];
    measuredValues: readonly TwoPassLoudness.LoudnormMeasuredValues[];
    policy: TwoPassLoudness.Policy;
  }): Ffmpeg.Argv {
    const labels = params.audioStreams.map((_, index) => `ln${index}`);
    const filterComplex = params.audioStreams
      .map(
        (stream, index) =>
          `[0:${stream.streamIndex}]${loudnormApplyExpression(params.policy, params.measuredValues[index])}[${labels[index]}]`
      )
      .join(";");
    const appendedAudioCodecArgs = params.audioStreams.flatMap((stream, index) => {
      const outputAudioIndex = params.audioStreams.length + index;
      return [
        `-c:a:${outputAudioIndex}`,
        params.policy.outputCodec,
        `-b:a:${outputAudioIndex}`,
        params.policy.outputBitrate,
        `-metadata:s:a:${outputAudioIndex}`,
        `title=Loudness normalized ${stream.codecName}`,
      ];
    });

    return [
      "-y",
      "<io>",
      "-filter_complex",
      filterComplex,
      "-map",
      "0",
      ...labels.flatMap((label) => ["-map", `[${label}]`]),
      "-c",
      "copy",
      ...appendedAudioCodecArgs,
      "-metadata",
      `${normalisationStageTag}=Complete`,
    ];
  }
}

export const buildFirstPassArgs = (params: {
  audioStreams: readonly TwoPassLoudness.AudioStream[];
  policy: TwoPassLoudness.Policy;
  nullOutput?: string;
}): Ffmpeg.Argv => new LoudnormCommandBuilder().buildFirstPassArgs(params);

export const buildSecondPassArgs = (params: {
  audioStreams: readonly TwoPassLoudness.AudioStream[];
  measuredValues: readonly TwoPassLoudness.LoudnormMeasuredValues[];
  policy: TwoPassLoudness.Policy;
}): Ffmpeg.Argv => new LoudnormCommandBuilder().buildSecondPassArgs(params);

export const renderPreset = (args: Ffmpeg.Argv): string => renderArguments(args);
