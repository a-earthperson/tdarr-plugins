import { VideoTdarrPlugin, type PluginExecutionContext } from "../../core/plugin";
import { EncoderSelector } from "../../encoder/selectEncoder";
import { FfmpegArguments } from "../../ffmpeg/args";
import { getResolutionFilter } from "../../ffmpeg/filters";
import { RateControlPlanner } from "../../ffmpeg/rateControl";
import type { Encoder, Ffmpeg, Media, Runtime, Tdarr } from "../../tdarr/types";
import { details } from "./details";
import { normalizeInputs } from "./policy";
import { ReencodeStreamAnalyzer, streamMapTokens, type StreamDecision } from "./streams";
import type { Reencode } from "./types";

const bframeSupport = new Set<Encoder.Name>(["hevc_nvenc", "h264_nvenc"]);

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

class ReencodePlugin extends VideoTdarrPlugin<Reencode.Policy, Partial<Runtime.Dependencies>> {
  public constructor(options?: Partial<Runtime.Dependencies>) {
    super(details, options);
  }

  protected normalizeInputs(rawInputs: Record<string, unknown>): Reencode.NormalizedInputResult {
    return normalizeInputs(rawInputs);
  }

  protected async executeVideo(
    context: PluginExecutionContext<Reencode.Policy>
  ): Promise<void> {
    const { media, policy, response } = context;
    const targetContainerResult = media.resolveContainer(policy.container);
    response.logAll(targetContainerResult.warnings);
    const targetContainer = targetContainerResult.container;
    response.setContainer(targetContainer);

    const duration = media.duration();
    if (duration.kind === "invalid") {
      response.log(`${duration.reason} Skipping transcode.`).skip();
      return;
    }

    const bitrateResult = media.bitrateBudget(duration.seconds, policy.targetBitrateMultiplier);
    if (bitrateResult.kind === "invalid" || !bitrateResult.budget) {
      response.log(`${bitrateResult.reason} Skipping transcode.`).skip();
      return;
    }
    if (bitrateResult.budget.current <= policy.bitrateCutoff) {
      response.log(`Current bitrate is below cutoff ${policy.bitrateCutoff}.`).skip();
      return;
    }

    const encoderSelection = await new EncoderSelector(context.childProcess).select({
      policy: {
        targetCodec: policy.targetCodec,
        tryUseGpu: policy.tryUseGpu,
        excludedGpuIds: policy.excludedGpuIds,
      },
      host: context.host,
    });
    response.logAll(encoderSelection.logs);
    const encoder = encoderSelection.candidate;

    const streamResult = new ReencodeStreamAnalyzer(
      policy.targetResolution,
      policy.forceConform,
      targetContainer
    ).analyze(media.streams);
    response.logAll(
      streamResult.decisions.map((decision) => renderStreamDecision(decision, targetContainer))
    );

    if (streamResult.primaryVideoStreamIndex === -1) {
      response.log("No supported video stream found.").skip();
      return;
    }

    const mapTokens = streamMapTokens([
      streamResult.primaryVideoStreamIndex,
      ...streamResult.passthroughStreamIndexes,
    ]);
    let extraArgs = FfmpegArguments.empty();
    if (policy.enable10Bit) {
      extraArgs = extraArgs.concat(
        FfmpegArguments.parse(context.runtime.getNvenc10BitFormatArg(context.rawFile))
      );
    }
    if (bframeSupport.has(encoder.name) && policy.bFrames.enabled) {
      extraArgs = extraArgs.append("-bf", String(policy.bFrames.count));
    }
    extraArgs = extraArgs.upsertVideoFilter(
      getResolutionFilter(encoder.name, policy.targetResolution)
    );

    const rateControl = new RateControlPlanner().plan({
      encoderName: encoder.name,
      bitrate: bitrateResult.budget,
    });

    this.logTranscodePlan(context, encoder, rateControl, targetContainer, bitrateResult.budget);

    if (
      streamResult.primaryVideoCodec === policy.targetCodec &&
      context.rawFile.container === targetContainer &&
      !streamResult.resizeRequired &&
      !streamResult.mappingChanged
    ) {
      response.log(`File is already ${policy.targetCodec} and in ${targetContainer}.`).skip();
      return;
    }

    if (streamResult.primaryVideoCodec === policy.targetCodec && !streamResult.resizeRequired) {
      response.log(
        `File video is already ${policy.targetCodec} but stream mapping/container needs normalization. Remuxing.`
      );
      response.transcode(
        FfmpegArguments.of(["<io>", ...mapTokens, "-c", "copy"])
          .concat(extraArgs)
          .render()
      );
      return;
    }

    response.transcode(
      this.buildTranscodePreset({
        encoder,
        rateControlArgs: rateControl.args,
        mapTokens,
        extraArgs,
        targetContainer,
        context,
      })
    );
    response.log(`File is not in ${policy.targetCodec}. Transcoding.`);
  }

  private logTranscodePlan(
    context: PluginExecutionContext<Reencode.Policy>,
    encoder: Encoder.Candidate,
    rateControl: Ffmpeg.RateControlPlan,
    targetContainer: string,
    bitrate: Media.BitrateBudget
  ): void {
    const { response, policy } = context;
    response.log(`Encoder selected as ${encoder.name}.`);
    response.log(`Encoder rate control = ${rateControl.description}.`);
    response.log(`Container for output selected as ${targetContainer}.`);
    response.log(`Resolution target selected as ${policy.targetResolution}.`);
    response.log(`Current bitrate = ${bitrate.current}`);
    response.log("Bitrate settings:");
    response.log(`Target = ${bitrate.target}`);
    response.log(`Minimum = ${bitrate.minimum}`);
    response.log(`Maximum = ${bitrate.maximum}`);
  }

  private buildTranscodePreset(params: {
    encoder: Encoder.Candidate;
    rateControlArgs: Ffmpeg.Argv;
    mapTokens: Ffmpeg.Argv;
    extraArgs: FfmpegArguments;
    targetContainer: string;
    context: PluginExecutionContext<Reencode.Policy>;
  }): string {
    let prefixArgs = FfmpegArguments.empty();
    if (params.encoder.family === "nvenc") {
      prefixArgs = prefixArgs.concat(
        FfmpegArguments.parse(params.context.runtime.getNvdecHwaccelPreset(params.context.rawFile))
      );
    }
    prefixArgs = prefixArgs.append(...params.encoder.inputArgs);
    if (params.targetContainer === "ts" || params.targetContainer === "avi") {
      prefixArgs = prefixArgs.append("-fflags", "+genpts");
    }

    const transcodeArgs = FfmpegArguments.of([
      "<io>",
      ...params.mapTokens,
      "-c",
      "copy",
      "-c:v",
      params.encoder.name,
      ...params.encoder.outputArgs,
      ...params.rateControlArgs,
      "-max_muxing_queue_size",
      "9999",
    ]).concat(params.extraArgs);

    return prefixArgs.concat(transcodeArgs).render();
  }
}

export const createPlugin = (
  options?: Partial<Runtime.Dependencies>
): Tdarr.PluginEntrypoint => new ReencodePlugin(options).entrypoint();

export { details };
export const plugin = createPlugin();
