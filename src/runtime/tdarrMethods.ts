import path from "node:path";
import type { Tdarr } from "../tdarr/types";

function resolveFromCandidates(relativeCandidates: readonly string[]): unknown {
  const loadErrors: string[] = [];
  for (const candidate of relativeCandidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(candidate) as unknown;
    } catch (error) {
      const message: string = error instanceof Error ? error.message : String(error);
      loadErrors.push(`${candidate}: ${message}`);
    }
  }
  throw new Error(`Unable to resolve runtime module. ${loadErrors.join(" | ")}`);
}

function runtimeCandidates(modulePath: string): string[] {
  return [
    path.join(process.cwd(), modulePath),
    path.join(__dirname, "..", modulePath),
    path.join(__dirname, "..", "..", modulePath),
    path.join(__dirname, "..", "..", "..", modulePath),
  ];
}

export function createDefaultTdarrRuntime(): Tdarr.RuntimeMethods {
  try {
    const libFactory: () => { loadDefaultValues: Tdarr.RuntimeMethods["loadDefaultValues"] } = resolveFromCandidates(
      runtimeCandidates("methods/lib"),
    ) as () => {
      loadDefaultValues: Tdarr.RuntimeMethods["loadDefaultValues"];
    };
    const nvdecPreset: {
      getNvdecHwaccelPreset: Tdarr.RuntimeMethods["getNvdecHwaccelPreset"];
      getNvenc10BitFormatArg: Tdarr.RuntimeMethods["getNvenc10BitFormatArg"];
    } = resolveFromCandidates(runtimeCandidates("methods/nvdecPreset")) as {
      getNvdecHwaccelPreset: Tdarr.RuntimeMethods["getNvdecHwaccelPreset"];
      getNvenc10BitFormatArg: Tdarr.RuntimeMethods["getNvenc10BitFormatArg"];
    };
    const library: { loadDefaultValues: Tdarr.RuntimeMethods["loadDefaultValues"] } = libFactory();
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
      const next: Record<string, unknown> = { ...inputs };
      const inputSpecs: readonly Tdarr.FormInputSpec[] = detailsProvider().Inputs;
      inputSpecs.forEach((spec) => {
        const current: unknown = next[spec.name];
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
}
