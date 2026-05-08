"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/plugins/reencode/index.ts
var reencode_exports = {};
__export(reencode_exports, {
  createPlugin: () => createPlugin,
  details: () => details,
  plugin: () => plugin
});
module.exports = __toCommonJS(reencode_exports);
var import_node_child_process = require("child_process");

// src/ffmpeg/args.ts
var TOKEN_REGEX = /"([^"]*)"|'([^']*)'|[^\s]+/g;
var tokenizeArguments = (raw) => {
  const tokens = [];
  const normalized = raw.trim();
  if (!normalized) return tokens;
  normalized.replace(TOKEN_REGEX, (match, dq, sq) => {
    tokens.push(dq ?? sq ?? match);
    return match;
  });
  return tokens;
};
var quoteToken = (token) => {
  if (token === "<io>") return token;
  if (token === "") return '""';
  if (/[\s"';&|()<>`$\\]/.test(token)) {
    return `"${token.replace(/(["`$\\])/g, "\\$1")}"`;
  }
  return token;
};
var renderArguments = (tokens) => tokens.filter((token) => token.trim() !== "").map(quoteToken).join(" ");

// src/encoder/nvencDevice.ts
var getBestNvencDevice = (params) => {
  const logs = [];
  const { excludedGpuIds, nvencCandidate, childProcess } = params;
  let selectedGpu = -1;
  let selectedUtilization = Number.MAX_SAFE_INTEGER;
  let gpuNames = [];
  try {
    const output = childProcess.execSync("nvidia-smi --query-gpu=name --format=csv,noheader");
    gpuNames = output.toString().trim().split(/\r?\n/).filter((line) => line && !line.includes("nvidia-smi"));
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
      const utilization = Number.parseInt(childProcess.execSync(command).toString(), 10);
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
        outputArgs: ["-gpu", String(selectedGpu)]
      },
      logs
    };
  }
  return { candidate: nvencCandidate, logs };
};

// src/encoder/selectEncoder.ts
var encoderProbe = async (params) => new Promise((resolve) => {
  const command = renderArguments([
    params.ffmpegPath,
    ...params.candidate.inputArgs,
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=512x512:d=1:r=30",
    ...params.candidate.probeFilterArgs,
    "-c:v",
    params.candidate.name,
    "-f",
    "null",
    "/dev/null"
  ]);
  params.childProcess.exec(command, (error) => {
    resolve(!error);
  });
});
var candidate = (name, codec, family, inputArgs = [], probeFilterArgs = []) => ({
  name,
  codec,
  family,
  inputArgs,
  outputArgs: [],
  probeFilterArgs
});
var gpuCandidates = () => [
  candidate("hevc_nvenc", "hevc", "nvenc"),
  candidate("hevc_amf", "hevc", "amf"),
  candidate(
    "hevc_vaapi",
    "hevc",
    "vaapi",
    ["-hwaccel", "vaapi", "-hwaccel_device", "/dev/dri/renderD128", "-hwaccel_output_format", "vaapi"],
    ["-vf", "format=nv12,hwupload"]
  ),
  candidate("hevc_rkmpp", "hevc", "rkmpp"),
  candidate("hevc_qsv", "hevc", "qsv"),
  candidate("hevc_videotoolbox", "hevc", "videotoolbox"),
  candidate("h264_nvenc", "h264", "nvenc"),
  candidate("h264_rkmpp", "h264", "rkmpp"),
  candidate("h264_amf", "h264", "amf"),
  candidate("h264_qsv", "h264", "qsv"),
  candidate("h264_videotoolbox", "h264", "videotoolbox")
];
var softwareCandidate = (codec) => codec === "hevc" ? candidate("libx265", "hevc", "software") : candidate("libx264", "h264", "software");
var workerCanUseGpu = (workerType) => typeof workerType === "string" && workerType.toLowerCase().includes("gpu");
var selectEncoder = async (params) => {
  const { policy, host, childProcess } = params;
  const ffmpegPath = host.ffmpegPath ?? "ffmpeg";
  if (workerCanUseGpu(host.workerType) && policy.tryUseGpu) {
    const candidates = gpuCandidates().filter(
      (gpuCandidate) => gpuCandidate.codec === policy.targetCodec
    );
    const enabled = [];
    for (const gpuCandidate of candidates) {
      const available = await encoderProbe({
        ffmpegPath,
        candidate: gpuCandidate,
        childProcess
      });
      if (available) enabled.push(gpuCandidate);
    }
    if (enabled.length > 0) {
      let selected = enabled[0];
      if (selected.family === "vaapi") {
        const qsv = enabled.find((enabledCandidate) => enabledCandidate.family === "qsv");
        if (qsv) selected = qsv;
      }
      if (selected.family === "nvenc") {
        return getBestNvencDevice({
          excludedGpuIds: policy.excludedGpuIds,
          nvencCandidate: selected,
          childProcess
        });
      }
      return { candidate: selected, logs: [] };
    }
  }
  return { candidate: softwareCandidate(policy.targetCodec), logs: [] };
};

