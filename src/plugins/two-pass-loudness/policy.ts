import { parseEnum, parseFiniteNumber } from "../../common/parse";
import type { TwoPassLoudness } from "./types";

const outputCodecs = ["aac", "ac3"] as const;

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

export const normalizeInputs = (
  rawInputs: Record<string, unknown>
): TwoPassLoudness.NormalizedInputResult => {
  const outputBitrate = normalizeOptionalString(rawInputs.output_bitrate) ?? "192k";

  return {
    policy: {
      integratedLoudness: parseFiniteNumber(rawInputs.i, -23.0),
      loudnessRange: parseFiniteNumber(rawInputs.lra, 7.0),
      truePeak: parseFiniteNumber(rawInputs.tp, -2.0),
      outputCodec: parseEnum(rawInputs.output_codec, outputCodecs, "aac"),
      outputBitrate,
      serverIp: normalizeOptionalString(rawInputs.serverIp),
      serverPort: normalizeOptionalString(rawInputs.serverPort),
    },
    warnings: [],
  };
};
