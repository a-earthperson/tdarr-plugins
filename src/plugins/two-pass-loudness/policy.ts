import { parseEnum, parseFiniteNumber } from "../../common/parse";
import type { TwoPassLoudness } from "./types";

const outputCodecs = ["aac", "ac3"] as const;

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

export class TwoPassLoudnessPolicy implements TwoPassLoudness.Policy {
  public constructor(
    public readonly integratedLoudness: number,
    public readonly loudnessRange: number,
    public readonly truePeak: number,
    public readonly outputCodec: TwoPassLoudness.Policy["outputCodec"],
    public readonly outputBitrate: string,
    public readonly serverIp?: string,
    public readonly serverPort?: string
  ) {}

  public static fromInputs(
    rawInputs: Record<string, unknown>
  ): TwoPassLoudness.NormalizedInputResult {
    return {
      policy: new TwoPassLoudnessPolicy(
        parseFiniteNumber(rawInputs.i, -23.0),
        parseFiniteNumber(rawInputs.lra, 7.0),
        parseFiniteNumber(rawInputs.tp, -2.0),
        parseEnum(rawInputs.output_codec, outputCodecs, "aac"),
        normalizeOptionalString(rawInputs.output_bitrate) ?? "192k",
        normalizeOptionalString(rawInputs.serverIp),
        normalizeOptionalString(rawInputs.serverPort)
      ),
      warnings: [],
    };
  }
}

export const normalizeInputs = (
  rawInputs: Record<string, unknown>
): TwoPassLoudness.NormalizedInputResult => {
  return TwoPassLoudnessPolicy.fromInputs(rawInputs);
};