// src/ffmpeg/filters.ts
var resolutionTargets = {
  "720p": {
    landscape: { width: 1280, height: 720 },
    portrait: { width: 720, height: 1280 }
  },
  "480p": {
    landscape: { width: 854, height: 480 },
    portrait: { width: 480, height: 854 }
  }
};
var getResolutionTarget = (targetResolution, width, height) => {
  if (targetResolution === "none") return null;
  const target = resolutionTargets[targetResolution];
  if (!target) return null;
  return width >= height ? target.landscape : target.portrait;
};
var streamNeedsResize = (stream, targetResolution) => {
  if (targetResolution === "none" || typeof stream.width !== "number" || typeof stream.height !== "number") {
    return false;
  }
  const target = getResolutionTarget(targetResolution, stream.width, stream.height);
  if (!target) return false;
  return stream.width > target.width || stream.height > target.height;
};
var getResolutionFilter = (encoder, targetResolution) => {
  if (targetResolution === "none") return "";
  const target = resolutionTargets[targetResolution];
  if (!target) return "";
  const scaleFactor = `min(1,if(gte(iw,ih),min(${target.landscape.width}/iw,${target.landscape.height}/ih),min(${target.portrait.width}/iw,${target.portrait.height}/ih)))`;
  const filterName = encoder.includes("nvenc") ? "scale_cuda" : "scale";
  return `${filterName}=w='trunc(iw*${scaleFactor}/2)*2':h='trunc(ih*${scaleFactor}/2)*2'`;
};
var upsertVideoFilterTokens = (tokens, videoFilter) => {
  if (!videoFilter) return [...tokens];
  const next = [...tokens];
  const filterIndex = next.findIndex((token) => token === "-vf" || token === "-filter:v");
  if (filterIndex >= 0 && filterIndex + 1 < next.length) {
    const existing = next[filterIndex + 1];
    next[filterIndex + 1] = `${existing},${videoFilter}`;
    return next;
  }
  next.push("-vf", videoFilter);
  return next;
};

// src/ffmpeg/rateControl.ts
var normalizeBitrate = (bitrate) => Math.max(1, Math.round(bitrate)).toString();
var bitrateArgs = (request) => [
  "-b:v",
  normalizeBitrate(request.bitrate.target),
  "-maxrate",
  normalizeBitrate(request.bitrate.maximum),
  "-bufsize",
  normalizeBitrate(request.bitrate.current)
];
var isNvenc = (encoderName) => encoderName === "hevc_nvenc" || encoderName === "h264_nvenc";
var isQsv = (encoderName) => encoderName === "hevc_qsv" || encoderName === "h264_qsv";
var isSoftware = (encoderName) => encoderName === "libx265" || encoderName === "libx264";
var getEncoderRateControl = (request) => {
  const base = bitrateArgs(request);
  if (isNvenc(request.encoderName)) {
    return {
      args: [
        "-rc:v",
        "vbr",
        "-cq:v",
        "19",
        ...base,
        "-spatial_aq:v",
        "1",
        "-rc-lookahead:v",
        "32"
      ],
      description: "NVENC VBR HQ with CQ 19"
    };
  }
  if (isQsv(request.encoderName)) {
    return {
      args: [...base, "-extbrc", "1", "-look_ahead_depth", "32"],
      description: "QSV bitrate mode with extbrc lookahead"
    };
  }
  if (isSoftware(request.encoderName)) {
    return {
      args: base,
      description: "software encoder bitrate mode"
    };
  }
  return {
    args: base,
    description: "generic bitrate mode"
  };
};

