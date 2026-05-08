export namespace Media {
  export const videoCodecs = ["hevc", "h264"] as const;
  export type VideoCodec = (typeof videoCodecs)[number];

  export const videoResolutionTargets = ["none", "720p", "480p"] as const;
  export type VideoResolutionTarget = (typeof videoResolutionTargets)[number];

  export const outputContainers = ["mkv", "mp4", "avi", "ts"] as const;
  export type OutputContainer = (typeof outputContainers)[number];
  export type ContainerPreference = OutputContainer | "original";

  export interface DurationResult {
    kind: "ok" | "invalid";
    seconds: number;
    reason?: string;
  }

  export interface BitrateBudget {
    current: number;
    target: number;
    minimum: number;
    maximum: number;
  }

  export interface BitrateBudgetResult {
    kind: "ok" | "invalid";
    budget?: BitrateBudget;
    reason?: string;
  }

  export interface ProcessingContext {
    targetContainer: OutputContainer;
    durationSeconds: number;
    bitrate: BitrateBudget;
  }
}

export namespace Tdarr {
  export interface FormInputSpec {
    name: string;
    type: "string" | "number" | "boolean";
    defaultValue: string | number | boolean;
    inputUI?: {
      type: "text" | "dropdown";
      options?: readonly string[];
    };
    tooltip: string;
  }

  export const tagOptions = [
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
    "configurable",
  ] as const;

  export type Tag = (typeof tagOptions)[number];
  export type CommaSeparatedTags = Tag | `${Tag},${string}` | `${Tag}, ${string}`;

  export interface PluginDetails {
    id: string;
    Stage: "Pre-processing" | "Post-processing";
    Name: string;
    Type: "Video";
    Operation: "Transcode" | "Filter";
    Description: string;
    Version: string;
    Tags: CommaSeparatedTags;
    Inputs: readonly FormInputSpec[];
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
    footprintId?: string;
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
        tags?: Record<string, string | undefined>;
      };
      streams: FileStream[];
    };
  }

  export interface LibrarySettings {
    [key: string]: unknown;
  }

  export interface HostInfo {
    workerType?: string;
    ffmpegPath?: string;
    configVars?: {
      config?: {
        apiKey?: string;
      };
    };
    [key: string]: unknown;
  }

  export interface TranscodeResponse {
    processFile: boolean;
    preset: string;
    handBrakeMode: boolean;
    FFmpegMode: boolean;
    reQueueAfter?: boolean;
    infoLog: string;
    container?: string;
  }

  export type PluginEntrypoint = (
    file: MediaMetadata,
    librarySettings: LibrarySettings,
    inputs: Record<string, unknown>,
    otherArguments: HostInfo,
  ) => Promise<TranscodeResponse>;

  export interface RuntimeMethods {
    loadDefaultValues: (
      inputs: Record<string, unknown>,
      detailsProvider: () => PluginDetails,
    ) => Record<string, unknown>;
    getNvdecHwaccelPreset: (file: MediaMetadata) => string;
    getNvenc10BitFormatArg: (file: MediaMetadata) => string;
  }

  export interface PluginModule {
    details: () => PluginDetails;
    plugin: PluginEntrypoint;
    dependencies?: readonly string[];
  }
}

export namespace Ffmpeg {
  export type Argv = string[];
  export type RenderedArgs = string;

  export interface RateControlRequest {
    encoderName: Encoder.Name;
    bitrate: Media.BitrateBudget;
  }

  export interface RateControlPlan {
    args: Argv;
    description: string;
  }
}

export namespace Encoder {
  export type HardwareFamily = "nvenc" | "qsv" | "amf" | "vaapi" | "rkmpp" | "videotoolbox";
  export type SoftwareName = "libx265" | "libx264";
  export type HardwareName =
    | "hevc_nvenc"
    | "hevc_amf"
    | "hevc_vaapi"
    | "hevc_rkmpp"
    | "hevc_qsv"
    | "hevc_videotoolbox"
    | "h264_nvenc"
    | "h264_rkmpp"
    | "h264_amf"
    | "h264_qsv"
    | "h264_videotoolbox";
  export type Name = SoftwareName | HardwareName;

  export interface Candidate {
    name: Name;
    codec: Media.VideoCodec;
    family: HardwareFamily | "software";
    inputArgs: Ffmpeg.Argv;
    outputArgs: Ffmpeg.Argv;
    probeFilterArgs: Ffmpeg.Argv;
  }

  export interface SelectionPolicy {
    targetCodec: Media.VideoCodec;
    tryUseGpu: boolean;
    excludedGpuIds: readonly number[];
  }
}

export namespace Runtime {
  export interface ExecCallback {
    (error: Error | null, stdout: string, stderr: string): void;
  }

  export interface ChildProcessAdapter {
    exec: (command: string, callback: ExecCallback) => void;
    execSync: (command: string) => Buffer;
  }

  export interface Dependencies {
    runtime: Tdarr.RuntimeMethods;
    childProcess: ChildProcessAdapter;
  }
}
