import { describe, expect, test, vi } from "vitest";
import { selectEncoder } from "../src/encoder/selectEncoder";
import type { Encoder, Runtime } from "../src/tdarr/types";

const basePolicy: Encoder.SelectionPolicy = {
  targetCodec: "hevc",
  tryUseGpu: true,
  excludedGpuIds: [],
};

describe("selectEncoder", () => {
  test("falls back to software encoder when no gpu encoders are available", async () => {
    const childProcess: Runtime.ChildProcessAdapter = {
      exec: (_command, callback) => callback(new Error("unsupported"), "", ""),
      execSync: vi.fn(() => Buffer.from("")),
    };
    const encoder = await selectEncoder({
      policy: { ...basePolicy },
      host: { workerType: "gpu", ffmpegPath: "ffmpeg" },
      childProcess,
    });
    expect(encoder.candidate.name).toBe("libx265");
  });

  test("selects nvenc when probe passes", async () => {
    const childProcess: Runtime.ChildProcessAdapter = {
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
      policy: { ...basePolicy },
      host: { workerType: "gpu", ffmpegPath: "ffmpeg" },
      childProcess,
    });
    expect(encoder.candidate.name).toBe("hevc_nvenc");
    expect(encoder.candidate.outputArgs).toEqual(["-gpu", "0"]);
  });
});