// src/runtime/tdarrMethods.ts
var import_node_path = __toESM(require("path"));
var resolveFromCandidates = (relativeCandidates) => {
  const loadErrors = [];
  for (const candidate2 of relativeCandidates) {
    try {
      return require(candidate2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loadErrors.push(`${candidate2}: ${message}`);
    }
  }
  throw new Error(`Unable to resolve runtime module. ${loadErrors.join(" | ")}`);
};
var runtimeCandidates = (modulePath) => [
  import_node_path.default.join(process.cwd(), modulePath),
  import_node_path.default.join(__dirname, "..", modulePath),
  import_node_path.default.join(__dirname, "..", "..", modulePath),
  import_node_path.default.join(__dirname, "..", "..", "..", modulePath)
];
var createDefaultTdarrRuntime = () => {
  try {
    const libFactory = resolveFromCandidates(runtimeCandidates("methods/lib"));
    const nvdecPreset = resolveFromCandidates(runtimeCandidates("methods/nvdecPreset"));
    const library = libFactory();
    return {
      loadDefaultValues: library.loadDefaultValues,
      getNvdecHwaccelPreset: nvdecPreset.getNvdecHwaccelPreset,
      getNvenc10BitFormatArg: nvdecPreset.getNvenc10BitFormatArg
    };
  } catch {
    const fallbackLoadDefaultValues = (inputs, detailsProvider) => {
      const next = { ...inputs ?? {} };
      const inputSpecs = detailsProvider().Inputs ?? [];
      inputSpecs.forEach((spec) => {
        const current = next[spec.name];
        if (typeof current === "string") next[spec.name] = current.trim();
        if (next[spec.name] === void 0 || next[spec.name] === "") {
          next[spec.name] = spec.defaultValue;
        }
      });
      return next;
    };
    return {
      loadDefaultValues: fallbackLoadDefaultValues,
      getNvdecHwaccelPreset: () => "",
      getNvenc10BitFormatArg: () => "-pix_fmt p010le "
    };
  }
};

// src/plugins/reencode/details.ts
var details = () => ({
  id: "Tdarr_Plugin_00td_action_transcode",
  Stage: "Pre-processing",
  Name: "Transcode A Video File",
  Type: "Video",
  Operation: "Transcode",
  Description: "Transcode a video file using ffmpeg. GPU transcoding will be used if possible.",
  Version: "3.5",
  Tags: "pre-processing,ffmpeg,video only,nvenc h265,configurable",
  Inputs: [
    {
      name: "target_codec",
      type: "string",
      defaultValue: "hevc",
      inputUI: {
        type: "dropdown",
        options: ["hevc", "h264"]
      },
      tooltip: "Specify the codec to use"
    },
    {
      name: "target_bitrate_multiplier",
      type: "number",
      defaultValue: 0.5,
      inputUI: {
        type: "text"
      },
      tooltip: "Specify the multiplier to use to calculate the target bitrate. Default of 0.5 will roughly half the size of the file."
    },
    {
      name: "target_resolution",
      type: "string",
      defaultValue: "none",
      inputUI: {
        type: "dropdown",
        options: ["none", "720p", "480p"]
      },
      tooltip: "Optionally rescale the video to the selected resolution target. This is independent of target_bitrate_multiplier and does not adjust bitrate calculations."
    },
    {
      name: "try_use_gpu",
      type: "boolean",
      defaultValue: true,
      inputUI: {
        type: "dropdown",
        options: ["false", "true"]
      },
      tooltip: "If enabled then will use GPU if possible."
    },
    {
      name: "container",
      type: "string",
      defaultValue: "mkv",
      inputUI: {
        type: "dropdown",
        options: ["mkv", "mp4", "avi", "ts", "original"]
      },
      tooltip: "Specify output container of file. Use 'original' to keep original container. Ensure stream types are supported by container. mkv is recommended."
    },
    {
      name: "bitrate_cutoff",
      type: "number",
      defaultValue: 0,
      inputUI: {
        type: "text"
      },
      tooltip: "Specify bitrate cutoff in kbps. Files with current bitrate lower than this are not transcoded."
    },
    {
      name: "enable_10bit",
      type: "boolean",
      defaultValue: false,
      inputUI: {
        type: "dropdown",
        options: ["false", "true"]
      },
      tooltip: "Specify if output file should be 10bit."
    },
    {
      name: "bframes_enabled",
      type: "boolean",
      defaultValue: false,
      inputUI: {
        type: "dropdown",
        options: ["false", "true"]
      },
      tooltip: "Specify if b frames should be used. This can decrease file sizes but needs newer GPUs."
    },
    {
      name: "bframes_value",
      type: "number",
      defaultValue: 5,
      inputUI: {
        type: "text"
      },
      tooltip: "Specify number of bframes to use."
    },
    {
      name: "force_conform",
      type: "boolean",
      defaultValue: false,
      inputUI: {
        type: "dropdown",
        options: ["false", "true"]
      },
      tooltip: "Conform to output container requirements by dropping incompatible streams."
    },
    {
      name: "exclude_gpus",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text"
      },
      tooltip: "Comma-separated GPU ids to exclude from NVENC selection."
    }
  ]
});

