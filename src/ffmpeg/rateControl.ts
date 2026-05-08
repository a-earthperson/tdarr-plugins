import type { Encoder, Ffmpeg } from "../tdarr/types";

const normalizeBitrate = (bitrate: number): string =>
  Math.max(1, Math.round(bitrate)).toString();

const bitrateArgs = (request: Ffmpeg.RateControlRequest): Ffmpeg.Argv => [
  "-b:v",
  normalizeBitrate(request.bitrate.target),
  "-maxrate",
  normalizeBitrate(request.bitrate.maximum),
  "-bufsize",
  normalizeBitrate(request.bitrate.current),
];

const isNvenc = (encoderName: Encoder.Name): boolean =>
  encoderName === "hevc_nvenc" || encoderName === "h264_nvenc";

const isQsv = (encoderName: Encoder.Name): boolean =>
  encoderName === "hevc_qsv" || encoderName === "h264_qsv";

const isSoftware = (encoderName: Encoder.Name): boolean =>
  encoderName === "libx265" || encoderName === "libx264";

export const getEncoderRateControl = (
  request: Ffmpeg.RateControlRequest
): Ffmpeg.RateControlPlan => {
  const base = bitrateArgs(request);
  if (isNvenc(request.encoderName)) {
    return {
      args: [
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
  if (isQsv(request.encoderName)) {
    return {
      args: [...base, "-extbrc", "1", "-look_ahead_depth", "32"],
      description: "QSV bitrate mode with extbrc lookahead",
    };
  }
  if (isSoftware(request.encoderName)) {
    return {
      args: base,
      description: "software encoder bitrate mode",
    };
  }
  return {
    args: base,
    description: "generic bitrate mode",
  };
};
