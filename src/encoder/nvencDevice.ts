import type {
  ChildProcessAdapter,
  EncoderCandidate,
  TdarrPluginInput,
  TdarrResponse,
} from "../tdarr/types";

export const getBestNvencDevice = (params: {
  response: TdarrResponse;
  inputs: TdarrPluginInput;
  nvencDevice: EncoderCandidate;
  childProcess: ChildProcessAdapter;
}): EncoderCandidate => {
  const { response, inputs, nvencDevice, childProcess } = params;
  let selectedGpu = -1;
  let selectedUtilization = Number.MAX_SAFE_INTEGER;
  let gpuNames: string[] = [];

  try {
    const output = childProcess.execSync("nvidia-smi --query-gpu=name --format=csv,noheader");
    gpuNames = output
      .toString()
      .trim()
      .split(/\r?\n/)
      .filter((line) => line && !line.includes("nvidia-smi"));
  } catch {
    response.infoLog += "Error in reading nvidia-smi output.\n";
  }

  gpuNames.forEach((gpuName, gpuIndex) => {
    if (inputs.exclude_gpu_ids.includes(gpuIndex)) {
      response.infoLog += `GPU ${gpuIndex}: ${gpuName} is in exclusion list.\n`;
      return;
    }
    try {
      const command = `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits -i ${gpuIndex}`;
      const utilization = Number.parseInt(childProcess.execSync(command).toString(), 10);
      if (!Number.isNaN(utilization)) {
        response.infoLog += `GPU ${gpuIndex}: Utilization ${utilization}%\n`;
        if (utilization < selectedUtilization) {
          selectedUtilization = utilization;
          selectedGpu = gpuIndex;
        }
      }
    } catch (error) {
      response.infoLog += `Error in reading GPU ${gpuIndex} utilization.\n${String(error)}\n`;
    }
  });

  if (selectedGpu >= 0) {
    return {
      ...nvencDevice,
      inputArgs: `-hwaccel_device ${selectedGpu}`,
      outputArgs: `-gpu ${selectedGpu}`,
    };
  }
  return nvencDevice;
};
