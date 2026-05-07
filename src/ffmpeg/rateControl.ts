export interface EncoderRateControlInput {
  encoder: string;
  currentBitrate: number;
  targetBitrate: number;
  maximumBitrate: number;
}

export interface EncoderRateControlResult {
  tokens: string[];
  description: string;
}

const normalizeBitrate = (bitrate: number): string =>
  Math.max(1, Math.round(bitrate)).toString();

const bitrateTokens = (input: EncoderRateControlInput): string[] => [
  "-b:v",
  normalizeBitrate(input.targetBitrate),
  "-maxrate",
  normalizeBitrate(input.maximumBitrate),
  "-bufsize",
  normalizeBitrate(input.currentBitrate),
];

export const getEncoderRateControl = (
  input: EncoderRateControlInput
): EncoderRateControlResult => {
  const base = bitrateTokens(input);
  if (input.encoder === "hevc_nvenc" || input.encoder === "h264_nvenc") {
    return {
      tokens: [
        "-rc:v",
        "vbr",
        "-cq:v",
        "19",
        ...base,
        "-spatial_aq:v",
        "1",
        "-rc-lookahead:v",
        "32",
      ],
      description: "NVENC VBR HQ with CQ 19",
    };
  }
  if (input.encoder === "hevc_qsv" || input.encoder === "h264_qsv") {
    return {
      tokens: [...base, "-extbrc", "1", "-look_ahead_depth", "32"],
      description: "QSV bitrate mode with extbrc lookahead",
    };
  }
  if (input.encoder === "libx265" || input.encoder === "libx264") {
    return {
      tokens: base,
      description: "software encoder bitrate mode",
    };
  }
  return {
    tokens: base,
    description: "generic bitrate mode",
  };
};
