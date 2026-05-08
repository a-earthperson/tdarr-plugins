export type TargetCodec = "hevc" | "h264";
export type TargetResolution = "none" | "720p" | "480p";
export type TargetContainer = "mkv" | "mp4" | "avi" | "ts" | "original";

export namespace Tdarr {

  export interface FormInputSpec {
    name: string;
    type: "string" | "number" | "boolean";
    defaultValue: string | number | boolean;
    inputUI?: {
      type: "text" | "dropdown";
      options?: string[];
    };
    tooltip: string;
  }

  export const TagOptions = [
    "h265",
    "hevc",
    "h264",
    "nvenc h265",
    "nvenc h264",
    "video only",
    "audio only",
    "subtitle only",
    "handbrake",
    "ffmpeg",
    "radarr",
    "sonarr",
    "pre-processing",
    "post-processing",
    "configurable"
  ] as const;

  export type Tag = (typeof TagOptions)[number];
  export type CommaSeparatedTags = Tag | `${Tag},${string}` | `${Tag}, ${string}`;

  export interface PluginDetails {
    id: string;
    Stage: "Pre-processing" | "Post-processing";
    Name: string;
    Type: "Video" | string;
    Operation: "Transcode" | "Filter";
    Description: string;
    Version: string;
    Tags: CommaSeparatedTags;
    Inputs: FormInputSpec[];
  }

  export interface FileStream {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    duration?: string | number;
    disposition?: {
      attached_pic?: number;
    };
  }

  export interface MediaMetadata {
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
      streams: FileStream[];
    };
  }

  export interface HostInfo {
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

  export interface PluginResponse<PostProcessing> {
    file: MediaMetadata;
    removeFromDB?: boolean;
    updateDB?: boolean;
  }

  export interface PluginResponse<Filter> {
    processFile: true,
    infoLog: '',
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
        detailsProvider: () => PluginDetails
    ) => Record<string, unknown>;
    getNvdecHwaccelPreset: (file: MediaMetadata) => string;
    getNvenc10BitFormatArg: (file: MediaMetadata) => string;
  }

  export interface LibrarySettings {}

  export interface PluginArgs {
    source: MediaMetadata;
    settings: LibrarySettings;

  }
  export interface PluginSpec {
    details: PluginDetails,
    plugin: Promise<>
  }
}