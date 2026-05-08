import path from "node:path";
import type { Tdarr } from "../tdarr/types";

const resolveFromCandidates = <T>(relativeCandidates: string[]): T => {
  const loadErrors: string[] = [];
  for (const candidate of relativeCandidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(candidate) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loadErrors.push(`${candidate}: ${message}`);
    }
  }
  throw new Error(`Unable to resolve runtime module. ${loadErrors.join(" | ")}`);
};

const runtimeCandidates = (modulePath: string): string[] => [
  path.join(process.cwd(), modulePath),
  path.join(__dirname, "..", modulePath),
  path.join(__dirname, "..", "..", modulePath),
  path.join(__dirname, "..", "..", "..", modulePath),
];

export const createDefaultTdarrRuntime = (): Tdarr.RuntimeMethods => {
  try {
    const libFactory = resolveFromCandidates<() => { loadDefaultValues: Tdarr.RuntimeMethods["loadDefaultValues"] }>(
      runtimeCandidates("methods/lib"),
    );
    const nvdecPreset = resolveFromCandidates<{
      getNvdecHwaccelPreset: Tdarr.RuntimeMethods["getNvdecHwaccelPreset"];
      getNvenc10BitFormatArg: Tdarr.RuntimeMethods["getNvenc10BitFormatArg"];
    }>(runtimeCandidates("methods/nvdecPreset"));
    const library = libFactory();
    return {
      loadDefaultValues: library.loadDefaultValues,
      getNvdecHwaccelPreset: nvdecPreset.getNvdecHwaccelPreset,
      getNvenc10BitFormatArg: nvdecPreset.getNvenc10BitFormatArg,
    };
  } catch {
    const fallbackLoadDefaultValues: Tdarr.RuntimeMethods["loadDefaultValues"] = (
      inputs: Record<string, unknown>,
      detailsProvider: () => Tdarr.PluginDetails,
    ) => {
      const next = { ...(inputs ?? {}) };
      const inputSpecs = detailsProvider().Inputs ?? [];
      inputSpecs.forEach((spec) => {
        const current = next[spec.name];
        if (typeof current === "string") next[spec.name] = current.trim();
        if (next[spec.name] === undefined || next[spec.name] === "") {
          next[spec.name] = spec.defaultValue;
        }
      });
      return next;
    };
    return {
      loadDefaultValues: fallbackLoadDefaultValues,
      getNvdecHwaccelPreset: () => "",
      getNvenc10BitFormatArg: () => "-pix_fmt p010le ",
    };
  }
};
