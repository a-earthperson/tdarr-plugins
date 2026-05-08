import { renderArguments } from "../../ffmpeg/args";
import type { Ffmpeg } from "../../tdarr/types";
import type { TwoPassLoudness } from "./types";

export const normalisationStageTag: string = "NORMALISATIONSTAGE";

export function parseJobName(text: string): { jobId: string; start: number } {
  const [withoutExtension] = text.split(".txt");
  const parts: string[] = withoutExtension.split("()");
  return {
    jobId: parts[3] ?? "",
    start: Number(parts[4] ?? 0),
  };
}

function findJsonBlockAfter(lines: readonly string[], startIndex: number): string | null {
  const collected: string[] = [];
  let collecting: boolean = false;
  for (let index: number = startIndex + 1; index < lines.length; index += 1) {
    const trimmed: string = lines[index].trim();
    if (!collecting && !trimmed.includes("{")) continue;
    collecting = true;
    collected.push(trimmed);
    if (trimmed.includes("}")) break;
  }
  return collected.length > 0 ? collected.join("") : null;
}

function isLoudnormMeasuredValues(value: unknown): value is TwoPassLoudness.LoudnormMeasuredValues {
  if (typeof value !== "object" || value === null) return false;
  const candidate: Record<string, unknown> = value as Record<string, unknown>;
  return (
    typeof candidate.input_i === "string" &&
    typeof candidate.input_tp === "string" &&
    typeof candidate.input_lra === "string" &&
    typeof candidate.input_thresh === "string" &&
    typeof candidate.target_offset === "string"
  );
}

export class LoudnormReportParser {
  public parse(report: string): TwoPassLoudness.LoudnormMeasuredValues[] {
    const lines: string[] = report.split(/\r?\n/);
    const values: TwoPassLoudness.LoudnormMeasuredValues[] = [];

    lines.forEach((line, index) => {
      if (!line.includes("Parsed_loudnorm")) return;
      const jsonBlock: string | null = findJsonBlockAfter(lines, index);
      if (!jsonBlock) return;
      const parsed: unknown = JSON.parse(jsonBlock) as unknown;
      if (!isLoudnormMeasuredValues(parsed)) {
        throw new Error("Parsed loudnorm JSON did not contain expected measured values.");
      }
      values.push(parsed);
    });

    return values;
  }
}

export function parseLoudnormValuesFromReport(report: string): TwoPassLoudness.LoudnormMeasuredValues[] {
  return new LoudnormReportParser().parse(report);
}

function loudnormAnalysisExpression(policy: TwoPassLoudness.Policy): string {
  return `loudnorm=I=${String(policy.integratedLoudness)}:LRA=${String(policy.loudnessRange)}:TP=${String(
    policy.truePeak,
  )}:print_format=json`;
}

function loudnormApplyExpression(
  policy: TwoPassLoudness.Policy,
  measured: TwoPassLoudness.LoudnormMeasuredValues,
): string {
  return (
    `loudnorm=print_format=summary:linear=true:I=${String(policy.integratedLoudness)}:LRA=${String(
      policy.loudnessRange,
    )}:TP=${String(policy.truePeak)}:` +
    `measured_i=${measured.input_i}:measured_lra=${measured.input_lra}:measured_tp=${measured.input_tp}:` +
    `measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}`
  );
}

export class LoudnormCommandBuilder {
  public buildFirstPassArgs(params: {
    audioStreams: readonly TwoPassLoudness.AudioStream[];
    policy: TwoPassLoudness.Policy;
    nullOutput?: string;
  }): Ffmpeg.Argv {
    const labels: string[] = params.audioStreams.map((_, index) => `ln${String(index)}`);
    const filterComplex: string = params.audioStreams
      .map(
        (stream, index) =>
          `[0:${String(stream.streamIndex)}]${loudnormAnalysisExpression(params.policy)}[${labels[index]}]`,
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
    const labels: string[] = params.audioStreams.map((_, index) => `ln${String(index)}`);
    const filterComplex: string = params.audioStreams
      .map(
        (stream, index) =>
          `[0:${String(stream.streamIndex)}]${loudnormApplyExpression(params.policy, params.measuredValues[index])}[${
            labels[index]
          }]`,
      )
      .join(";");
    const appendedAudioCodecArgs: Ffmpeg.Argv = params.audioStreams.flatMap((stream, index) => {
      const outputAudioIndex: number = params.audioStreams.length + index;
      return [
        `-c:a:${String(outputAudioIndex)}`,
        params.policy.outputCodec,
        `-b:a:${String(outputAudioIndex)}`,
        params.policy.outputBitrate,
        `-metadata:s:a:${String(outputAudioIndex)}`,
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

export function buildFirstPassArgs(params: {
  audioStreams: readonly TwoPassLoudness.AudioStream[];
  policy: TwoPassLoudness.Policy;
  nullOutput?: string;
}): Ffmpeg.Argv {
  return new LoudnormCommandBuilder().buildFirstPassArgs(params);
}

export function buildSecondPassArgs(params: {
  audioStreams: readonly TwoPassLoudness.AudioStream[];
  measuredValues: readonly TwoPassLoudness.LoudnormMeasuredValues[];
  policy: TwoPassLoudness.Policy;
}): Ffmpeg.Argv {
  return new LoudnormCommandBuilder().buildSecondPassArgs(params);
}

export function renderPreset(args: Ffmpeg.Argv): string {
  return renderArguments(args);
}
