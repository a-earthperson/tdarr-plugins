import { exec, execSync } from "node:child_process";
import { createDefaultTdarrRuntime } from "../runtime/tdarrMethods";
import type { Runtime, Tdarr } from "../tdarr/types";
import { MediaFile } from "./mediaFile";
import { TranscodeResponseBuilder } from "./response";

export interface NormalizedPolicy<TPolicy> {
  policy: TPolicy;
  warnings: readonly string[];
}

export interface PluginExecutionContext<TPolicy> {
  media: MediaFile;
  rawFile: Tdarr.MediaMetadata;
  librarySettings: Tdarr.LibrarySettings;
  host: Tdarr.HostInfo;
  policy: TPolicy;
  runtime: Tdarr.RuntimeMethods;
  childProcess: Runtime.ChildProcessAdapter;
  response: TranscodeResponseBuilder;
}

export interface PluginRuntimeOptions {
  runtime?: Tdarr.RuntimeMethods;
  childProcess?: Runtime.ChildProcessAdapter;
}

const defaultChildProcess: Runtime.ChildProcessAdapter = {
  exec,
  execSync,
};

export abstract class TdarrPlugin<TPolicy, TOptions extends PluginRuntimeOptions = PluginRuntimeOptions> {
  protected constructor(
    private readonly detailsProvider: () => Tdarr.PluginDetails,
    protected readonly options: TOptions = {} as TOptions,
  ) {}

  public details(): Tdarr.PluginDetails {
    return this.detailsProvider();
  }

  public entrypoint(): Tdarr.PluginEntrypoint {
    return async (file, librarySettings, inputs, otherArguments) => {
      const runtime = this.options.runtime ?? createDefaultTdarrRuntime();
      const childProcess = this.options.childProcess ?? defaultChildProcess;
      const loadedInputs = runtime.loadDefaultValues(inputs ?? {}, this.detailsProvider);
      const normalized = this.normalizeInputs(loadedInputs);
      const response = this.createResponse();
      response.logAll(normalized.warnings);

      const context: PluginExecutionContext<TPolicy> = {
        media: new MediaFile(file),
        rawFile: file,
        librarySettings,
        host: otherArguments,
        policy: normalized.policy,
        runtime,
        childProcess,
        response,
      };

      await this.execute(context);
      return response.toResponse();
    };
  }

  protected createResponse(): TranscodeResponseBuilder {
    return new TranscodeResponseBuilder();
  }

  protected abstract normalizeInputs(rawInputs: Record<string, unknown>): NormalizedPolicy<TPolicy>;

  protected abstract execute(context: PluginExecutionContext<TPolicy>): Promise<void>;
}

export abstract class VideoTdarrPlugin<
  TPolicy,
  TOptions extends PluginRuntimeOptions = PluginRuntimeOptions,
> extends TdarrPlugin<TPolicy, TOptions> {
  protected async execute(context: PluginExecutionContext<TPolicy>): Promise<void> {
    if (!context.media.isVideo()) {
      context.response.log("File is not a video.").skip();
      return;
    }
    await this.executeVideo(context);
  }

  protected abstract executeVideo(context: PluginExecutionContext<TPolicy>): Promise<void>;
}
