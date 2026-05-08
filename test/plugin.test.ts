import { describe, expect, test } from "vitest";
import { createPlugin } from "../src/plugins/reencode";
import type { Runtime, Tdarr } from "../src/tdarr/types";

const runtime: Tdarr.RuntimeMethods = {
  loadDefaultValues: (inputs, detailsProvider) => {
    const next: Record<string, unknown> = { ...inputs };
    const detailSpec: readonly Tdarr.FormInputSpec[] = detailsProvider().Inputs;
    detailSpec.forEach((spec) => {
      if (next[spec.name] === undefined || next[spec.name] === "") {
        next[spec.name] = spec.defaultValue;
      }
    });
    return next;
  },
  getNvdecHwaccelPreset: () => "-hwaccel cuda -hwaccel_output_format cuda",
  getNvenc10BitFormatArg: () => "-vf scale_cuda=format=p010le ",
};

const childProcess: Runtime.ChildProcessAdapter = {
  exec: (_command, callback) => {
    callback(new Error("no gpu"), "", "");
  },
  execSync: () => Buffer.from(""),
};

function baseFile(): Tdarr.MediaMetadata {
  return {
    fileMedium: "video",
    container: "mkv",
    file_size: 2000,
    ffProbeData: {
      format: {
        duration: "1200",
      },
      streams: [
        { codec_type: "audio", codec_name: "ac3" },
        { codec_type: "video", codec_name: "h264", width: 1920, height: 1080 },
        { codec_type: "subtitle", codec_name: "srt" },
      ],
    },
  };
}

describe("plugin decision flow", () => {
  test("transcodes when source codec differs", async () => {
    const plugin: Tdarr.PluginEntrypoint = createPlugin({ runtime, childProcess });
    const response: Tdarr.TranscodeResponse = await plugin(
      baseFile(),
      {},
      {
        target_codec: "hevc",
        target_bitrate_multiplier: 0.5,
        target_resolution: "none",
        container: "mkv",
      },
      {
        workerType: "cpu",
        ffmpegPath: "ffmpeg",
      },
    );
    expect(response.processFile).toBe(true);
    expect(response.preset).toContain("-c:v libx265");
    expect(response.infoLog).toContain("Transcoding");
  });

  test("remuxes when codec already matches but mapping changes", async () => {
    const plugin: Tdarr.PluginEntrypoint = createPlugin({ runtime, childProcess });
    const file: Tdarr.MediaMetadata = baseFile();
    if (!file.ffProbeData) throw new Error("Expected fixture ffProbeData.");
    file.ffProbeData.streams[1].codec_name = "hevc";
    const response: Tdarr.TranscodeResponse = await plugin(
      file,
      {},
      {
        target_codec: "hevc",
        target_bitrate_multiplier: 0.5,
        target_resolution: "none",
        container: "mkv",
      },
      {
        workerType: "cpu",
        ffmpegPath: "ffmpeg",
      },
    );
    expect(response.processFile).toBe(true);
    expect(response.preset).toContain("-c copy");
    expect(response.preset).not.toContain("-c:v");
  });

  test("skips when already compliant", async () => {
    const plugin: Tdarr.PluginEntrypoint = createPlugin({ runtime, childProcess });
    const file: Tdarr.MediaMetadata = {
      fileMedium: "video",
      container: "mkv",
      file_size: 2000,
      ffProbeData: {
        format: { duration: "1200" },
        streams: [
          { codec_type: "video", codec_name: "hevc", width: 1280, height: 720 },
          { codec_type: "audio", codec_name: "ac3" },
        ],
      },
    };
    const response: Tdarr.TranscodeResponse = await plugin(
      file,
      {},
      {
        target_codec: "hevc",
        target_bitrate_multiplier: 0.5,
        target_resolution: "none",
        container: "mkv",
      },
      {
        workerType: "cpu",
        ffmpegPath: "ffmpeg",
      },
    );
    expect(response.processFile).toBe(false);
    expect(response.preset).toBe("");
  });
});