// src/common/parse.ts
var parseBoolean = (value, fallback) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return fallback;
};
var parseFiniteNumber = (value, fallback) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
var parseEnum = (value, allowed, fallback) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.includes(normalized) ? normalized : fallback;
};
var isFiniteNonNegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

// src/tdarr/types.ts
var Media;
((Media2) => {
  Media2.videoCodecs = ["hevc", "h264"];
  Media2.videoResolutionTargets = ["none", "720p", "480p"];
  Media2.outputContainers = ["mkv", "mp4", "avi", "ts"];
})(Media || (Media = {}));
var Tdarr;
((Tdarr2) => {
  Tdarr2.tagOptions = [
    "h265",
    "hevc",
    "h264",
    "nvenc h265",
    "nvenc h264",
    "video only",
    "audio only",
    "subtitle only",
    "handbrake",
    "ffmpeg",
    "radarr",
    "sonarr",
    "pre-processing",
    "post-processing",
    "configurable"
  ];
})(Tdarr || (Tdarr = {}));

// src/plugins/reencode/policy.ts
var parseExcludedGpuIds = (value) => {
  if (typeof value !== "string") return [];
  const unique = /* @__PURE__ */ new Set();
  for (const entry of value.split(",")) {
    const gpuId = Number(entry.trim());
    if (Number.isInteger(gpuId) && gpuId >= 0) unique.add(gpuId);
  }
  return [...unique];
};
var normalizeInputs = (rawInputs) => {
  const warnings = [];
  const targetBitrateMultiplier = Math.max(
    0,
    parseFiniteNumber(rawInputs.target_bitrate_multiplier, 0.5)
  );
  if (targetBitrateMultiplier === 0) {
    warnings.push(
      "target_bitrate_multiplier resolved to 0; no valid bitrate target is configured."
    );
  }
  return {
    policy: {
      targetCodec: parseEnum(rawInputs.target_codec, Media.videoCodecs, "hevc"),
      container: parseEnum(rawInputs.container, [...Media.outputContainers, "original"], "mkv"),
      targetResolution: parseEnum(
        rawInputs.target_resolution,
        Media.videoResolutionTargets,
        "none"
      ),
      targetBitrateMultiplier,
      tryUseGpu: parseBoolean(rawInputs.try_use_gpu, true),
      bitrateCutoff: Math.max(0, parseFiniteNumber(rawInputs.bitrate_cutoff, 0)),
      enable10Bit: parseBoolean(rawInputs.enable_10bit, false),
      bFrames: {
        enabled: parseBoolean(rawInputs.bframes_enabled, false),
        count: Math.max(0, Math.round(parseFiniteNumber(rawInputs.bframes_value, 5)))
      },
      forceConform: parseBoolean(rawInputs.force_conform, false),
      excludedGpuIds: parseExcludedGpuIds(rawInputs.exclude_gpus)
    },
    warnings
  };
};
var resolveTargetContainer = (policy, file) => {
  if (policy.container !== "original") {
    return { container: policy.container, warnings: [] };
  }
  const normalized = typeof file.container === "string" ? file.container.trim().toLowerCase() : "";
  if (Media.outputContainers.includes(normalized)) {
    return { container: normalized, warnings: [] };
  }
  return {
    container: "mkv",
    warnings: ["Input requested original container, but source container was unavailable or unsupported; using mkv."]
  };
};
var resolveDurationSeconds = (file) => {
  const candidates = [
    file.ffProbeData?.format?.duration,
    file.meta?.Duration,
    file.ffProbeData?.streams?.[0]?.duration
  ];
  for (const candidate2 of candidates) {
    const parsed = typeof candidate2 === "number" ? candidate2 : Number(candidate2);
    if (isFiniteNonNegative(parsed) && parsed > 0) {
      return { kind: "ok", seconds: parsed };
    }
  }
  return {
    kind: "invalid",
    seconds: 0,
    reason: "Unable to determine media duration."
  };
};
var calculateBitrateBudget = (file, durationSeconds, multiplier) => {
  const fileSizeMb = typeof file.file_size === "number" ? file.file_size : Number(file.file_size);
  if (!isFiniteNonNegative(fileSizeMb) || fileSizeMb <= 0) {
    return {
      kind: "invalid",
      reason: "Unable to calculate bitrate from file_size."
    };
  }
  const current = fileSizeMb * 1024 * 1024 * 8 / durationSeconds;
  if (!Number.isFinite(current) || current <= 0) {
    return {
      kind: "invalid",
      reason: "Computed current bitrate is invalid."
    };
  }
  const target = current * multiplier;
  if (!Number.isFinite(target) || target <= 0) {
    return {
      kind: "invalid",
      reason: "Computed target bitrate is invalid."
    };
  }
  return {
    kind: "ok",
    budget: {
      current,
      target,
      minimum: target * 0.7,
      maximum: target * 1.3
    }
  };
};
var shouldDropForContainerConformance = (container, streamCodecName) => {
  const codec = streamCodecName.trim().toLowerCase();
  if (container === "mkv") {
    return codec === "mov_text" || codec === "eia_608" || codec === "timed_id3";
  }
  if (container === "mp4") {
    return codec === "hdmv_pgs_subtitle" || codec === "eia_608" || codec === "subrip" || codec === "timed_id3";
  }
  return false;
};

