import { streamNeedsResize } from "../../ffmpeg/filters";
import type { Ffmpeg, Media, Tdarr } from "../../tdarr/types";
import { shouldDropForContainerConformance } from "./policy";

const normalize = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const isUnsupportedStream = (stream: Tdarr.FileStream): boolean => {
  const codecName = normalize(stream.codec_name);
  const codecType = normalize(stream.codec_type);
  return (
    codecName === "" ||
    codecName === "none" ||
    codecName === "unknown" ||
    codecType === "" ||
    codecType === "unknown"
  );
};

export const isDisposableVideoStream = (stream: Tdarr.FileStream): boolean => {
  const codecName = normalize(stream.codec_name);
  return codecName === "mjpeg" || codecName === "png";
};

export type StreamDecisionKind =
  | "drop-unsupported"
  | "drop-container-conformance"
  | "drop-data-conformance"
  | "drop-disposable-video"
  | "promote-primary-video"
  | "drop-secondary-video";

export interface StreamDecision {
  kind: StreamDecisionKind;
  streamIndex: number;
  codecName: string;
}

export interface StreamAnalysisResult {
  primaryVideoStreamIndex: number;
  primaryVideoCodec: string;
  passthroughStreamIndexes: number[];
  mappingChanged: boolean;
  resizeRequired: boolean;
  decisions: StreamDecision[];
}

export const analyzeStreams = (params: {
  streams: readonly Tdarr.FileStream[];
  targetResolution: Media.VideoResolutionTarget;
  forceConform: boolean;
  targetContainer: Media.OutputContainer;
}): StreamAnalysisResult => {
  const result: StreamAnalysisResult = {
    primaryVideoStreamIndex: -1,
    primaryVideoCodec: "",
    passthroughStreamIndexes: [],
    mappingChanged: false,
    resizeRequired: false,
    decisions: [],
  };

  params.streams.forEach((stream, index) => {
    const codecName = typeof stream.codec_name === "string" ? stream.codec_name : "unknown";
    if (isUnsupportedStream(stream)) {
      result.decisions.push({ kind: "drop-unsupported", streamIndex: index, codecName });
      result.mappingChanged = true;
      return;
    }

    if (
      params.forceConform &&
      typeof stream.codec_name === "string" &&
      shouldDropForContainerConformance(params.targetContainer, stream.codec_name)
    ) {
      result.decisions.push({
        kind: "drop-container-conformance",
        streamIndex: index,
        codecName,
      });
      result.mappingChanged = true;
      return;
    }

    if (
      params.forceConform &&
      params.targetContainer === "mkv" &&
      normalize(stream.codec_type) === "data"
    ) {
      result.decisions.push({ kind: "drop-data-conformance", streamIndex: index, codecName });
      result.mappingChanged = true;
      return;
    }

    if (normalize(stream.codec_type) === "video") {
      if (isDisposableVideoStream(stream)) {
        result.decisions.push({ kind: "drop-disposable-video", streamIndex: index, codecName });
        result.mappingChanged = true;
        return;
      }
      if (result.primaryVideoStreamIndex === -1) {
        result.primaryVideoStreamIndex = index;
        result.primaryVideoCodec = normalize(stream.codec_name);
        result.resizeRequired = streamNeedsResize(stream, params.targetResolution);
        if (index !== 0) {
          result.decisions.push({ kind: "promote-primary-video", streamIndex: index, codecName });
          result.mappingChanged = true;
        }
        return;
      }
      result.decisions.push({ kind: "drop-secondary-video", streamIndex: index, codecName });
      result.mappingChanged = true;
      return;
    }

    result.passthroughStreamIndexes.push(index);
  });

  return result;
};

export const streamMapTokens = (streamIndexes: readonly number[]): Ffmpeg.Argv =>
  streamIndexes.flatMap((streamIndex) => ["-map", `0:${streamIndex}`]);
