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

// src/index.ts
var src_exports = {};
__export(src_exports, {
  createPlugin: () => createPlugin,
  details: () => details,
  plugin: () => plugin
});
module.exports = __toCommonJS(src_exports);
var import_node_child_process = require("child_process");

// src/encoder/nvencDevice.ts
var getBestNvencDevice = (params) => {
  const { response, inputs, nvencDevice, childProcess } = params;
  let selectedGpu = -1;
  let selectedUtilization = Number.MAX_SAFE_INTEGER;
  let gpuNames = [];
  try {
    const output = childProcess.execSync("nvidia-smi --query-gpu=name --format=csv,noheader");
    gpuNames = output.toString().trim().split(/\r?\n/).filter((line) => line && !line.includes("nvidia-smi"));
  } catch {
    response.infoLog += "Error in reading nvidia-smi output.\n";
  }
  gpuNames.forEach((gpuName, gpuIndex) => {
    if (inputs.exclude_gpu_ids.includes(gpuIndex)) {
      response.infoLog += `GPU ${gpuIndex}: ${gpuName} is in exclusion list.
`;
      return;
    }
    try {
      const command = `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits -i ${gpuIndex}`;
      const utilization = Number.parseInt(childProcess.execSync(command).toString(), 10);
      if (!Number.isNaN(utilization)) {
        response.infoLog += `GPU ${gpuIndex}: Utilization ${utilization}%
`;
        if (utilization < selectedUtilization) {
          selectedUtilization = utilization;
          selectedGpu = gpuIndex;
        }
      }
    } catch (error) {
      response.infoLog += `Error in reading GPU ${gpuIndex} utilization.
${String(error)}
`;
    }
  });
  if (selectedGpu >= 0) {
    return {
      ...nvencDevice,
      inputArgs: `-hwaccel_device ${selectedGpu}`,
      outputArgs: `-gpu ${selectedGpu}`
    };
  }
  return nvencDevice;
};

