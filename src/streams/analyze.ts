import { streamNeedsResize } from "../ffmpeg/filters";
import { getContainerConformanceDrops } from "../policy/transcodePolicy";
import type { TargetResolution, TdarrFileStream } from "../tdarr/types";

const normalize = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const isUnsupportedStream = (stream: TdarrFileStream): boolean => {
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

export const isDisposableVideoStream = (stream: TdarrFileStream): boolean => {
  const codecName = normalize(stream.codec_name);
  return codecName === "mjpeg" || codecName === "png";
};

export interface StreamAnalysisResult {
  primaryVideoStreamIndex: number;
  primaryVideoCodec: string;
  passthroughStreamIndexes: number[];
  mappingChanged: boolean;
  resizeRequired: boolean;
}

export const analyzeStreams = (params: {
  streams: TdarrFileStream[];
  targetResolution: TargetResolution;
  forceConform: boolean;
  targetContainer: string;
  pushLog: (line: string) => void;
}): StreamAnalysisResult => {
  const result: StreamAnalysisResult = {
    primaryVideoStreamIndex: -1,
    primaryVideoCodec: "",
    passthroughStreamIndexes: [],
    mappingChanged: false,
    resizeRequired: false,
  };

  params.streams.forEach((stream, index) => {
    if (isUnsupportedStream(stream)) {
      const codecName = typeof stream.codec_name === "string" ? stream.codec_name : "unknown";
      params.pushLog(`Dropping stream 0:${index} because codec "${codecName}" is unsupported.`);
      result.mappingChanged = true;
      return;
    }

    if (
      params.forceConform &&
      typeof stream.codec_name === "string" &&
      getContainerConformanceDrops(params.targetContainer, stream.codec_name)
    ) {
      params.pushLog(
        `Dropping stream 0:${index} because codec ${stream.codec_name} is not container-conformant for ${params.targetContainer}.`
      );
      result.mappingChanged = true;
      return;
    }
    if (
      params.forceConform &&
      params.targetContainer === "mkv" &&
      normalize(stream.codec_type) === "data"
    ) {
      params.pushLog(`Dropping stream 0:${index} because data streams are dropped for mkv conformance.`);
      result.mappingChanged = true;
      return;
    }

    if (normalize(stream.codec_type) === "video") {
      if (isDisposableVideoStream(stream)) {
        params.pushLog(`Dropping stream 0:${index} because embedded image streams are not preserved.`);
        result.mappingChanged = true;
        return;
      }
      if (result.primaryVideoStreamIndex === -1) {
        result.primaryVideoStreamIndex = index;
        result.primaryVideoCodec = normalize(stream.codec_name);
        result.resizeRequired = streamNeedsResize(stream, params.targetResolution);
        if (index !== 0) {
          params.pushLog(`Promoting video stream 0:${index} to the first output stream.`);
          result.mappingChanged = true;
        }
        return;
      }
      params.pushLog(`Dropping stream 0:${index} because only one video stream is preserved.`);
      result.mappingChanged = true;
      return;
    }

    result.passthroughStreamIndexes.push(index);
  });

  return result;
};

export const streamMapTokens = (streamIndexes: number[]): string[] =>
  streamIndexes.flatMap((streamIndex) => ["-map", `0:${streamIndex}`]);
