import { renderArguments } from "../ffmpeg/args";
import type { Encoder, Media, Runtime, Tdarr } from "../tdarr/types";
import { getBestNvencDevice } from "./nvencDevice";

export interface EncoderSelection {
  candidate: Encoder.Candidate;
  logs: readonly string[];
}

const encoderProbe = async (params: {
  ffmpegPath: string;
  candidate: Encoder.Candidate;
  childProcess: Runtime.ChildProcessAdapter;
}): Promise<boolean> =>
  new Promise((resolve) => {
    const command = renderArguments([
      params.ffmpegPath,
      ...params.candidate.inputArgs,
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=512x512:d=1:r=30",
      ...params.candidate.probeFilterArgs,
      "-c:v",
      params.candidate.name,
      "-f",
      "null",
      "/dev/null",
    ]);
    params.childProcess.exec(command, (error) => {
      resolve(!error);
    });
  });

const candidate = (
  name: Encoder.Name,
  codec: Media.VideoCodec,
  family: Encoder.Candidate["family"],
  inputArgs: Encoder.Candidate["inputArgs"] = [],
  probeFilterArgs: Encoder.Candidate["probeFilterArgs"] = []
): Encoder.Candidate => ({
  name,
  codec,
  family,
  inputArgs,
  outputArgs: [],
  probeFilterArgs,
});

const gpuCandidates = (): Encoder.Candidate[] => [
  candidate("hevc_nvenc", "hevc", "nvenc"),
  candidate("hevc_amf", "hevc", "amf"),
  candidate(
    "hevc_vaapi",
    "hevc",
    "vaapi",
    ["-hwaccel", "vaapi", "-hwaccel_device", "/dev/dri/renderD128", "-hwaccel_output_format", "vaapi"],
    ["-vf", "format=nv12,hwupload"]
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

const softwareCandidate = (codec: Media.VideoCodec): Encoder.Candidate =>
  codec === "hevc"
    ? candidate("libx265", "hevc", "software")
    : candidate("libx264", "h264", "software");

const workerCanUseGpu = (workerType?: string): boolean =>
  typeof workerType === "string" && workerType.toLowerCase().includes("gpu");

export const selectEncoder = async (params: {
  policy: Encoder.SelectionPolicy;
  host: Tdarr.HostInfo;
  childProcess: Runtime.ChildProcessAdapter;
}): Promise<EncoderSelection> => {
  const { policy, host, childProcess } = params;
  const ffmpegPath = host.ffmpegPath ?? "ffmpeg";

  if (workerCanUseGpu(host.workerType) && policy.tryUseGpu) {
    const candidates = gpuCandidates().filter((gpuCandidate) =>
      gpuCandidate.codec === policy.targetCodec
    );
    const enabled: Encoder.Candidate[] = [];
    for (const gpuCandidate of candidates) {
      const available = await encoderProbe({
        ffmpegPath,
        candidate: gpuCandidate,
        childProcess,
      });
      if (available) enabled.push(gpuCandidate);
    }

    if (enabled.length > 0) {
      let selected = enabled[0];
      if (selected.family === "vaapi") {
        const qsv = enabled.find((enabledCandidate) => enabledCandidate.family === "qsv");
        if (qsv) selected = qsv;
      }
      if (selected.family === "nvenc") {
        return getBestNvencDevice({
          excludedGpuIds: policy.excludedGpuIds,
          nvencCandidate: selected,
          childProcess,
        });
      }
      return { candidate: selected, logs: [] };
    }
  }

  return { candidate: softwareCandidate(policy.targetCodec), logs: [] };
};
