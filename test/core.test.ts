import { describe, expect, test } from "vitest";
import { MediaFile } from "../src/core/mediaFile";
import { TranscodeResponseBuilder } from "../src/core/response";
import { FfmpegArguments } from "../src/ffmpeg/args";
import type { Tdarr } from "../src/tdarr/types";

describe("core domain abstractions", () => {
  test("MediaFile resolves original container through the supported-container invariant", () => {
    const media = new MediaFile({ container: "weird" });
    const result = media.resolveContainer("original");

    expect(result.container).toBe("mkv");
    expect(result.warnings[0]).toContain("unsupported");
  });

  test("MediaFile creates bitrate budgets only from valid file invariants", () => {
    const media = new MediaFile({ file_size: 100 });

    expect(media.bitrateBudget(100, 0).kind).toBe("invalid");
    expect(media.bitrateBudget(100, 0.5).budget).toMatchObject({
      current: 8388608,
      target: 4194304,
    });
  });

  test("TranscodeResponseBuilder centralizes Tdarr response mutation", () => {
    const response = new TranscodeResponseBuilder()
      .setContainer("mkv")
      .log("hello")
      .transcode("<io> -c copy")
      .toResponse();

    expect(response).toMatchObject<Tdarr.TranscodeResponse>({
      processFile: true,
      preset: "<io> -c copy",
      container: ".mkv",
      handBrakeMode: false,
      FFmpegMode: true,
      infoLog: "hello\n",
    });
  });

  test("FfmpegArguments behaves as an immutable command value object", () => {
    const base = FfmpegArguments.of(["<io>", "-vf", "format=yuv420p"]);
    const next = base.upsertVideoFilter("scale=1280:720");

    expect(base.render()).toBe("<io> -vf format=yuv420p");
    expect(next.render()).toBe("<io> -vf format=yuv420p,scale=1280:720");
  });
});