// src/plugins/reencode/streams.ts
var normalize = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
var isUnsupportedStream = (stream) => {
  const codecName = normalize(stream.codec_name);
  const codecType = normalize(stream.codec_type);
  return codecName === "" || codecName === "none" || codecName === "unknown" || codecType === "" || codecType === "unknown";
};
var isDisposableVideoStream = (stream) => {
  const codecName = normalize(stream.codec_name);
  return codecName === "mjpeg" || codecName === "png";
};
var analyzeStreams = (params) => {
  const result = {
    primaryVideoStreamIndex: -1,
    primaryVideoCodec: "",
    passthroughStreamIndexes: [],
    mappingChanged: false,
    resizeRequired: false,
    decisions: []
  };
  params.streams.forEach((stream, index) => {
    const codecName = typeof stream.codec_name === "string" ? stream.codec_name : "unknown";
    if (isUnsupportedStream(stream)) {
      result.decisions.push({ kind: "drop-unsupported", streamIndex: index, codecName });
      result.mappingChanged = true;
      return;
    }
    if (params.forceConform && typeof stream.codec_name === "string" && shouldDropForContainerConformance(params.targetContainer, stream.codec_name)) {
      result.decisions.push({
        kind: "drop-container-conformance",
        streamIndex: index,
        codecName
      });
      result.mappingChanged = true;
      return;
    }
    if (params.forceConform && params.targetContainer === "mkv" && normalize(stream.codec_type) === "data") {
      result.decisions.push({ kind: "drop-data-conformance", streamIndex: index, codecName });
      result.mappingChanged = true;
      return;
    }
    if (normalize(stream.codec_type) === "video") {
      if (isDisposableVideoStream(stream)) {
        result.decisions.push({ kind: "drop-disposable-video", streamIndex: index, codecName });
        result.mappingChanged = true;
        return;
      }
      if (result.primaryVideoStreamIndex === -1) {
        result.primaryVideoStreamIndex = index;
        result.primaryVideoCodec = normalize(stream.codec_name);
        result.resizeRequired = streamNeedsResize(stream, params.targetResolution);
        if (index !== 0) {
          result.decisions.push({ kind: "promote-primary-video", streamIndex: index, codecName });
          result.mappingChanged = true;
        }
        return;
      }
      result.decisions.push({ kind: "drop-secondary-video", streamIndex: index, codecName });
      result.mappingChanged = true;
      return;
    }
    result.passthroughStreamIndexes.push(index);
  });
  return result;
};
var streamMapTokens = (streamIndexes) => streamIndexes.flatMap((streamIndex) => ["-map", `0:${streamIndex}`]);

