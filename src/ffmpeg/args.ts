import type { Ffmpeg } from "../tdarr/types";

const TOKEN_REGEX = /"([^"]*)"|'([^']*)'|[^\s]+/g;

export const tokenizeArguments = (raw: string): Ffmpeg.Argv => {
  const tokens: Ffmpeg.Argv = [];
  const normalized = raw.trim();
  if (!normalized) return tokens;
  normalized.replace(TOKEN_REGEX, (match, dq, sq) => {
    tokens.push(dq ?? sq ?? match);
    return match;
  });
  return tokens;
};

const quoteToken = (token: string): string => {
  if (token === "<io>") return token;
  if (token === "") return '""';
  if (/[\s"';&|()<>`$\\]/.test(token)) {
    return `"${token.replace(/(["`$\\])/g, "\\$1")}"`;
  }
  return token;
};

export const renderArguments = (tokens: Ffmpeg.Argv): Ffmpeg.RenderedArgs =>
  tokens.filter((token) => token.trim() !== "").map(quoteToken).join(" ");
