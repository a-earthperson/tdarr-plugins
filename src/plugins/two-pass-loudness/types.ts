import type { Tdarr } from "../../tdarr/types";

export namespace TwoPassLoudness {
  export type NormalisationStage = "FirstPassComplete" | "Complete";

  export interface Policy {
    integratedLoudness: number;
    loudnessRange: number;
    truePeak: number;
    outputCodec: "aac" | "ac3";
    outputBitrate: string;
    serverIp?: string;
    serverPort?: string;
  }

  export interface NormalizedInputResult {
    policy: Policy;
    warnings: readonly string[];
  }

  export interface AudioStream {
    streamIndex: number;
    audioIndex: number;
    codecName: string;
  }

  export interface LoudnormMeasuredValues {
    input_i: string;
    input_tp: string;
    input_lra: string;
    input_thresh: string;
    output_i?: string;
    output_tp?: string;
    output_lra?: string;
    output_thresh?: string;
    normalization_type?: string;
    target_offset: string;
  }

  export interface TdarrReportClient {
    listFootprintReports: (file: Tdarr.MediaMetadata) => Promise<string[]>;
    readJobFile: (file: Tdarr.MediaMetadata, jobFileId: string) => Promise<string>;
  }
}
