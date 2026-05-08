import { renderArguments } from "../ffmpeg/args";
import type { Encoder, Media, Runtime, Tdarr } from "../tdarr/types";
import { NvencDeviceSelector } from "./nvencDevice";

export interface EncoderSelection {
  candidate: Encoder.Candidate;
  logs: readonly string[];
}

class EncoderProbe {
  public constructor(
    private readonly ffmpegPath: string,
    private readonly childProcess: Runtime.ChildProcessAdapter,
  ) {}

  public async supports(candidate: Encoder.Candidate): Promise<boolean> {
    return new Promise((resolve) => {
      const command: string = renderArguments([
        this.ffmpegPath,
        ...candidate.inputArgs,
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=512x512:d=1:r=30",
        ...candidate.probeFilterArgs,
        "-c:v",
        candidate.name,
        "-f",
        "null",
        "/dev/null",
      ]);
      this.childProcess.exec(command, (error) => {
        resolve(!error);
      });
    });
  }
}

function candidate(
  name: Encoder.Name,
  codec: Media.VideoCodec,
  family: Encoder.Candidate["family"],
  inputArgs: Encoder.Candidate["inputArgs"] = [],
  probeFilterArgs: Encoder.Candidate["probeFilterArgs"] = [],
): Encoder.Candidate {
  return {
    name,
    codec,
    family,
    inputArgs,
    outputArgs: [],
    probeFilterArgs,
  };
}

function softwareCandidate(codec: Media.VideoCodec): Encoder.Candidate {
  return codec === "hevc" ? candidate("libx265", "hevc", "software") : candidate("libx264", "h264", "software");
}

function workerCanUseGpu(workerType?: string): boolean {
  return typeof workerType === "string" && workerType.toLowerCase().includes("gpu");
}

export class EncoderCatalog {
  private readonly hardwareCandidates: readonly Encoder.Candidate[] = [
    candidate("hevc_nvenc", "hevc", "nvenc"),
    candidate("hevc_amf", "hevc", "amf"),
    candidate(
      "hevc_vaapi",
      "hevc",
      "vaapi",
      ["-hwaccel", "vaapi", "-hwaccel_device", "/dev/dri/renderD128", "-hwaccel_output_format", "vaapi"],
      ["-vf", "format=nv12,hwupload"],
    ),
    candidate("hevc_rkmpp", "hevc", "rkmpp"),
    candidate("hevc_qsv", "hevc", "qsv"),
    candidate("hevc_videotoolbox", "hevc", "videotoolbox"),
    candidate("h264_nvenc", "h264", "nvenc"),
    candidate("h264_rkmpp", "h264", "rkmpp"),
    candidate("h264_amf", "h264", "amf"),
    candidate("h264_qsv", "h264", "qsv"),
    candidate("h264_videotoolbox", "h264", "videotoolbox"),
  ];

  public hardwareFor(codec: Media.VideoCodec): readonly Encoder.Candidate[] {
    return this.hardwareCandidates.filter((gpuCandidate) => gpuCandidate.codec === codec);
  }

  public softwareFor(codec: Media.VideoCodec): Encoder.Candidate {
    return softwareCandidate(codec);
  }
}

export class EncoderSelector {
  public constructor(
    private readonly childProcess: Runtime.ChildProcessAdapter,
    private readonly catalog = new EncoderCatalog(),
  ) {}

  public async select(params: { policy: Encoder.SelectionPolicy; host: Tdarr.HostInfo }): Promise<EncoderSelection> {
    const { policy, host } = params;
    const ffmpegPath: string = host.ffmpegPath ?? "ffmpeg";

    if (workerCanUseGpu(host.workerType) && policy.tryUseGpu) {
      const candidates: readonly Encoder.Candidate[] = this.catalog.hardwareFor(policy.targetCodec);
      const probe: EncoderProbe = new EncoderProbe(ffmpegPath, this.childProcess);
      const enabled: Encoder.Candidate[] = [];
      for (const gpuCandidate of candidates) {
        const available: boolean = await probe.supports(gpuCandidate);
        if (available) enabled.push(gpuCandidate);
      }

      if (enabled.length > 0) {
        let selected: Encoder.Candidate = enabled[0];
        if (selected.family === "vaapi") {
          const qsv: Encoder.Candidate | undefined = enabled.find(
            (enabledCandidate) => enabledCandidate.family === "qsv",
          );
          if (qsv) selected = qsv;
        }
        if (selected.family === "nvenc") {
          return new NvencDeviceSelector(this.childProcess).select({
            excludedGpuIds: policy.excludedGpuIds,
            nvencCandidate: selected,
          });
        }
        return { candidate: selected, logs: [] };
      }
    }

    return { candidate: this.catalog.softwareFor(policy.targetCodec), logs: [] };
  }
}

export async function selectEncoder(params: {
  policy: Encoder.SelectionPolicy;
  host: Tdarr.HostInfo;
  childProcess: Runtime.ChildProcessAdapter;
}): Promise<EncoderSelection> {
  return new EncoderSelector(params.childProcess).select({
    policy: params.policy,
    host: params.host,
  });
}
