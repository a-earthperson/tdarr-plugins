import { exec, execSync } from "node:child_process";
import { selectEncoder } from "./encoder/selectEncoder";
import { renderArguments, tokenizeArguments } from "./ffmpeg/args";
import { getResolutionFilter, upsertVideoFilterTokens } from "./ffmpeg/filters";
import { getEncoderRateControl } from "./ffmpeg/rateControl";
import {
  calculateBitrates,
  normalizeInputs,
  resolveDurationSeconds,
  resolveTargetContainer,
} from "./policy/transcodePolicy";
import { createDefaultTdarrRuntime } from "./runtime/tdarrMethods";
import { analyzeStreams, streamMapTokens } from "./streams/analyze";
import { details } from "./tdarr/details";
import type { ChildProcessAdapter, TdarrFile, TdarrResponse, TdarrRuntimeMethods } from "./tdarr/types";

const bframeSupport = new Set(["hevc_nvenc", "h264_nvenc"]);

const createResponse = (): TdarrResponse => ({
  processFile: false,
  preset: "",
  handBrakeMode: false,
  FFmpegMode: true,
  reQueueAfter: true,
  infoLog: "",
});

const defaultChildProcess: ChildProcessAdapter = {
  exec,
  execSync,
};

export const createPlugin = (options?: {
  runtime?: TdarrRuntimeMethods;
  childProcess?: ChildProcessAdapter;
}) => async (
  file: TdarrFile,
  librarySettings: unknown,
  inputs: Record<string, unknown>,
  otherArguments: Record<string, unknown>
): Promise<TdarrResponse> => {
  void librarySettings;
  const runtime = options?.runtime ?? createDefaultTdarrRuntime();
  const childProcess = options?.childProcess ?? defaultChildProcess;
  const response = createResponse();
  const pushLog = (line: string): void => {
    response.infoLog += `${line}\n`;
  };

  const loadedDefaults = runtime.loadDefaultValues(inputs ?? {}, details);
  const normalizedInputs = normalizeInputs(loadedDefaults, response);
  const targetContainer = resolveTargetContainer(normalizedInputs, file);
  response.container = `.${targetContainer}`;

  if (file.fileMedium !== "video") {
    pushLog("File is not a video.");
    return response;
  }

  const durationResult = resolveDurationSeconds(file, response);
  if (!durationResult.valid) return response;
  const bitrateResult = calculateBitrates(
    file,
    durationResult.duration,
    normalizedInputs.target_bitrate_multiplier,
    response
  );
  if (!bitrateResult.valid) return response;
  if (bitrateResult.currentBitrate <= normalizedInputs.bitrate_cutoff) {
    pushLog(`Current bitrate is below cutoff ${normalizedInputs.bitrate_cutoff}.`);
    return response;
  }

  const encoder = await selectEncoder({
    response,
    inputs: normalizedInputs,
    otherArguments,
    childProcess,
  });
  if (!encoder.encoder) {
    pushLog("No encoder could be selected.");
    return response;
  }

  const streams = file.ffProbeData?.streams ?? [];
  const streamResult = analyzeStreams({
    streams,
    targetResolution: normalizedInputs.target_resolution,
    forceConform: normalizedInputs.force_conform,
    targetContainer,
    pushLog,
  });

  if (streamResult.primaryVideoStreamIndex === -1) {
    pushLog("No supported video stream found.");
    return response;
  }

  const mappedStreamIndexes = [
    streamResult.primaryVideoStreamIndex,
    ...streamResult.passthroughStreamIndexes,
  ];
  const mapTokens = streamMapTokens(mappedStreamIndexes);

  let extraTokens: string[] = [];
  if (normalizedInputs.enable_10bit) {
    extraTokens = [...extraTokens, ...tokenizeArguments(runtime.getNvenc10BitFormatArg(file))];
  }
  if (bframeSupport.has(encoder.encoder) && normalizedInputs.bframes_enabled) {
    extraTokens.push("-bf", String(normalizedInputs.bframes_value));
  }
  const resolutionFilter = getResolutionFilter(encoder.encoder, normalizedInputs.target_resolution);
  extraTokens = upsertVideoFilterTokens(extraTokens, resolutionFilter);

  const rateControl = getEncoderRateControl({
    encoder: encoder.encoder,
    currentBitrate: bitrateResult.currentBitrate,
    targetBitrate: bitrateResult.targetBitrate,
    maximumBitrate: bitrateResult.maximumBitrate,
  });

  pushLog(`Encoder selected as ${encoder.encoder}.`);
  pushLog(`Encoder rate control = ${rateControl.description}.`);
  pushLog(`Container for output selected as ${targetContainer}.`);
  pushLog(`Resolution target selected as ${normalizedInputs.target_resolution}.`);
  pushLog(`Current bitrate = ${bitrateResult.currentBitrate}`);
  pushLog("Bitrate settings:");
  pushLog(`Target = ${bitrateResult.targetBitrate}`);
  pushLog(`Minimum = ${bitrateResult.minimumBitrate}`);
  pushLog(`Maximum = ${bitrateResult.maximumBitrate}`);

  if (
    streamResult.primaryVideoCodec === normalizedInputs.target_codec &&
    file.container === targetContainer &&
    !streamResult.resizeRequired &&
    !streamResult.mappingChanged
  ) {
    pushLog(`File is already ${normalizedInputs.target_codec} and in ${targetContainer}.`);
    return response;
  }

  if (
    streamResult.primaryVideoCodec === normalizedInputs.target_codec &&
    !streamResult.resizeRequired
  ) {
    pushLog(
      `File video is already ${normalizedInputs.target_codec} but stream mapping/container needs normalization. Remuxing.`
    );
    response.preset = renderArguments(["<io>", ...mapTokens, "-c", "copy", ...extraTokens]);
    response.processFile = true;
    return response;
  }

  const prefixTokens: string[] = [];
  if (encoder.encoder.includes("nvenc")) {
    prefixTokens.push(...tokenizeArguments(runtime.getNvdecHwaccelPreset(file)));
  }
  prefixTokens.push(...tokenizeArguments(encoder.inputArgs ?? ""));
  if (targetContainer === "ts" || targetContainer === "avi") {
    prefixTokens.push("-fflags", "+genpts");
  }

  const transcodeTokens = [
    ...mapTokens,
    "-c",
    "copy",
    "-c:v",
    encoder.encoder,
    ...tokenizeArguments(encoder.outputArgs ?? ""),
    ...rateControl.tokens,
    "-max_muxing_queue_size",
    "9999",
    ...extraTokens,
  ];

  response.preset = renderArguments([...prefixTokens, "<io>", ...transcodeTokens]);
  response.processFile = true;
  pushLog(`File is not in ${normalizedInputs.target_codec}. Transcoding.`);
  return response;
};

export { details };
export const plugin = createPlugin();
