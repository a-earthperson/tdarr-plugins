import { getBestNvencDevice } from "./nvencDevice";
import type {
  ChildProcessAdapter,
  EncoderCandidate,
  OtherArguments,
  TdarrPluginInput,
  TdarrResponse,
} from "../tdarr/types";

const encoderProbe = async (params: {
  ffmpegPath: string;
  encoder: string;
  inputArgs?: string;
  filter?: string;
  childProcess: ChildProcessAdapter;
}): Promise<boolean> =>
  new Promise((resolve) => {
    const command =
      `${params.ffmpegPath} ${params.inputArgs ?? ""} -f lavfi -i color=c=black:s=512x512:d=1:r=30 ` +
      `${params.filter ?? ""} -c:v ${params.encoder} -f null /dev/null`;
    params.childProcess.exec(command, (error) => {
      resolve(!error);
    });
  });

const gpuCandidates = (): EncoderCandidate[] => [
  { encoder: "hevc_nvenc" },
  { encoder: "hevc_amf" },
  {
    encoder: "hevc_vaapi",
    inputArgs: "-hwaccel vaapi -hwaccel_device /dev/dri/renderD128 -hwaccel_output_format vaapi",
    filter: "-vf format=nv12,hwupload",
  },
  { encoder: "hevc_rkmpp" },
  { encoder: "hevc_qsv" },
  { encoder: "hevc_videotoolbox" },
  { encoder: "h264_nvenc" },
  { encoder: "h264_rkmpp" },
  { encoder: "h264_amf" },
  { encoder: "h264_qsv" },
  { encoder: "h264_videotoolbox" },
];

const workerCanUseGpu = (workerType?: string): boolean =>
  typeof workerType === "string" && workerType.toLowerCase().includes("gpu");

export const selectEncoder = async (params: {
  response: TdarrResponse;
  inputs: TdarrPluginInput;
  otherArguments: OtherArguments;
  childProcess: ChildProcessAdapter;
}): Promise<EncoderCandidate> => {
  const { response, inputs, otherArguments, childProcess } = params;
  const targetCodec = inputs.target_codec;
  const ffmpegPath = otherArguments.ffmpegPath ?? "ffmpeg";

  if (workerCanUseGpu(otherArguments.workerType) && inputs.try_use_gpu) {
    const candidates = gpuCandidates().filter((candidate) =>
      candidate.encoder.startsWith(targetCodec)
    );
    const enabled: EncoderCandidate[] = [];
    for (const candidate of candidates) {
      const available = await encoderProbe({
        ffmpegPath,
        encoder: candidate.encoder,
        inputArgs: candidate.inputArgs,
        filter: candidate.filter,
        childProcess,
      });
      if (available) enabled.push(candidate);
    }
    if (enabled.length > 0) {
      let selected = enabled[0];
      if (selected.encoder.includes("vaapi")) {
        const qsv = enabled.find((candidate) => candidate.encoder.includes("qsv"));
        if (qsv) selected = qsv;
      }
      if (selected.encoder.includes("nvenc")) {
        selected = getBestNvencDevice({
          response,
          inputs,
          nvencDevice: selected,
          childProcess,
        });
      }
      return selected;
    }
  }

  if (targetCodec === "hevc") return { encoder: "libx265" };
  if (targetCodec === "h264") return { encoder: "libx264" };
  return { encoder: "" };
};
