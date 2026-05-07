const TOKEN_REGEX = /"([^"]*)"|'([^']*)'|[^\s]+/g;

export const tokenizeArguments = (raw: string): string[] => {
  const tokens: string[] = [];
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
  if (/\s/.test(token) || token.includes('"')) {
    return `"${token.replace(/"/g, '\\"')}"`;
  }
  return token;
};

export const renderArguments = (tokens: string[]): string =>
  tokens.filter((token) => token.trim() !== "").map(quoteToken).join(" ");