// src/encoder/selectEncoder.ts
var encoderProbe = async (params) => new Promise((resolve) => {
  const command = `${params.ffmpegPath} ${params.inputArgs ?? ""} -f lavfi -i color=c=black:s=512x512:d=1:r=30 ${params.filter ?? ""} -c:v ${params.encoder} -f null /dev/null`;
  params.childProcess.exec(command, (error) => {
    resolve(!error);
  });
});
var gpuCandidates = () => [
  { encoder: "hevc_nvenc" },
  { encoder: "hevc_amf" },
  {
    encoder: "hevc_vaapi",
    inputArgs: "-hwaccel vaapi -hwaccel_device /dev/dri/renderD128 -hwaccel_output_format vaapi",
    filter: "-vf format=nv12,hwupload"
  },
  { encoder: "hevc_rkmpp" },
  { encoder: "hevc_qsv" },
  { encoder: "hevc_videotoolbox" },
  { encoder: "h264_nvenc" },
  { encoder: "h264_rkmpp" },
  { encoder: "h264_amf" },
  { encoder: "h264_qsv" },
  { encoder: "h264_videotoolbox" }
];
var workerCanUseGpu = (workerType) => typeof workerType === "string" && workerType.toLowerCase().includes("gpu");
var selectEncoder = async (params) => {
  const { response, inputs, otherArguments, childProcess } = params;
  const targetCodec = inputs.target_codec;
  const ffmpegPath = otherArguments.ffmpegPath ?? "ffmpeg";
  if (workerCanUseGpu(otherArguments.workerType) && inputs.try_use_gpu) {
    const candidates = gpuCandidates().filter(
      (candidate) => candidate.encoder.startsWith(targetCodec)
    );
    const enabled = [];
    for (const candidate of candidates) {
      const available = await encoderProbe({
        ffmpegPath,
        encoder: candidate.encoder,
        inputArgs: candidate.inputArgs,
        filter: candidate.filter,
        childProcess
      });
      if (available) enabled.push(candidate);
    }
    if (enabled.length > 0) {
      let selected = enabled[0];
      if (selected.encoder.includes("vaapi")) {
        const qsv = enabled.find((candidate) => candidate.encoder.includes("qsv"));
        if (qsv) selected = qsv;
      }
      if (selected.encoder.includes("nvenc")) {
        selected = getBestNvencDevice({
          response,
          inputs,
          nvencDevice: selected,
          childProcess
        });
      }
      return selected;
    }
  }
  if (targetCodec === "hevc") return { encoder: "libx265" };
  if (targetCodec === "h264") return { encoder: "libx264" };
  return { encoder: "" };
};

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
  if (/\s/.test(token) || token.includes('"')) {
    return `"${token.replace(/"/g, '\\"')}"`;
  }
  return token;
};
var renderArguments = (tokens) => tokens.filter((token) => token.trim() !== "").map(quoteToken).join(" ");

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
var bitrateTokens = (input) => [
  "-b:v",
  normalizeBitrate(input.targetBitrate),
  "-maxrate",
  normalizeBitrate(input.maximumBitrate),
  "-bufsize",
  normalizeBitrate(input.currentBitrate)
];
var getEncoderRateControl = (input) => {
  const base = bitrateTokens(input);
  if (input.encoder === "hevc_nvenc" || input.encoder === "h264_nvenc") {
    return {
      tokens: [
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
  if (input.encoder === "hevc_qsv" || input.encoder === "h264_qsv") {
    return {
      tokens: [...base, "-extbrc", "1", "-look_ahead_depth", "32"],
      description: "QSV bitrate mode with extbrc lookahead"
    };
  }
  if (input.encoder === "libx265" || input.encoder === "libx264") {
    return {
      tokens: base,
      description: "software encoder bitrate mode"
    };
  }
  return {
    tokens: base,
    description: "generic bitrate mode"
  };
};

// src/policy/transcodePolicy.ts
var TARGET_CODECS = ["hevc", "h264"];
var TARGET_CONTAINERS = ["mkv", "mp4", "avi", "ts", "original"];
var TARGET_RESOLUTIONS = ["none", "720p", "480p"];
var isFiniteNonNegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var parseBoolean = (value, fallback) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return fallback;
};
var parseNumber = (value, fallback) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
var parseEnum = (value, allowed, fallback) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : fallback;
  return allowed.includes(normalized) ? normalized : fallback;
};
var parseExcludedGpuIds = (value) => {
  if (typeof value !== "string") return [];
  const unique = /* @__PURE__ */ new Set();
  for (const entry of value.split(",")) {
    const gpuId = Number(entry.trim());
    if (Number.isInteger(gpuId) && gpuId >= 0) unique.add(gpuId);
  }
  return [...unique];
};
var normalizeInputs = (rawInputs, response) => {
  const target_codec = parseEnum(rawInputs.target_codec, TARGET_CODECS, "hevc");
  const container = parseEnum(rawInputs.container, TARGET_CONTAINERS, "mkv");
  const target_resolution = parseEnum(rawInputs.target_resolution, TARGET_RESOLUTIONS, "none");
  const normalized = {
    target_codec,
    container,
    target_resolution,
    target_bitrate_multiplier: Math.max(0, parseNumber(rawInputs.target_bitrate_multiplier, 0.5)),
    try_use_gpu: parseBoolean(rawInputs.try_use_gpu, true),
    bitrate_cutoff: Math.max(0, parseNumber(rawInputs.bitrate_cutoff, 0)),
    enable_10bit: parseBoolean(rawInputs.enable_10bit, false),
    bframes_enabled: parseBoolean(rawInputs.bframes_enabled, false),
    bframes_value: Math.max(0, Math.round(parseNumber(rawInputs.bframes_value, 5))),
    force_conform: parseBoolean(rawInputs.force_conform, false),
    exclude_gpus: typeof rawInputs.exclude_gpus === "string" ? rawInputs.exclude_gpus : "",
    exclude_gpu_ids: parseExcludedGpuIds(rawInputs.exclude_gpus)
  };
  if (normalized.target_bitrate_multiplier === 0) {
    response.infoLog += "target_bitrate_multiplier resolved to 0. No bitrate reduction target is configured.\n";
  }
  return normalized;
};
var resolveTargetContainer = (inputs, file) => inputs.container === "original" ? file.container ?? "mkv" : inputs.container;
var resolveDurationSeconds = (file, response) => {
  const candidates = [
    file.ffProbeData?.format?.duration,
    file.meta?.Duration,
    file.ffProbeData?.streams?.[0]?.duration
  ];
  for (const candidate of candidates) {
    const parsed = typeof candidate === "number" ? candidate : Number(candidate);
    if (isFiniteNonNegative(parsed) && parsed > 0) {
      return { duration: parsed, valid: true };
    }
  }
  response.infoLog += "Unable to determine media duration. Skipping transcode.\n";
  return { duration: 0, valid: false };
};
var calculateBitrates = (file, durationSeconds, multiplier, response) => {
  const fileSizeMb = typeof file.file_size === "number" ? file.file_size : Number(file.file_size);
  if (!isFiniteNonNegative(fileSizeMb) || fileSizeMb <= 0) {
    response.infoLog += "Unable to calculate bitrate from file_size. Skipping transcode.\n";
    return {
      currentBitrate: 0,
      targetBitrate: 0,
      minimumBitrate: 0,
      maximumBitrate: 0,
      valid: false
    };
  }
  const currentBitrate = fileSizeMb * 1024 * 1024 * 8 / durationSeconds;
  if (!Number.isFinite(currentBitrate) || currentBitrate <= 0) {
    response.infoLog += "Computed current bitrate is invalid. Skipping transcode.\n";
    return {
      currentBitrate: 0,
      targetBitrate: 0,
      minimumBitrate: 0,
      maximumBitrate: 0,
      valid: false
    };
  }
  const targetBitrate = multiplier > 1 ? multiplier * 1e3 : currentBitrate * multiplier;
  if (!Number.isFinite(targetBitrate) || targetBitrate <= 0) {
    response.infoLog += "Computed target bitrate is invalid. Skipping transcode.\n";
    return {
      currentBitrate: 0,
      targetBitrate: 0,
      minimumBitrate: 0,
      maximumBitrate: 0,
      valid: false
    };
  }
  return {
    currentBitrate,
    targetBitrate,
    minimumBitrate: targetBitrate * 0.7,
    maximumBitrate: targetBitrate * 1.3,
    valid: true
  };
};
var getContainerConformanceDrops = (container, streamCodecName) => {
  const codec = streamCodecName.trim().toLowerCase();
  if (container === "mkv") {
    return codec === "mov_text" || codec === "eia_608" || codec === "timed_id3";
  }
  if (container === "mp4") {
    return codec === "hdmv_pgs_subtitle" || codec === "eia_608" || codec === "subrip" || codec === "timed_id3";
  }
  return false;
};

// src/runtime/tdarrMethods.ts
var import_node_path = __toESM(require("path"));
var resolveFromCandidates = (relativeCandidates) => {
  const loadErrors = [];
  for (const candidate of relativeCandidates) {
    try {
      return require(candidate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loadErrors.push(`${candidate}: ${message}`);
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

// src/streams/analyze.ts
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
    resizeRequired: false
  };
  params.streams.forEach((stream, index) => {
    if (isUnsupportedStream(stream)) {
      const codecName = typeof stream.codec_name === "string" ? stream.codec_name : "unknown";
      params.pushLog(`Dropping stream 0:${index} because codec "${codecName}" is unsupported.`);
      result.mappingChanged = true;
      return;
    }
    const codecType = normalize(stream.codec_type);
    if (codecType === "subtitle" && typeof stream.codec_name === "string" && getContainerConformanceDrops(params.targetContainer, stream.codec_name)) {
      params.pushLog(
        `Dropping subtitle stream 0:${index} because codec ${stream.codec_name} is not supported in ${params.targetContainer}.`
      );
      result.mappingChanged = true;
      return;
    }
    if (params.forceConform && typeof stream.codec_name === "string" && getContainerConformanceDrops(params.targetContainer, stream.codec_name)) {
      params.pushLog(
        `Dropping stream 0:${index} because codec ${stream.codec_name} is not container-conformant for ${params.targetContainer}.`
      );
      result.mappingChanged = true;
      return;
    }
    if (params.forceConform && params.targetContainer === "mkv" && normalize(stream.codec_type) === "data") {
      params.pushLog(`Dropping stream 0:${index} because data streams are dropped for mkv conformance.`);
      result.mappingChanged = true;
      return;
    }
    if (normalize(stream.codec_type) === "video") {
      if (isDisposableVideoStream(stream)) {
        params.pushLog(`Dropping stream 0:${index} because embedded image streams are not preserved.`);
        result.mappingChanged = true;
        return;
      }
      if (result.primaryVideoStreamIndex === -1) {
        result.primaryVideoStreamIndex = index;
        result.primaryVideoCodec = normalize(stream.codec_name);
        result.resizeRequired = streamNeedsResize(stream, params.targetResolution);
        if (index !== 0) {
          params.pushLog(`Promoting video stream 0:${index} to the first output stream.`);
          result.mappingChanged = true;
        }
        return;
      }
      params.pushLog(`Dropping stream 0:${index} because only one video stream is preserved.`);
      result.mappingChanged = true;
      return;
    }
    result.passthroughStreamIndexes.push(index);
  });
  return result;
};
var streamMapTokens = (streamIndexes) => streamIndexes.flatMap((streamIndex) => ["-map", `0:${streamIndex}`]);

// src/tdarr/details.ts
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
      tooltip: "Specify the multiplier to use to calculate the target bitrate. Values <= 1 are treated as multipliers; values > 1 are treated as absolute target bitrate in kbps. Default of 0.5 will roughly half the size of the file."
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

// src/index.ts
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
  const normalizedInputs = normalizeInputs(loadedDefaults, response);
  const targetContainer = resolveTargetContainer(normalizedInputs, file);
  response.container = `.${targetContainer}`;
  if (file.fileMedium !== "video") {
    pushLog("File is not a video.");
    return response;
  }
  const durationResult = resolveDurationSeconds(file, response);
  if (!durationResult.valid) return response;
  const bitrateResult = calculateBitrates(
    file,
    durationResult.duration,
    normalizedInputs.target_bitrate_multiplier,
    response
  );
  if (!bitrateResult.valid) return response;
  if (bitrateResult.currentBitrate <= normalizedInputs.bitrate_cutoff) {
    pushLog(`Current bitrate is below cutoff ${normalizedInputs.bitrate_cutoff}.`);
    return response;
  }
  const encoder = await selectEncoder({
    response,
    inputs: normalizedInputs,
    otherArguments,
    childProcess
  });
  if (!encoder.encoder) {
    pushLog("No encoder could be selected.");
    return response;
  }
  const streams = file.ffProbeData?.streams ?? [];
  const streamResult = analyzeStreams({
    streams,
    targetResolution: normalizedInputs.target_resolution,
    forceConform: normalizedInputs.force_conform,
    targetContainer,
    pushLog
  });
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
  if (normalizedInputs.enable_10bit) {
    extraTokens = [...extraTokens, ...tokenizeArguments(runtime.getNvenc10BitFormatArg(file))];
  }
  if (bframeSupport.has(encoder.encoder) && normalizedInputs.bframes_enabled) {
    extraTokens.push("-bf", String(normalizedInputs.bframes_value));
  }
  const resolutionFilter = getResolutionFilter(encoder.encoder, normalizedInputs.target_resolution);
  extraTokens = upsertVideoFilterTokens(extraTokens, resolutionFilter);
  const rateControl = getEncoderRateControl({
    encoder: encoder.encoder,
    currentBitrate: bitrateResult.currentBitrate,
    targetBitrate: bitrateResult.targetBitrate,
    maximumBitrate: bitrateResult.maximumBitrate
  });
  pushLog(`Encoder selected as ${encoder.encoder}.`);
  pushLog(`Encoder rate control = ${rateControl.description}.`);
  pushLog(`Container for output selected as ${targetContainer}.`);
  pushLog(`Resolution target selected as ${normalizedInputs.target_resolution}.`);
  pushLog(`Current bitrate = ${bitrateResult.currentBitrate}`);
  pushLog("Bitrate settings:");
  pushLog(`Target = ${bitrateResult.targetBitrate}`);
  pushLog(`Minimum = ${bitrateResult.minimumBitrate}`);
  pushLog(`Maximum = ${bitrateResult.maximumBitrate}`);
  if (streamResult.primaryVideoCodec === normalizedInputs.target_codec && file.container === targetContainer && !streamResult.resizeRequired && !streamResult.mappingChanged) {
    pushLog(`File is already ${normalizedInputs.target_codec} and in ${targetContainer}.`);
    return response;
  }
  if (streamResult.primaryVideoCodec === normalizedInputs.target_codec && !streamResult.resizeRequired) {
    pushLog(
      `File video is already ${normalizedInputs.target_codec} but stream mapping/container needs normalization. Remuxing.`
    );
    response.preset = renderArguments(["<io>", ...mapTokens, "-c", "copy", ...extraTokens]);
    response.processFile = true;
    return response;
  }
  const prefixTokens = [];
  if (encoder.encoder.includes("nvenc")) {
    prefixTokens.push(...tokenizeArguments(runtime.getNvdecHwaccelPreset(file)));
  }
  prefixTokens.push(...tokenizeArguments(encoder.inputArgs ?? ""));
  if (targetContainer === "ts" || targetContainer === "avi") {
    prefixTokens.push("-fflags", "+genpts");
  }
  const transcodeTokens = [
    ...mapTokens,
    "-c",
    "copy",
    "-c:v",
    encoder.encoder,
    ...tokenizeArguments(encoder.outputArgs ?? ""),
    ...rateControl.tokens,
    "-max_muxing_queue_size",
    "9999",
    ...extraTokens
  ];
  response.preset = renderArguments([...prefixTokens, "<io>", ...transcodeTokens]);
  response.processFile = true;
  pushLog(`File is not in ${normalizedInputs.target_codec}. Transcoding.`);
  return response;
};
var plugin = createPlugin();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createPlugin,
  details,
  plugin
});