// src/plugins/reencode/index.ts
var bframeSupport = /* @__PURE__ */ new Set(["hevc_nvenc", "h264_nvenc"]);
var createResponse = () => ({
  processFile: false,
  preset: "",
  handBrakeMode: false,
  FFmpegMode: true,
  reQueueAfter: true,
  infoLog: ""
});
var defaultChildProcess = {
  exec: import_node_child_process.exec,
  execSync: import_node_child_process.execSync
};
var renderStreamDecision = (decision, targetContainer) => {
  switch (decision.kind) {
    case "drop-unsupported":
      return `Dropping stream 0:${decision.streamIndex} because codec "${decision.codecName}" is unsupported.`;
    case "drop-container-conformance":
      return `Dropping stream 0:${decision.streamIndex} because codec ${decision.codecName} is not container-conformant for ${targetContainer}.`;
    case "drop-data-conformance":
      return `Dropping stream 0:${decision.streamIndex} because data streams are dropped for mkv conformance.`;
    case "drop-disposable-video":
      return `Dropping stream 0:${decision.streamIndex} because embedded image streams are not preserved.`;
    case "promote-primary-video":
      return `Promoting video stream 0:${decision.streamIndex} to the first output stream.`;
    case "drop-secondary-video":
      return `Dropping stream 0:${decision.streamIndex} because only one video stream is preserved.`;
  }
};
var createPlugin = (options) => async (file, librarySettings, inputs, otherArguments) => {
  void librarySettings;
  const runtime = options?.runtime ?? createDefaultTdarrRuntime();
  const childProcess = options?.childProcess ?? defaultChildProcess;
  const response = createResponse();
  const pushLog = (line) => {
    response.infoLog += `${line}
`;
  };
  const loadedDefaults = runtime.loadDefaultValues(inputs ?? {}, details);
  const normalizedInputs = normalizeInputs(loadedDefaults);
  normalizedInputs.warnings.forEach(pushLog);
  const policy = normalizedInputs.policy;
  const targetContainerResult = resolveTargetContainer(policy, file);
  targetContainerResult.warnings.forEach(pushLog);
  const targetContainer = targetContainerResult.container;
  response.container = `.${targetContainer}`;
  if (file.fileMedium !== "video") {
    pushLog("File is not a video.");
    return response;
  }
  const duration = resolveDurationSeconds(file);
  if (duration.kind === "invalid") {
    pushLog(`${duration.reason} Skipping transcode.`);
    return response;
  }
  const bitrateResult = calculateBitrateBudget(
    file,
    duration.seconds,
    policy.targetBitrateMultiplier
  );
  if (bitrateResult.kind === "invalid" || !bitrateResult.budget) {
    pushLog(`${bitrateResult.reason} Skipping transcode.`);
    return response;
  }
  if (bitrateResult.budget.current <= policy.bitrateCutoff) {
    pushLog(`Current bitrate is below cutoff ${policy.bitrateCutoff}.`);
    return response;
  }
  const encoderSelection = await selectEncoder({
    policy: {
      targetCodec: policy.targetCodec,
      tryUseGpu: policy.tryUseGpu,
      excludedGpuIds: policy.excludedGpuIds
    },
    host: otherArguments,
    childProcess
  });
  encoderSelection.logs.forEach(pushLog);
  const encoder = encoderSelection.candidate;
  const streamResult = analyzeStreams({
    streams: file.ffProbeData?.streams ?? [],
    targetResolution: policy.targetResolution,
    forceConform: policy.forceConform,
    targetContainer
  });
  streamResult.decisions.map((decision) => renderStreamDecision(decision, targetContainer)).forEach(pushLog);
  if (streamResult.primaryVideoStreamIndex === -1) {
    pushLog("No supported video stream found.");
    return response;
  }
  const mappedStreamIndexes = [
    streamResult.primaryVideoStreamIndex,
    ...streamResult.passthroughStreamIndexes
  ];
  const mapTokens = streamMapTokens(mappedStreamIndexes);
  let extraTokens = [];
  if (policy.enable10Bit) {
    extraTokens = [...extraTokens, ...tokenizeArguments(runtime.getNvenc10BitFormatArg(file))];
  }
  if (bframeSupport.has(encoder.name) && policy.bFrames.enabled) {
    extraTokens.push("-bf", String(policy.bFrames.count));
  }
  const resolutionFilter = getResolutionFilter(encoder.name, policy.targetResolution);
  extraTokens = upsertVideoFilterTokens(extraTokens, resolutionFilter);
  const rateControl = getEncoderRateControl({
    encoderName: encoder.name,
    bitrate: bitrateResult.budget
  });
  pushLog(`Encoder selected as ${encoder.name}.`);
  pushLog(`Encoder rate control = ${rateControl.description}.`);
  pushLog(`Container for output selected as ${targetContainer}.`);
  pushLog(`Resolution target selected as ${policy.targetResolution}.`);
  pushLog(`Current bitrate = ${bitrateResult.budget.current}`);
  pushLog("Bitrate settings:");
  pushLog(`Target = ${bitrateResult.budget.target}`);
  pushLog(`Minimum = ${bitrateResult.budget.minimum}`);
  pushLog(`Maximum = ${bitrateResult.budget.maximum}`);
  if (streamResult.primaryVideoCodec === policy.targetCodec && file.container === targetContainer && !streamResult.resizeRequired && !streamResult.mappingChanged) {
    pushLog(`File is already ${policy.targetCodec} and in ${targetContainer}.`);
    return response;
  }
  if (streamResult.primaryVideoCodec === policy.targetCodec && !streamResult.resizeRequired) {
    pushLog(
      `File video is already ${policy.targetCodec} but stream mapping/container needs normalization. Remuxing.`
    );
    response.preset = renderArguments(["<io>", ...mapTokens, "-c", "copy", ...extraTokens]);
    response.processFile = true;
    return response;
  }
  const prefixTokens = [];
  if (encoder.family === "nvenc") {
    prefixTokens.push(...tokenizeArguments(runtime.getNvdecHwaccelPreset(file)));
  }
  prefixTokens.push(...encoder.inputArgs);
  if (targetContainer === "ts" || targetContainer === "avi") {
    prefixTokens.push("-fflags", "+genpts");
  }
  const transcodeTokens = [
    ...mapTokens,
    "-c",
    "copy",
    "-c:v",
    encoder.name,
    ...encoder.outputArgs,
    ...rateControl.args,
    "-max_muxing_queue_size",
    "9999",
    ...extraTokens
  ];
  response.preset = renderArguments([...prefixTokens, "<io>", ...transcodeTokens]);
  response.processFile = true;
  pushLog(`File is not in ${policy.targetCodec}. Transcoding.`);
  return response;
};
var plugin = createPlugin();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createPlugin,
  details,
  plugin
});
