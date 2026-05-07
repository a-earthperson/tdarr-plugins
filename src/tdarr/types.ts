export type TargetCodec = "hevc" | "h264";
export type TargetResolution = "none" | "720p" | "480p";
export type TargetContainer = "mkv" | "mp4" | "avi" | "ts" | "original";

export interface TdarrInputSpec {
  name: string;
  type: "string" | "number" | "boolean";
  defaultValue: string | number | boolean;
  inputUI?: {
    type: string;
    options?: string[];
  };
  tooltip?: string;
}

export interface TdarrDetails {
  id: string;
  Stage: string;
  Name: string;
  Type: string;
  Operation: string;
  Description: string;
  Version: string;
  Tags: string;
  Inputs: TdarrInputSpec[];
}

export interface TdarrFileStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string | number;
  disposition?: {
    attached_pic?: number;
  };
}

export interface TdarrFile {
  fileMedium?: string;
  container?: string;
  file_size?: number;
  video_codec_name?: string;
  meta?: {
    Duration?: number;
  };
  ffProbeData?: {
    format?: {
      duration?: string | number;
    };
    streams: TdarrFileStream[];
  };
}

export interface OtherArguments {
  workerType?: string;
  ffmpegPath?: string;
}

export interface TdarrPluginInput {
  target_codec: TargetCodec;
  target_bitrate_multiplier: number;
  target_resolution: TargetResolution;
  try_use_gpu: boolean;
  container: TargetContainer;
  bitrate_cutoff: number;
  enable_10bit: boolean;
  bframes_enabled: boolean;
  bframes_value: number;
  force_conform: boolean;
  exclude_gpus: string;
  exclude_gpu_ids: number[];
}

export interface TdarrResponse {
  processFile: boolean;
  preset: string;
  handBrakeMode: boolean;
  FFmpegMode: boolean;
  reQueueAfter: boolean;
  infoLog: string;
  container?: string;
}

export interface EncoderCandidate {
  encoder: string;
  inputArgs?: string;
  outputArgs?: string;
  filter?: string;
  enabled?: boolean;
}

export interface ExecCallback {
  (error: Error | null, stdout: string, stderr: string): void;
}

export interface ChildProcessAdapter {
  exec: (command: string, callback: ExecCallback) => void;
  execSync: (command: string) => Buffer;
}

export interface TdarrRuntimeMethods {
  loadDefaultValues: (
    inputs: Record<string, unknown>,
    detailsProvider: () => TdarrDetails
  ) => Record<string, unknown>;
  getNvdecHwaccelPreset: (file: TdarrFile) => string;
  getNvenc10BitFormatArg: (file: TdarrFile) => string;
}
