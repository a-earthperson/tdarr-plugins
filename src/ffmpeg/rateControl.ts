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

interface RateControlStrategy {
  supports(encoderName: Encoder.Name): boolean;
  plan(request: Ffmpeg.RateControlRequest): Ffmpeg.RateControlPlan;
}

class NvencRateControlStrategy implements RateControlStrategy {
  public supports(encoderName: Encoder.Name): boolean {
    return encoderName === "hevc_nvenc" || encoderName === "h264_nvenc";
  }

  public plan(request: Ffmpeg.RateControlRequest): Ffmpeg.RateControlPlan {
    const base = bitrateArgs(request);
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
}

class QsvRateControlStrategy implements RateControlStrategy {
  public supports(encoderName: Encoder.Name): boolean {
    return encoderName === "hevc_qsv" || encoderName === "h264_qsv";
  }

  public plan(request: Ffmpeg.RateControlRequest): Ffmpeg.RateControlPlan {
    const base = bitrateArgs(request);
    return {
      args: [...base, "-extbrc", "1", "-look_ahead_depth", "32"],
      description: "QSV bitrate mode with extbrc lookahead",
    };
  }
}

class SoftwareRateControlStrategy implements RateControlStrategy {
  public supports(encoderName: Encoder.Name): boolean {
    return encoderName === "libx265" || encoderName === "libx264";
  }

  public plan(request: Ffmpeg.RateControlRequest): Ffmpeg.RateControlPlan {
    return {
      args: bitrateArgs(request),
      description: "software encoder bitrate mode",
    };
  }
}

class GenericRateControlStrategy implements RateControlStrategy {
  public supports(): boolean {
    return true;
  }

  public plan(request: Ffmpeg.RateControlRequest): Ffmpeg.RateControlPlan {
    return {
      args: bitrateArgs(request),
      description: "generic bitrate mode",
    };
  }
}

export class RateControlPlanner {
  public constructor(
    private readonly strategies: readonly RateControlStrategy[] = [
      new NvencRateControlStrategy(),
      new QsvRateControlStrategy(),
      new SoftwareRateControlStrategy(),
      new GenericRateControlStrategy(),
    ]
  ) {}

  public plan(request: Ffmpeg.RateControlRequest): Ffmpeg.RateControlPlan {
    const strategy = this.strategies.find((candidate) => candidate.supports(request.encoderName));
    if (!strategy) {
      throw new Error(`No rate-control strategy registered for ${request.encoderName}.`);
    }
    return strategy.plan(request);
  }
}

export const getEncoderRateControl = (
  request: Ffmpeg.RateControlRequest
): Ffmpeg.RateControlPlan => {
  return new RateControlPlanner().plan(request);
};
