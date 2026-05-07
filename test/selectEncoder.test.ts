import { describe, expect, test, vi } from "vitest";
import { selectEncoder } from "../src/encoder/selectEncoder";
import type { ChildProcessAdapter, TdarrPluginInput, TdarrResponse } from "../src/tdarr/types";

const baseInputs: TdarrPluginInput = {
  target_codec: "hevc",
  target_bitrate_multiplier: 0.5,
  target_resolution: "none",
  try_use_gpu: true,
  container: "mkv",
  bitrate_cutoff: 0,
  enable_10bit: false,
  bframes_enabled: false,
  bframes_value: 5,
  force_conform: false,
  exclude_gpus: "",
  exclude_gpu_ids: [],
};

const baseResponse: TdarrResponse = {
  processFile: false,
  preset: "",
  handBrakeMode: false,
  FFmpegMode: true,
  reQueueAfter: true,
  infoLog: "",
};

describe("selectEncoder", () => {
  test("falls back to software encoder when no gpu encoders are available", async () => {
    const childProcess: ChildProcessAdapter = {
      exec: (_command, callback) => callback(new Error("unsupported"), "", ""),
      execSync: vi.fn(() => Buffer.from("")),
    };
    const encoder = await selectEncoder({
      response: { ...baseResponse },
      inputs: { ...baseInputs },
      otherArguments: { workerType: "gpu", ffmpegPath: "ffmpeg" },
      childProcess,
    });
    expect(encoder.encoder).toBe("libx265");
  });

  test("selects nvenc when probe passes", async () => {
    const childProcess: ChildProcessAdapter = {
      exec: (command, callback) => {
        if (command.includes("hevc_nvenc")) callback(null, "", "");
        else callback(new Error("unsupported"), "", "");
      },
      execSync: vi.fn((command) => {
        if (command.includes("--query-gpu=name")) return Buffer.from("GPU-0\n");
        return Buffer.from("10");
      }),
    };
    const encoder = await selectEncoder({
      response: { ...baseResponse },
      inputs: { ...baseInputs },
      otherArguments: { workerType: "gpu", ffmpegPath: "ffmpeg" },
      childProcess,
    });
    expect(encoder.encoder).toBe("hevc_nvenc");
    expect(encoder.outputArgs).toContain("-gpu 0");
  });
});
