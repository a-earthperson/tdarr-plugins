import type { Encoder, Runtime } from "../tdarr/types";

export interface NvencDeviceSelection {
  candidate: Encoder.Candidate;
  logs: readonly string[];
}

export class NvencDeviceSelector {
  public constructor(private readonly childProcess: Runtime.ChildProcessAdapter) {}

  public select(params: {
    excludedGpuIds: readonly number[];
    nvencCandidate: Encoder.Candidate;
  }): NvencDeviceSelection {
    const logs: string[] = [];
    const { excludedGpuIds, nvencCandidate } = params;
    let selectedGpu = -1;
    let selectedUtilization = Number.MAX_SAFE_INTEGER;
    let gpuNames: string[] = [];

    try {
      const output = this.childProcess.execSync("nvidia-smi --query-gpu=name --format=csv,noheader");
      gpuNames = output
        .toString()
        .trim()
        .split(/\r?\n/)
        .filter((line) => line && !line.includes("nvidia-smi"));
    } catch {
      logs.push("Error in reading nvidia-smi output.");
    }

    gpuNames.forEach((gpuName, gpuIndex) => {
      if (excludedGpuIds.includes(gpuIndex)) {
        logs.push(`GPU ${gpuIndex}: ${gpuName} is in exclusion list.`);
        return;
      }
      try {
        const command = `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits -i ${gpuIndex}`;
        const utilization = Number.parseInt(this.childProcess.execSync(command).toString(), 10);
        if (!Number.isNaN(utilization)) {
          logs.push(`GPU ${gpuIndex}: Utilization ${utilization}%`);
          if (utilization < selectedUtilization) {
            selectedUtilization = utilization;
            selectedGpu = gpuIndex;
          }
        }
      } catch (error) {
        logs.push(`Error in reading GPU ${gpuIndex} utilization. ${String(error)}`);
      }
    });

    if (selectedGpu >= 0) {
      return {
        candidate: {
          ...nvencCandidate,
          inputArgs: ["-hwaccel_device", String(selectedGpu)],
          outputArgs: ["-gpu", String(selectedGpu)],
        },
        logs,
      };
    }

    return { candidate: nvencCandidate, logs };
  }
}

export const getBestNvencDevice = (params: {
  excludedGpuIds: readonly number[];
  nvencCandidate: Encoder.Candidate;
  childProcess: Runtime.ChildProcessAdapter;
}): NvencDeviceSelection =>
  new NvencDeviceSelector(params.childProcess).select({
    excludedGpuIds: params.excludedGpuIds,
    nvencCandidate: params.nvencCandidate,
  });
