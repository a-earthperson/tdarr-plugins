import { VideoTdarrPlugin, type PluginExecutionContext } from "../../core/plugin";
import type { Runtime, Tdarr } from "../../tdarr/types";
import { AudioStreamDetector } from "./audio";
import { details } from "./details";
import { LoudnormCommandBuilder, LoudnormReportParser, normalisationStageTag, renderPreset } from "./loudnorm";
import { normalizeInputs } from "./policy";
import { createTdarrReportClient } from "./reports";
import type { TwoPassLoudness } from "./types";

type FetchImpl = Parameters<typeof createTdarrReportClient>[0]["fetchImpl"];

interface TwoPassLoudnessOptions extends Partial<Pick<Runtime.Dependencies, "childProcess">> {
  runtime?: Tdarr.RuntimeMethods;
  reportClient?: TwoPassLoudness.TdarrReportClient;
  fetchImpl?: FetchImpl;
}

class LoudnessStage {
  private constructor(public readonly value?: TwoPassLoudness.NormalisationStage) {}

  public static from(file: Tdarr.MediaMetadata): LoudnessStage {
    const stage = file.ffProbeData?.format?.tags?.[normalisationStageTag];
    if (stage === "FirstPassComplete" || stage === "Complete") {
      return new LoudnessStage(stage);
    }
    return new LoudnessStage(undefined);
  }

  public isPendingFirstPass(): boolean {
    return this.value === undefined;
  }

  public isComplete(): boolean {
    return this.value === "Complete";
  }
}

class TwoPassLoudnessPlugin extends VideoTdarrPlugin<TwoPassLoudness.Policy, TwoPassLoudnessOptions> {
  private readonly audioDetector = new AudioStreamDetector();
  private readonly commandBuilder = new LoudnormCommandBuilder();
  private readonly reportParser = new LoudnormReportParser();

  public constructor(options?: TwoPassLoudnessOptions) {
    super(details, options);
  }

  protected createResponse() {
    return super.createResponse().setContainer(".mkv");
  }

  protected normalizeInputs(rawInputs: Record<string, unknown>): TwoPassLoudness.NormalizedInputResult {
    return normalizeInputs(rawInputs);
  }

  protected async executeVideo(context: PluginExecutionContext<TwoPassLoudness.Policy>): Promise<void> {
    const audioStreams = this.audioDetector.detect(context.rawFile);

    if (audioStreams.isEmpty()) {
      context.response.log("No audio streams detected.").skip();
      return;
    }

    const stage = LoudnessStage.from(context.rawFile);
    if (stage.isPendingFirstPass()) {
      context.response.log(`Detected ${audioStreams.length} audio stream(s). Running loudnorm analysis pass.`);
      context.response.transcode(
        renderPreset(
          this.commandBuilder.buildFirstPassArgs({
            audioStreams: audioStreams.toArray(),
            policy: context.policy,
          }),
        ),
      );
      return;
    }

    if (stage.isComplete()) {
      context.response.log("File is already marked as normalised.").skip();
      return;
    }

    const reportClient = this.resolveReportClient(context);
    const reports = await reportClient.listFootprintReports(context.rawFile);
    if (reports.length === 0) {
      throw new Error("No Tdarr job reports found for loudnorm first pass.");
    }
    const report = await reportClient.readJobFile(context.rawFile, reports[0]);
    const measuredValues = this.reportParser.parse(report);

    if (measuredValues.length < audioStreams.length) {
      throw new Error(`Expected ${audioStreams.length} loudnorm measurement set(s), found ${measuredValues.length}.`);
    }

    context.response.log(`Read ${measuredValues.length} loudnorm measurement set(s) from first-pass report.`);
    context.response.transcode(
      renderPreset(
        this.commandBuilder.buildSecondPassArgs({
          audioStreams: audioStreams.toArray(),
          measuredValues,
          policy: context.policy,
        }),
      ),
    );
    context.response.log("Applying loudness normalization and appending normalized audio streams.");
  }

  private resolveReportClient(
    context: PluginExecutionContext<TwoPassLoudness.Policy>,
  ): TwoPassLoudness.TdarrReportClient {
    return (
      this.options.reportClient ??
      createTdarrReportClient({
        policy: context.policy,
        host: context.host,
        fetchImpl: this.options.fetchImpl,
      })
    );
  }
}

export const createPlugin = (options?: TwoPassLoudnessOptions): Tdarr.PluginEntrypoint =>
  new TwoPassLoudnessPlugin(options).entrypoint();

export { details };
export const plugin = createPlugin();
