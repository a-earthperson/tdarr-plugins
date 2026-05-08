import { exec, execSync } from "node:child_process";
import { selectEncoder } from "./encoder/selectEncoder";
import { renderArguments, tokenizeArguments } from "./ffmpeg/args";
import { getResolutionFilter, upsertVideoFilterTokens } from "./ffmpeg/filters";
import { getEncoderRateControl } from "./ffmpeg/rateControl";
import {
  calculateBitrateBudget,
  normalizeInputs,
  resolveDurationSeconds,
  resolveTargetContainer,
} from "./policy/transcodePolicy";
import { createDefaultTdarrRuntime } from "./runtime/tdarrMethods";
import { analyzeStreams, streamMapTokens, type StreamDecision } from "./streams/analyze";
import { details } from "./tdarr/details";
import type { Encoder, Ffmpeg, Runtime, Tdarr } from "./tdarr/types";

const bframeSupport = new Set<Encoder.Name>(["hevc_nvenc", "h264_nvenc"]);

const createResponse = (): Tdarr.TranscodeResponse => ({
  processFile: false,
  preset: "",
  handBrakeMode: false,
  FFmpegMode: true,
  reQueueAfter: true,
  infoLog: "",
});

const defaultChildProcess: Runtime.ChildProcessAdapter = {
  exec,
  execSync,
};

const renderStreamDecision = (
  decision: StreamDecision,
  targetContainer: string
): string => {
  switch (decision.kind) {
    case "drop-unsupported":
      return `Dropping stream 0:${decision.streamIndex} because codec "${decision.codecName}" is unsupported.`;
    case "drop-container-conformance":
      return `Dropping stream 0:${decision.streamIndex} because codec ${decision.codecName} is not container-conformant for ${targetContainer}.`;
    case "drop-data-conformance":
      return `Dropping stream 0:${decision.streamIndex} because data streams are dropped for mkv conformance.`;
    case "drop-disposable-video":
      return `Dropping stream 0:${decision.streamIndex} because embedded image streams are not preserved.`;
    case "promote-primary-video":
      return `Promoting video stream 0:${decision.streamIndex} to the first output stream.`;
    case "drop-secondary-video":
      return `Dropping stream 0:${decision.streamIndex} because only one video stream is preserved.`;
  }
};

