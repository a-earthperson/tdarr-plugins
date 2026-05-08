import type { Tdarr } from "../tdarr/types";

export class TranscodeResponseBuilder {
  private readonly response: Tdarr.TranscodeResponse;

  public constructor(initial?: Partial<Tdarr.TranscodeResponse>) {
    this.response = {
      processFile: false,
      preset: "",
      handBrakeMode: false,
      FFmpegMode: true,
      reQueueAfter: true,
      infoLog: "",
      ...initial,
    };
  }

  public setContainer(container: string): this {
    this.response.container = container.startsWith(".") ? container : `.${container}`;
    return this;
  }

  public log(message: string): this {
    this.response.infoLog += `${message}\n`;
    return this;
  }

  public logAll(messages: readonly string[]): this {
    messages.forEach((message) => this.log(message));
    return this;
  }

  public transcode(preset: string): this {
    this.response.preset = preset;
    this.response.processFile = true;
    return this;
  }

  public skip(): this {
    this.response.processFile = false;
    this.response.preset = "";
    return this;
  }

  public toResponse(): Tdarr.TranscodeResponse {
    return { ...this.response };
  }
}
