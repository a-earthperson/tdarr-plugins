import type { Ffmpeg } from "../tdarr/types";

const TOKEN_REGEX = /"([^"]*)"|'([^']*)'|[^\s]+/g;

const quoteToken = (token: string): string => {
  if (token === "<io>") return token;
  if (token === "") return '""';
  if (/[\s"';&|()<>`$\\]/.test(token)) {
    return `"${token.replace(/(["`$\\])/g, "\\$1")}"`;
  }
  return token;
};

export class FfmpegArguments {
  private constructor(private readonly tokens: Ffmpeg.Argv) {}

  public static empty(): FfmpegArguments {
    return new FfmpegArguments([]);
  }

  public static of(tokens: readonly string[]): FfmpegArguments {
    return new FfmpegArguments([...tokens]);
  }

  public static parse(raw: string): FfmpegArguments {
    const tokens: Ffmpeg.Argv = [];
    const normalized = raw.trim();
    if (!normalized) return FfmpegArguments.empty();
    normalized.replace(TOKEN_REGEX, (match, dq, sq) => {
      tokens.push(dq ?? sq ?? match);
      return match;
    });
    return new FfmpegArguments(tokens);
  }

  public append(...tokens: readonly string[]): FfmpegArguments {
    return new FfmpegArguments([...this.tokens, ...tokens]);
  }

  public concat(...groups: readonly FfmpegArguments[]): FfmpegArguments {
    return new FfmpegArguments([
      ...this.tokens,
      ...groups.flatMap((group) => group.toArray()),
    ]);
  }

  public upsertVideoFilter(videoFilter: string): FfmpegArguments {
    if (!videoFilter) return this;
    const next = this.toArray();
    const filterIndex = next.findIndex((token) => token === "-vf" || token === "-filter:v");
    if (filterIndex >= 0 && filterIndex + 1 < next.length) {
      next[filterIndex + 1] = `${next[filterIndex + 1]},${videoFilter}`;
      return new FfmpegArguments(next);
    }
    return new FfmpegArguments([...next, "-vf", videoFilter]);
  }

  public toArray(): Ffmpeg.Argv {
    return [...this.tokens];
  }

  public render(): Ffmpeg.RenderedArgs {
    return this.tokens.filter((token) => token.trim() !== "").map(quoteToken).join(" ");
  }
}

export const tokenizeArguments = (raw: string): Ffmpeg.Argv => FfmpegArguments.parse(raw).toArray();

export const renderArguments = (tokens: Ffmpeg.Argv): Ffmpeg.RenderedArgs =>
  FfmpegArguments.of(tokens).render();