export const createPlugin =
  (options?: Partial<Runtime.Dependencies>): Tdarr.PluginEntrypoint =>
  async (file, librarySettings, inputs, otherArguments) => {
    void librarySettings;
    const runtime = options?.runtime ?? createDefaultTdarrRuntime();
    const childProcess = options?.childProcess ?? defaultChildProcess;
    const response = createResponse();
    const pushLog = (line: string): void => {
      response.infoLog += `${line}\n`;
    };

    const loadedDefaults = runtime.loadDefaultValues(inputs ?? {}, details);
    const normalizedInputs = normalizeInputs(loadedDefaults);
    normalizedInputs.warnings.forEach(pushLog);
    const policy = normalizedInputs.policy;

    const targetContainerResult = resolveTargetContainer(policy, file);
    targetContainerResult.warnings.forEach(pushLog);
    const targetContainer = targetContainerResult.container;
    response.container = `.${targetContainer}`;

    if (file.fileMedium !== "video") {
      pushLog("File is not a video.");
      return response;
    }

    const duration = resolveDurationSeconds(file);
    if (duration.kind === "invalid") {
      pushLog(`${duration.reason} Skipping transcode.`);
      return response;
    }

    const bitrateResult = calculateBitrateBudget(
      file,
      duration.seconds,
      policy.targetBitrateMultiplier
    );
    if (bitrateResult.kind === "invalid" || !bitrateResult.budget) {
      pushLog(`${bitrateResult.reason} Skipping transcode.`);
      return response;
    }
    if (bitrateResult.budget.current <= policy.bitrateCutoff) {
      pushLog(`Current bitrate is below cutoff ${policy.bitrateCutoff}.`);
      return response;
    }

    const encoderSelection = await selectEncoder({
      policy: {
        targetCodec: policy.targetCodec,
        tryUseGpu: policy.tryUseGpu,
        excludedGpuIds: policy.excludedGpuIds,
      },
      host: otherArguments,
      childProcess,
    });
    encoderSelection.logs.forEach(pushLog);
    const encoder = encoderSelection.candidate;

    const streamResult = analyzeStreams({
      streams: file.ffProbeData?.streams ?? [],
      targetResolution: policy.targetResolution,
      forceConform: policy.forceConform,
      targetContainer,
    });
    streamResult.decisions
      .map((decision) => renderStreamDecision(decision, targetContainer))
      .forEach(pushLog);

    if (streamResult.primaryVideoStreamIndex === -1) {
      pushLog("No supported video stream found.");
      return response;
    }

    const mappedStreamIndexes = [
      streamResult.primaryVideoStreamIndex,
      ...streamResult.passthroughStreamIndexes,
    ];
    const mapTokens = streamMapTokens(mappedStreamIndexes);

    let extraTokens: Ffmpeg.Argv = [];
    if (policy.enable10Bit) {
      extraTokens = [...extraTokens, ...tokenizeArguments(runtime.getNvenc10BitFormatArg(file))];
    }
    if (bframeSupport.has(encoder.name) && policy.bFrames.enabled) {
      extraTokens.push("-bf", String(policy.bFrames.count));
    }
    const resolutionFilter = getResolutionFilter(encoder.name, policy.targetResolution);
    extraTokens = upsertVideoFilterTokens(extraTokens, resolutionFilter);

    const rateControl = getEncoderRateControl({
      encoderName: encoder.name,
      bitrate: bitrateResult.budget,
    });

    pushLog(`Encoder selected as ${encoder.name}.`);
    pushLog(`Encoder rate control = ${rateControl.description}.`);
    pushLog(`Container for output selected as ${targetContainer}.`);
    pushLog(`Resolution target selected as ${policy.targetResolution}.`);
    pushLog(`Current bitrate = ${bitrateResult.budget.current}`);
    pushLog("Bitrate settings:");
    pushLog(`Target = ${bitrateResult.budget.target}`);
    pushLog(`Minimum = ${bitrateResult.budget.minimum}`);
    pushLog(`Maximum = ${bitrateResult.budget.maximum}`);

    if (
      streamResult.primaryVideoCodec === policy.targetCodec &&
      file.container === targetContainer &&
      !streamResult.resizeRequired &&
      !streamResult.mappingChanged
    ) {
      pushLog(`File is already ${policy.targetCodec} and in ${targetContainer}.`);
      return response;
    }

    if (streamResult.primaryVideoCodec === policy.targetCodec && !streamResult.resizeRequired) {
      pushLog(
        `File video is already ${policy.targetCodec} but stream mapping/container needs normalization. Remuxing.`
      );
      response.preset = renderArguments(["<io>", ...mapTokens, "-c", "copy", ...extraTokens]);
      response.processFile = true;
      return response;
    }

    const prefixTokens: Ffmpeg.Argv = [];
    if (encoder.family === "nvenc") {
      prefixTokens.push(...tokenizeArguments(runtime.getNvdecHwaccelPreset(file)));
    }
    prefixTokens.push(...encoder.inputArgs);
    if (targetContainer === "ts" || targetContainer === "avi") {
      prefixTokens.push("-fflags", "+genpts");
    }

    const transcodeTokens: Ffmpeg.Argv = [
      ...mapTokens,
      "-c",
      "copy",
      "-c:v",
      encoder.name,
      ...encoder.outputArgs,
      ...rateControl.args,
      "-max_muxing_queue_size",
      "9999",
      ...extraTokens,
    ];

    response.preset = renderArguments([...prefixTokens, "<io>", ...transcodeTokens]);
    response.processFile = true;
    pushLog(`File is not in ${policy.targetCodec}. Transcoding.`);
    return response;
  };

export { details };
export const plugin = createPlugin();
