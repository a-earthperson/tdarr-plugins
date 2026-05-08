import { createDefaultTdarrRuntime } from "../../runtime/tdarrMethods";
import type { Runtime, Tdarr } from "../../tdarr/types";
import { detectAudioStreams } from "./audio";
import { details } from "./details";
import {
  buildFirstPassArgs,
  buildSecondPassArgs,
  normalisationStageTag,
  parseLoudnormValuesFromReport,
  renderPreset,
} from "./loudnorm";
import { normalizeInputs } from "./policy";
import { createTdarrReportClient } from "./reports";
import type { TwoPassLoudness } from "./types";

const createResponse = (): Tdarr.TranscodeResponse => ({
  processFile: false,
  preset: "",
  container: ".mkv",
  handBrakeMode: false,
  FFmpegMode: true,
  reQueueAfter: true,
  infoLog: "",
});

const getNormalisationStage = (
  file: Tdarr.MediaMetadata
): TwoPassLoudness.NormalisationStage | undefined => {
  const stage = file.ffProbeData?.format?.tags?.[normalisationStageTag];
  if (stage === "FirstPassComplete" || stage === "Complete") return stage;
  return undefined;
};

export const createPlugin =
  (options?: {
    runtime?: Tdarr.RuntimeMethods;
    reportClient?: TwoPassLoudness.TdarrReportClient;
    fetchImpl?: Parameters<typeof createTdarrReportClient>[0]["fetchImpl"];
  } & Partial<Pick<Runtime.Dependencies, "childProcess">>): Tdarr.PluginEntrypoint =>
  async (file, librarySettings, inputs, otherArguments) => {
    void librarySettings;
    void options?.childProcess;
    const runtime = options?.runtime ?? createDefaultTdarrRuntime();
    const response = createResponse();
    const pushLog = (line: string): void => {
      response.infoLog += `${line}\n`;
    };

    if (file.fileMedium !== "video") {
      pushLog("File is not a video.");
      return response;
    }

    const loadedDefaults = runtime.loadDefaultValues(inputs ?? {}, details);
    const normalizedInputs = normalizeInputs(loadedDefaults);
    normalizedInputs.warnings.forEach(pushLog);
    const policy = normalizedInputs.policy;
    const audioStreams = detectAudioStreams(file);

    if (audioStreams.length === 0) {
      pushLog("No audio streams detected.");
      return response;
    }

    const stage = getNormalisationStage(file);
    if (!stage) {
      pushLog(`Detected ${audioStreams.length} audio stream(s). Running loudnorm analysis pass.`);
      response.preset = renderPreset(
        buildFirstPassArgs({
          audioStreams,
          policy,
        })
      );
      response.processFile = true;
      return response;
    }

    if (stage === "Complete") {
      pushLog("File is already marked as normalised.");
      return response;
    }

    const reportClient =
      options?.reportClient ??
      createTdarrReportClient({
        policy,
        host: otherArguments,
        fetchImpl: options?.fetchImpl,
      });
    const reports = await reportClient.listFootprintReports(file);
    if (reports.length === 0) {
      throw new Error("No Tdarr job reports found for loudnorm first pass.");
    }
    const report = await reportClient.readJobFile(file, reports[0]);
    const measuredValues = parseLoudnormValuesFromReport(report);

    if (measuredValues.length < audioStreams.length) {
      throw new Error(
        `Expected ${audioStreams.length} loudnorm measurement set(s), found ${measuredValues.length}.`
      );
    }

    pushLog(`Read ${measuredValues.length} loudnorm measurement set(s) from first-pass report.`);
    response.preset = renderPreset(
      buildSecondPassArgs({
        audioStreams,
        measuredValues,
        policy,
      })
    );
    response.processFile = true;
    pushLog("Applying loudness normalization and appending normalized audio streams.");
    return response;
  };

export { details };
export const plugin = createPlugin();
