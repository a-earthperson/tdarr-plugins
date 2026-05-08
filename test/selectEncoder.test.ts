import { describe, expect, test } from "vitest";
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
      exec: (_command, callback) => {
        callback(new Error("unsupported"), "", "");
      },
      execSync: (): Buffer => Buffer.from(""),
    };
    const encoder: Awaited<ReturnType<typeof selectEncoder>> = await selectEncoder({
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
      execSync: (command: string): Buffer => {
        if (command.includes("--query-gpu=name")) return Buffer.from("GPU-0\n");
        return Buffer.from("10");
      },
    };
    const encoder: Awaited<ReturnType<typeof selectEncoder>> = await selectEncoder({
      policy: { ...basePolicy },
      host: { workerType: "gpu", ffmpegPath: "ffmpeg" },
      childProcess,
    });
    expect(encoder.candidate.name).toBe("hevc_nvenc");
    expect(encoder.candidate.outputArgs).toEqual(["-gpu", "0"]);
  });
});
