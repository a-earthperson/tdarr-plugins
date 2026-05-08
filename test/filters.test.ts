import { describe, expect, test } from "vitest";
import { getResolutionFilter, streamNeedsResize, upsertVideoFilterTokens } from "../src/ffmpeg/filters";
import type { Ffmpeg } from "../src/tdarr/types";

describe("filters", () => {
  test("builds nvenc scale filter", () => {
    const filter: string = getResolutionFilter("hevc_nvenc", "720p");
    expect(filter).toContain("scale_cuda");
  });

  test("detects resize requirement", () => {
    const needsResize: boolean = streamNeedsResize({ width: 1920, height: 1080 }, "720p");
    expect(needsResize).toBe(true);
  });

  test("merges with existing video filter", () => {
    const tokens: Ffmpeg.Argv = upsertVideoFilterTokens(["-vf", "scale_cuda=format=p010le"], "scale=w=1280:h=720");
    expect(tokens).toEqual(["-vf", "scale_cuda=format=p010le,scale=w=1280:h=720"]);
  });
});
