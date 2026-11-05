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
var import_node_fs = require("fs");
var import_node_os = require("os");

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
      gpuName: gpuNames[selectedGpu],
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
var listRenderNodes = () => {
  try {
    return import_node_fs.readdirSync("/dev/dri").filter((name) => /^renderD\d+$/.test(name)).sort().map((name) => `/dev/dri/${name}`);
  } catch {
    return [];
  }
};
var VAAPI_DIMENSION_PROBE = { width: 850, height: 358 };
var vaapiOutputDimensionsCorrect = (params) => new Promise((resolve) => {
  const { width, height } = VAAPI_DIMENSION_PROBE;
  const output = `${import_node_os.tmpdir()}/reencode-vaapi-probe-${process.pid}-${Date.now()}.mkv`;
  const cleanup = () => {
    try {
      import_node_fs.unlinkSync(output);
    } catch {
    }
  };
  const encode = `${params.ffmpegPath} -nostdin -y -v error ${params.inputArgs} -f lavfi -i color=c=black:s=${width}x${height}:d=0.5:r=30 ${params.filter} -c:v ${params.encoder} ${output}`;
  params.childProcess.exec(encode, (encodeError) => {
    if (encodeError) {
      cleanup();
      resolve(false);
      return;
    }
    params.childProcess.exec(`${params.ffmpegPath} -nostdin -hide_banner -i ${output} -frames:v 1 -vf showinfo -f null -`, (decodeError, _stdout, stderr) => {
      cleanup();
      const match = /\bs:(\d+)x(\d+)/.exec(String(stderr ?? ""));
      resolve(!decodeError && match !== null && Number(match[1]) === width && Number(match[2]) === height);
    });
  });
});
var gpuCandidates = () => [
  { encoder: "hevc_nvenc" },
  { encoder: "hevc_amf" },
  ...listRenderNodes().map((device) => ({
    encoder: "hevc_vaapi",
    device,
    inputArgs: `-vaapi_device ${device}`,
    filter: "-vf format=nv12,hwupload",
    hwUpload: true
  })),
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
    const qsv = enabled.find((candidate) => candidate.encoder.includes("qsv"));
    let pool = enabled;
    while (pool.length > 0) {
      let selected = pool[0];
      if (selected.encoder.includes("vaapi")) {
        if (qsv) {
          selected = qsv;
        } else if (!await vaapiOutputDimensionsCorrect({ ffmpegPath, childProcess, ...selected })) {
          response.infoLog += `${selected.encoder} on ${selected.device} writes a wrong HEVC conformance window (decoded size differs from encoded size); not using it.
`;
          pool = pool.slice(1);
          continue;
        }
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
var getSoftwareTenBitFormat = (encoder) => {
  if (encoder.includes("nvenc")) return "";
  if (encoder.includes("qsv") || encoder.includes("amf") || encoder.includes("vaapi")) return "p010le";
  return "yuv420p10le";
};
var getTenBitTokens = (encoder, runtime, file, nvdecOptions) => {
  if (encoder.includes("nvenc")) {
    return tokenizeArguments(runtime.getNvenc10BitFormatArg(file, nvdecOptions));
  }
  if (encoder.includes("vaapi")) {
    return encoder.startsWith("hevc_") ? ["-profile:v", "main10"] : [];
  }
  const tokens = ["-pix_fmt", getSoftwareTenBitFormat(encoder)];
  if (encoder.startsWith("hevc_")) tokens.push("-profile:v", "main10");
  return tokens;
};
var getResolutionFilter = (useCudaScaler, targetResolution) => {
  if (targetResolution === "none") return "";
  const target = resolutionTargets[targetResolution];
  if (!target) return "";
  const scaleFactor = `min(1,if(gte(iw,ih),min(${target.landscape.width}/iw,${target.landscape.height}/ih),min(${target.portrait.width}/iw,${target.portrait.height}/ih)))`;
  const dimensions = `w='trunc(iw*${scaleFactor}/2)*2':h='trunc(ih*${scaleFactor}/2)*2'`;
  return useCudaScaler ? `scale_cuda=${dimensions}:interp_algo=bicubic` : `scale=${dimensions}`;
};
var NVDEC_8BIT_420_PIX_FMTS = ["yuv420p", "yuvj420p", "nv12"];
var NVDEC_HIGH_BIT_420_PIX_FMTS = ["yuv420p10le", "yuv420p12le", "p010le", "p016le"];
var NVDEC_HIGH_BIT_CODECS = ["hevc", "vp9"];
var nvdecCanDecodeStream = (stream) => {
  const pixFmt = typeof stream?.pix_fmt === "string" ? stream.pix_fmt.trim().toLowerCase() : "";
  if (pixFmt === "") return true;
  if (NVDEC_8BIT_420_PIX_FMTS.includes(pixFmt)) return true;
  const codec = typeof stream?.codec_name === "string" ? stream.codec_name.trim().toLowerCase() : "";
  return NVDEC_HIGH_BIT_CODECS.includes(codec) && NVDEC_HIGH_BIT_420_PIX_FMTS.includes(pixFmt);
};
var INTERLACED_FIELD_ORDERS = ["tt", "bb", "tb", "bt"];
var isInterlacedStream = (stream) => typeof stream?.field_order === "string" && INTERLACED_FIELD_ORDERS.includes(stream.field_order.trim().toLowerCase());
var getDeinterlaceFilter = (useCudaFilter) => `${useCudaFilter ? "bwdif_cuda" : "bwdif"}=mode=send_frame:deint=interlaced`;
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
var isQsvEncoder = (encoder) => encoder === "hevc_qsv" || encoder === "h264_qsv";
var qsvGopTokens = () => [
  "-b_strategy",
  "1",
  "-bf",
  "7",
  "-adaptive_i",
  "1",
  "-adaptive_b",
  "1",
  "-g",
  "256"
];
var qsvIcqTokens = (quality) => [
  "-preset",
  "veryslow",
  "-global_quality",
  String(quality),
  ...qsvGopTokens()
];
var isNvencEncoder = (encoder) => encoder === "hevc_nvenc" || encoder === "h264_nvenc";
var NVENC_CQ_OFFSET_FROM_QSV_ICQ = 7;
var nvencCqFromTargetQuality = (targetQuality) => Math.min(51, Math.max(1, targetQuality + NVENC_CQ_OFFSET_FROM_QSV_ICQ));
var nvencCqTokens = (input) => [
  "-preset",
  "p7",
  "-tune",
  "hq",
  "-multipass",
  "fullres",
  "-rc:v",
  "vbr",
  "-cq:v",
  String(input.nvencCq),
  "-b:v",
  "0",
  ...input.targetBitrate > 0 ? ["-maxrate", normalizeBitrate(input.targetBitrate), "-bufsize", normalizeBitrate(input.targetBitrate * 2)] : [],
  "-rc-lookahead:v",
  "32",
  "-spatial_aq:v",
  "1",
  "-temporal_aq:v",
  "1",
  ...input.bframes >= 2 ? ["-b_ref_mode", "middle"] : [],
  "-g",
  "256"
];
var getEncoderRateControl = (input) => {
  if (isQsvEncoder(input.encoder) && input.icqQuality > 0) {
    return {
      tokens: qsvIcqTokens(input.icqQuality),
      description: `QSV ICQ ${input.icqQuality} (veryslow, B-pyramid)`
    };
  }
  if (isNvencEncoder(input.encoder) && input.nvencCq > 0) {
    const ceiling = input.targetBitrate > 0 ? `, ceiling ${Math.round(input.targetBitrate / 1e3)} kbps` : "";
    return {
      tokens: nvencCqTokens(input),
      description: `NVENC CQ ${input.nvencCq} (p7 hq multipass${ceiling})`
    };
  }
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
  if (isQsvEncoder(input.encoder)) {
    return {
      tokens: [
        "-preset",
        "veryslow",
        ...base,
        "-extbrc",
        "1",
        "-look_ahead_depth",
        "40",
        ...qsvGopTokens()
      ],
      description: "QSV EncTools quality (veryslow, B-pyramid, lookahead 40)"
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

// src/encoder/qualityEstimate.ts
var QUALITY_SAMPLE_COUNT = 8;
var QUALITY_SAMPLE_SECONDS = 10;
var STATS_VIDEO_SIZE_REGEX = /video:\s*([\d.]+)\s*(KiB|kB|MiB|MB)\b/g;
var runFfmpeg = (childProcess, ffmpegPath, args) => new Promise((resolve) => {
  const options = { maxBuffer: 64 * 1024 * 1024 };
  const done = (error, _stdout, stderr) => resolve({ ok: !error, stderr: String(stderr ?? ""), error });
  if (typeof childProcess.execFile === "function") {
    childProcess.execFile(ffmpegPath, args, options, done);
    return;
  }
  childProcess.exec(`${ffmpegPath} ${renderArguments(args)}`, options, done);
});
var parseEncodedVideoBytes = (stderr) => {
  let bytes = -1;
  for (const match of stderr.matchAll(STATS_VIDEO_SIZE_REGEX)) {
    const scale = match[2].startsWith("M") ? 1024 * 1024 : 1024;
    bytes = Number(match[1]) * scale;
  }
  return Number.isFinite(bytes) ? bytes : -1;
};
var getSampleWindows = (durationSeconds) => {
  if (durationSeconds <= QUALITY_SAMPLE_COUNT * QUALITY_SAMPLE_SECONDS * 1.5) {
    return [{ start: 0, seconds: durationSeconds, whole: true }];
  }
  return Array.from({ length: QUALITY_SAMPLE_COUNT }, (_, i) => ({
    start: Math.max(0, durationSeconds * (i + 0.5) / QUALITY_SAMPLE_COUNT - QUALITY_SAMPLE_SECONDS / 2),
    seconds: QUALITY_SAMPLE_SECONDS,
    whole: false
  }));
};
var estimateQsvIcqBitrate = async (params) => {
  const { childProcess, ffmpegPath, filePath, durationSeconds, videoStreamIndex, encoder, icqQuality, extraTokens } = params;
  if (typeof filePath !== "string" || filePath === "") {
    return { valid: false, reason: "input file path is unavailable" };
  }
  let totalBytes = 0;
  let totalSeconds = 0;
  for (const window of getSampleWindows(durationSeconds)) {
    const args = [
      "-hide_banner",
      "-nostdin",
      "-nostats",
      "-loglevel",
      "info",
      ...tokenizeArguments(encoder.inputArgs ?? ""),
      ...window.whole ? [] : ["-ss", window.start.toFixed(3), "-t", String(window.seconds)],
      "-i",
      filePath,
      "-map",
      `0:${videoStreamIndex}`,
      "-an",
      "-sn",
      "-dn",
      "-c:v",
      encoder.encoder,
      ...tokenizeArguments(encoder.outputArgs ?? ""),
      ...qsvIcqTokens(icqQuality),
      ...extraTokens,
      "-f",
      "null",
      "-"
    ];
    const result = await runFfmpeg(childProcess, ffmpegPath, args);
    const bytes = result.ok ? parseEncodedVideoBytes(result.stderr) : -1;
    if (bytes < 0) {
      const detail = result.ok ? "no size in ffmpeg stats" : String(result.error?.message ?? "ffmpeg failed").split("\n")[0];
      return { valid: false, reason: `sample at ${window.start.toFixed(1)}s failed: ${detail}` };
    }
    totalBytes += bytes;
    totalSeconds += Math.min(window.seconds, durationSeconds - window.start);
  }
  if (totalSeconds <= 0) return { valid: false, reason: "sampled duration is zero" };
  return { valid: true, bitrate: totalBytes * 8 / totalSeconds, sampledSeconds: totalSeconds };
};

// src/policy/transcodePolicy.ts
var TARGET_CODECS = ["hevc", "h264"];
var TARGET_CONTAINERS = ["mkv", "mp4", "avi", "ts", "original"];
var TARGET_RESOLUTIONS = ["none", "720p", "480p"];
var AUDIO_COPY = "copy";
var AUDIO_AAC_STEREO_VBR = "2.0 AAC @ 128kbps VBR";
var TARGET_AUDIO = [AUDIO_COPY, AUDIO_AAC_STEREO_VBR];
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
var parseAudioTarget = (value) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : AUDIO_COPY;
  return normalized === AUDIO_AAC_STEREO_VBR.toLowerCase() ? AUDIO_AAC_STEREO_VBR : AUDIO_COPY;
};
var parseExcludedGpuIds = (value) => {
  if (typeof value !== "string") return [];
  const unique = /* @__PURE__ */ new Set();
  for (const entry of value.split(",")) {
    if (entry.trim() === "") continue;
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
    target_quality: Math.min(51, Math.max(0, Math.round(parseNumber(rawInputs.target_quality, 0)))),
    try_use_gpu: parseBoolean(rawInputs.try_use_gpu, true),
    bitrate_cutoff: Math.max(0, parseNumber(rawInputs.bitrate_cutoff, 0)),
    enable_10bit: parseBoolean(rawInputs.enable_10bit, false),
    nvenc_cpu_scaling: parseBoolean(rawInputs.nvenc_cpu_scaling, false),
    bframes_enabled: parseBoolean(rawInputs.bframes_enabled, false),
    bframes_value: Math.max(0, Math.round(parseNumber(rawInputs.bframes_value, 5))),
    force_conform: parseBoolean(rawInputs.force_conform, false),
    target_audio: parseAudioTarget(rawInputs.target_audio),
    exclude_gpus: typeof rawInputs.exclude_gpus === "string" ? rawInputs.exclude_gpus : "",
    exclude_gpu_ids: parseExcludedGpuIds(rawInputs.exclude_gpus)
  };
  if (normalized.target_bitrate_multiplier === 0) {
    response.infoLog += normalized.target_quality > 0 ? "target_bitrate_multiplier resolved to 0. Quality target runs without a bitrate ceiling.\n" : "target_bitrate_multiplier resolved to 0. No bitrate reduction target is configured.\n";
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
var calculateBitrates = (file, durationSeconds, multiplier, response, allowNoTarget = false) => {
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
  if (allowNoTarget && targetBitrate === 0) {
    return {
      currentBitrate,
      targetBitrate: 0,
      minimumBitrate: 0,
      maximumBitrate: 0,
      valid: true
    };
  }
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
var unmuxableStreamTypes = {
  mkv: ["data"],
  mp4: ["attachment"]
};
var isUnmuxableStreamType = (container, codecType) => (unmuxableStreamTypes[container] ?? []).includes(codecType);
var isUnprobedAudioStream = (stream) => normalize(stream.codec_type) === "audio" && !(Number(stream.channels) > 0 && Number(stream.sample_rate) > 0);
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
    if (isUnprobedAudioStream(stream)) {
      params.pushLog(`Dropping audio stream 0:${index} (${stream.codec_name}) because its channel layout/sample rate could not be probed.`);
      result.mappingChanged = true;
      return;
    }
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
    if (isUnmuxableStreamType(params.targetContainer, codecType)) {
      const codecName = typeof stream.codec_name === "string" ? stream.codec_name : "unknown";
      params.pushLog(`Dropping ${codecType} stream 0:${index} (${codecName}) because ${params.targetContainer} cannot contain ${codecType} streams.`);
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

// src/audio/transcode.ts
var LOUDNORM_I = -23;
var LOUDNORM_LRA = 7;
var LOUDNORM_TP = -2;
var AAC_VBR_MODE = 4;
var AAC_SAMPLE_RATE = 48000;
var STEREO_DOWNMIX_FILTER = "pan=stereo|FL<FL+FC+BL+SL+WL+TFL+TBL+BC+0.5*LFE|FR<FR+FC+BR+SR+WR+TFR+TBR+BC+0.5*LFE";
var METADATA_SKIP = /^(bps|duration|number_of_|_statistics|source_id)/i;
var DISPOSITION_FLAGS = [
  "default",
  "dub",
  "original",
  "comment",
  "lyrics",
  "karaoke",
  "forced",
  "hearing_impaired",
  "visual_impaired",
  "clean_effects",
  "captions",
  "descriptions",
  "dependent"
];
var isAudioStream = (stream) => normalize(stream?.codec_type) === "audio";
var audioChannelCount = (stream) => {
  const n = Number(stream?.channels);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
var isMultiChannelAudio = (stream) => isAudioStream(stream) && audioChannelCount(stream) > 2;
var audioPrepFilter = () => `${STEREO_DOWNMIX_FILTER},aresample=${AAC_SAMPLE_RATE}`;
var loudnormMeasureFilter = () => `${audioPrepFilter()},loudnorm=I=${LOUDNORM_I}:LRA=${LOUDNORM_LRA}:TP=${LOUDNORM_TP}:print_format=json`;
var loudnormApplyFilter = (measured) => {
  const base = audioPrepFilter();
  if (!measured) return `${base},loudnorm=I=${LOUDNORM_I}:LRA=${LOUDNORM_LRA}:TP=${LOUDNORM_TP}`;
  return `${base},loudnorm=I=${LOUDNORM_I}:LRA=${LOUDNORM_LRA}:TP=${LOUDNORM_TP}:measured_I=${measured.input_i}:measured_LRA=${measured.input_lra}:measured_TP=${measured.input_tp}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
};
var findJsonBlockAfter = (lines, startIndex) => {
  const collected = [];
  let collecting = false;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!collecting && !trimmed.includes("{")) continue;
    collecting = true;
    collected.push(trimmed);
    if (trimmed.includes("}")) break;
  }
  return collected.length > 0 ? collected.join("") : null;
};
var isLoudnormMeasuredValues = (value) => {
  if (typeof value !== "object" || value === null) return false;
  return typeof value.input_i === "string" && typeof value.input_tp === "string" && typeof value.input_lra === "string" && typeof value.input_thresh === "string" && typeof value.target_offset === "string";
};
var parseLoudnormReport = (report) => {
  const lines = String(report ?? "").split(/\r?\n/);
  const values = [];
  lines.forEach((line, index) => {
    if (!line.includes("Parsed_loudnorm")) return;
    const jsonBlock = findJsonBlockAfter(lines, index);
    if (!jsonBlock) return;
    try {
      const parsed = JSON.parse(jsonBlock);
      if (isLoudnormMeasuredValues(parsed)) values.push(parsed);
    } catch {
    }
  });
  return values;
};
var audioEncoderProbe = async (params) => new Promise((resolve) => {
  const extra = params.extra ?? "";
  const command = `${params.ffmpegPath} -hide_banner -nostdin -f lavfi -i anullsrc=r=48000:cl=stereo:d=0.2 -c:a ${params.encoder} ${extra} -f null /dev/null`;
  params.childProcess.exec(command, (error) => resolve(!error));
});
var selectAacEncoder = async (params) => {
  if (await audioEncoderProbe({ ffmpegPath: params.ffmpegPath, childProcess: params.childProcess, encoder: "libfdk_aac", extra: `-vbr ${AAC_VBR_MODE}` })) {
    return {
      encoder: "libfdk_aac",
      tokens: (outputAudioIndex) => [`-c:a:${outputAudioIndex}`, "libfdk_aac", `-vbr:a:${outputAudioIndex}`, String(AAC_VBR_MODE)]
    };
  }
  return {
    encoder: "aac",
    tokens: (outputAudioIndex) => [`-c:a:${outputAudioIndex}`, "aac", `-q:a:${outputAudioIndex}`, "1"]
  };
};
var audioMetadataTokens = (outputAudioIndex, stream) => {
  const spec = `s:a:${outputAudioIndex}`;
  const tokens = [];
  const tags = stream.tags && typeof stream.tags === "object" ? stream.tags : {};
  for (const [key, value] of Object.entries(tags)) {
    if (METADATA_SKIP.test(key) || /encoder/i.test(key)) continue;
    if (typeof value !== "string" || value === "" || /[\s"']/.test(value)) continue;
    tokens.push(`-metadata:${spec}`, `${key}=${value}`);
  }
  const disposition = stream.disposition && typeof stream.disposition === "object" ? stream.disposition : {};
  const flags = DISPOSITION_FLAGS.filter((flag) => Number(disposition[flag]) === 1);
  tokens.push(`-disposition:a:${outputAudioIndex}`, flags.length > 0 ? flags.join("+") : "0");
  return tokens;
};
var measureLoudnormForStreams = async (params) => {
  const { childProcess, ffmpegPath, filePath, streamIndexes } = params;
  if (streamIndexes.length === 0) return [];
  const labels = streamIndexes.map((_, i) => `ln${i}`);
  const filterComplex = streamIndexes.map((index, i) => `[0:${index}]${loudnormMeasureFilter()}[${labels[i]}]`).join(";");
  const args = [
    "-hide_banner",
    "-nostdin",
    "-nostats",
    "-i",
    filePath,
    "-filter_complex",
    filterComplex,
    ...labels.flatMap((label) => ["-map", `[${label}]`]),
    "-f",
    "null",
    "-"
  ];
  const result = await runFfmpeg(childProcess, ffmpegPath, args);
  const measured = parseLoudnormReport(result.stderr);
  return streamIndexes.map((index, i) => ({
    streamIndex: index,
    measured: measured[i] ?? null,
    error: (() => {
      if (result.ok) return measured[i] ? "" : "no loudnorm JSON in ffmpeg output";
      const stderrLines = String(result.stderr ?? "").split("\n").map((line) => line.trim()).filter((line) => line && !/libva info|amdgpu:/.test(line));
      return stderrLines[stderrLines.length - 1] || String(result.error?.message ?? "ffmpeg failed").split("\n")[0];
    })()
  }));
};
var audioEncodeTokens = (params) => {
  const tokens = [];
  let outputAudioIndex = 0;
  for (const srcIndex of params.mappedStreamIndexes) {
    const stream = params.streams[srcIndex];
    if (!isAudioStream(stream)) continue;
    if (isMultiChannelAudio(stream)) {
      const measurement = params.measurements.find((entry) => entry.streamIndex === srcIndex);
      tokens.push(
        ...params.aac.tokens(outputAudioIndex),
        `-ar:a:${outputAudioIndex}`,
        String(AAC_SAMPLE_RATE),
        `-filter:a:${outputAudioIndex}`,
        loudnormApplyFilter(measurement?.measured ?? null),
        ...audioMetadataTokens(outputAudioIndex, stream)
      );
    }
    outputAudioIndex += 1;
  }
  return tokens;
};
var describeAudioStream = (stream) => {
  const layout = typeof stream.channel_layout === "string" && stream.channel_layout !== "" ? stream.channel_layout : `${audioChannelCount(stream)}ch`;
  return `${stream.codec_name} ${layout}`;
};

// src/tdarr/details.ts
var details = () => ({
  id: "Tdarr_Plugin_00td_action_transcode",
  Stage: "Pre-processing",
  Name: "Transcode A Video File",
  Type: "Video",
  Operation: "Transcode",
  Description: "Transcode a video file using ffmpeg. GPU transcoding will be used if possible.",
  Version: "3.6",
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
      tooltip: "Specify the multiplier to use to calculate the target bitrate. Values <= 1 are treated as multipliers; values > 1 are treated as absolute target bitrate in kbps. Default of 0.5 will roughly half the size of the file. When target_quality is set, this becomes the bitrate ceiling (0 = no ceiling)."
    },
    {
      name: "target_quality",
      type: "number",
      defaultValue: 0,
      inputUI: {
        type: "text"
      },
      tooltip: "QSV and NVENC. Constant-quality target in QSV ICQ units (1-51, lower = better/larger; 0 disables). QSV: the plugin sample-encodes the file at this quality; if the estimated bitrate is at or below the target_bitrate_multiplier bitrate it encodes with ICQ, otherwise it falls back to VBR at that bitrate as a ceiling. NVENC: encodes with CQ = target_quality + 7 (calibrated to equal XPSNR) and uses the target_bitrate_multiplier bitrate as a VBV maxrate ceiling."
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
      name: "target_audio",
      type: "string",
      defaultValue: "copy",
      inputUI: {
        type: "dropdown",
        options: TARGET_AUDIO
      },
      tooltip: "Audio handling. copy leaves every audio stream unchanged. 2.0 AAC @ 128kbps VBR transcodes only multi-channel (>2) streams to stereo AAC-LC 48 kHz VBR (~128 kbps, libfdk_aac VBR 4) after an ITU-style L/R downmix (center and surrounds folded into left/right; LFE at -6 dB) and two-pass EBU R128 loudnorm (I=-23, LRA=7, TP=-2). Stereo and mono streams are always copied, including when other streams in the same file are transcoded. Language, title, and disposition are preserved."
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
      name: "nvenc_cpu_scaling",
      type: "boolean",
      defaultValue: false,
      inputUI: {
        type: "dropdown",
        options: ["false", "true"]
      },
      tooltip: "NVENC only. Decode with NVDEC but download frames and scale on the CPU (swscale bicubic) instead of scale_cuda. Measured ~4-7% lower bitrate at equal quality, but makes the encode CPU-bound and moves decoded frames over PCIe. When false, frames stay on the GPU."
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
  execFile: import_node_child_process.execFile,
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
    response,
    normalizedInputs.target_quality > 0
  );
  if (!bitrateResult.valid) return response;
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
  const transcodeAudioIndexes = normalizedInputs.target_audio === AUDIO_COPY
    ? []
    : mappedStreamIndexes.filter((index) => isMultiChannelAudio(streams[index]));
  const audioNeedsEncode = transcodeAudioIndexes.length > 0;
  const belowCutoff = bitrateResult.currentBitrate <= normalizedInputs.bitrate_cutoff * 1e3;
  const videoAlreadyTarget = streamResult.primaryVideoCodec === normalizedInputs.target_codec && !streamResult.resizeRequired;
  const videoNeedsEncode = !belowCutoff && !videoAlreadyTarget;
  if (normalizedInputs.target_audio !== AUDIO_COPY) {
    for (const index of mappedStreamIndexes) {
      const stream = streams[index];
      if (!isAudioStream(stream)) continue;
      if (isMultiChannelAudio(stream)) {
        pushLog(`Audio 0:${index} (${describeAudioStream(stream)}) will be transcoded to stereo AAC VBR.`);
      } else {
        pushLog(`Audio 0:${index} (${describeAudioStream(stream)}) is stereo/mono; copying.`);
      }
    }
  }
  if (belowCutoff) {
    pushLog(`Current bitrate is below cutoff ${normalizedInputs.bitrate_cutoff} kbps.`);
    if (!audioNeedsEncode) return response;
    pushLog("Video encode skipped due to bitrate cutoff; converting multi-channel audio only.");
  }
  if (!videoNeedsEncode && !audioNeedsEncode && file.container === targetContainer && !streamResult.mappingChanged) {
    pushLog(`File is already ${normalizedInputs.target_codec} and in ${targetContainer}.`);
    return response;
  }
  if (!videoNeedsEncode && !audioNeedsEncode) {
    pushLog(
      `File video is already ${normalizedInputs.target_codec} but stream mapping/container needs normalization. Remuxing.`
    );
    response.preset = renderArguments(["<io>", ...mapTokens, "-c", "copy"]);
    response.processFile = true;
    return response;
  }
  let encoder = { encoder: "" };
  let extraTokens = [];
  let nvdecPreset = "";
  if (videoNeedsEncode) {
    encoder = await selectEncoder({
      response,
      inputs: normalizedInputs,
      otherArguments,
      childProcess
    });
    if (!encoder.encoder) {
      pushLog("No encoder could be selected.");
      return response;
    }
    const primaryVideoStream = streams[streamResult.primaryVideoStreamIndex];
    const nvdecUsable = isNvencEncoder(encoder.encoder) && nvdecCanDecodeStream(primaryVideoStream);
    if (isNvencEncoder(encoder.encoder) && !nvdecUsable) {
      pushLog(`NVDEC cannot decode ${primaryVideoStream.codec_name} ${primaryVideoStream.pix_fmt}; decoding and scaling on CPU, encoding with NVENC.`);
    }
    const nvdecOptions = nvdecUsable && normalizedInputs.nvenc_cpu_scaling ? { softwareFrames: true } : void 0;
    nvdecPreset = nvdecUsable ? runtime.getNvdecHwaccelPreset(file, nvdecOptions) : "";
    const cudaFrames = /-hwaccel_output_format\s+cuda\b/.test(nvdecPreset);
    const deinterlaceFilter = isInterlacedStream(primaryVideoStream) ? getDeinterlaceFilter(cudaFrames) : "";
    if (deinterlaceFilter) {
      pushLog(`Source is interlaced (field_order ${primaryVideoStream.field_order}); deinterlacing with ${deinterlaceFilter.split("=")[0]}.`);
    }
    let resolutionFilter = getResolutionFilter(cudaFrames, normalizedInputs.target_resolution);
    if (normalizedInputs.enable_10bit && cudaFrames && resolutionFilter) {
      resolutionFilter += ":format=p010le";
    } else if (normalizedInputs.enable_10bit) {
      extraTokens = [...extraTokens, ...getTenBitTokens(encoder.encoder, runtime, file, cudaFrames ? nvdecOptions : { softwareFrames: true })];
    }
    if (bframeSupport.has(encoder.encoder) && normalizedInputs.bframes_enabled) {
      extraTokens.push("-bf", String(normalizedInputs.bframes_value));
    }
    const uploadFilter = encoder.hwUpload ? `format=${normalizedInputs.enable_10bit ? "p010le" : "nv12"},hwupload` : "";
    extraTokens = upsertVideoFilterTokens(extraTokens, [deinterlaceFilter, resolutionFilter, uploadFilter].filter(Boolean).join(","));
    pushLog(`Encoder selected as ${encoder.encoder}.`);
  }
  pushLog(`Container for output selected as ${targetContainer}.`);
  pushLog(`Resolution target selected as ${normalizedInputs.target_resolution}.`);
  pushLog(`Current bitrate = ${bitrateResult.currentBitrate}`);
  pushLog("Bitrate settings:");
  pushLog(`Target = ${bitrateResult.targetBitrate}`);
  pushLog(`Minimum = ${bitrateResult.minimumBitrate}`);
  pushLog(`Maximum = ${bitrateResult.maximumBitrate}`);
  let icqQuality = 0;
  let nvencCq = 0;
  let rateControl = { tokens: [], description: "" };
  if (videoNeedsEncode) {
    if (normalizedInputs.target_quality > 0 && isNvencEncoder(encoder.encoder)) {
      nvencCq = nvencCqFromTargetQuality(normalizedInputs.target_quality);
      pushLog(`target_quality ${normalizedInputs.target_quality} maps to NVENC CQ ${nvencCq}${encoder.gpuName ? ` on ${encoder.gpuName}` : ""}.`);
    } else if (normalizedInputs.target_quality > 0 && !isQsvEncoder(encoder.encoder)) {
      if (bitrateResult.targetBitrate <= 0) {
        pushLog(`target_quality is only implemented for QSV and NVENC and no target bitrate is set for ${encoder.encoder}. Skipping transcode.`);
        return response;
      }
      pushLog(`target_quality is only implemented for QSV and NVENC; ${encoder.encoder} uses bitrate mode.`);
    } else if (normalizedInputs.target_quality > 0 && bitrateResult.targetBitrate <= 0) {
      icqQuality = normalizedInputs.target_quality;
      pushLog(`No bitrate ceiling configured; using ICQ ${icqQuality} unconditionally.`);
    } else if (normalizedInputs.target_quality > 0) {
      const ceiling = bitrateResult.targetBitrate;
      const estimate = await estimateQsvIcqBitrate({
        childProcess,
        ffmpegPath: otherArguments?.ffmpegPath ?? "ffmpeg",
        filePath: file.file,
        durationSeconds: durationResult.duration,
        videoStreamIndex: streamResult.primaryVideoStreamIndex,
        encoder,
        icqQuality: normalizedInputs.target_quality,
        extraTokens
      });
      if (!estimate.valid) {
        pushLog(`ICQ ${normalizedInputs.target_quality} bitrate estimate failed (${estimate.reason}); using bitrate ceiling.`);
      } else {
        const estimateKbps = Math.round(estimate.bitrate / 1e3);
        const ceilingKbps = Math.round(ceiling / 1e3);
        if (estimate.bitrate <= ceiling) {
          icqQuality = normalizedInputs.target_quality;
          pushLog(`ICQ ${icqQuality} estimated at ${estimateKbps} kbps over ${estimate.sampledSeconds.toFixed(0)}s sampled, within ceiling ${ceilingKbps} kbps. Using ICQ.`);
        } else {
          pushLog(`ICQ ${normalizedInputs.target_quality} estimated at ${estimateKbps} kbps over ${estimate.sampledSeconds.toFixed(0)}s sampled, above ceiling ${ceilingKbps} kbps. Using VBR at ceiling.`);
        }
      }
    }
    rateControl = getEncoderRateControl({
      encoder: encoder.encoder,
      icqQuality,
      nvencCq,
      bframes: normalizedInputs.bframes_enabled ? normalizedInputs.bframes_value : 0,
      currentBitrate: bitrateResult.currentBitrate,
      targetBitrate: bitrateResult.targetBitrate,
      maximumBitrate: bitrateResult.maximumBitrate
    });
    pushLog(`Encoder rate control = ${rateControl.description}.`);
  }
  let audioTokens = [];
  if (audioNeedsEncode) {
    const ffmpegPath = otherArguments?.ffmpegPath ?? "ffmpeg";
    const aac = await selectAacEncoder({ ffmpegPath, childProcess });
    pushLog(`AAC encoder selected as ${aac.encoder} (${aac.encoder === "libfdk_aac" ? `VBR ${AAC_VBR_MODE}` : "native VBR q=1"}, 48 kHz stereo).`);
    const measurements = await measureLoudnormForStreams({
      childProcess,
      ffmpegPath,
      filePath: file.file,
      streamIndexes: transcodeAudioIndexes
    });
    for (const measurement of measurements) {
      if (measurement.measured) {
        pushLog(`Audio 0:${measurement.streamIndex} loudnorm first pass: I=${measurement.measured.input_i} LUFS, TP=${measurement.measured.input_tp} dBTP, LRA=${measurement.measured.input_lra}.`);
      } else {
        pushLog(`Audio 0:${measurement.streamIndex} loudnorm first pass failed (${measurement.error}); using single-pass loudnorm.`);
      }
    }
    audioTokens = audioEncodeTokens({
      mappedStreamIndexes,
      streams,
      measurements,
      aac
    });
  }
  const prefixTokens = videoNeedsEncode ? [...tokenizeArguments(nvdecPreset), ...tokenizeArguments(encoder.inputArgs ?? "")] : [];
  if (targetContainer === "ts" || targetContainer === "avi") {
    prefixTokens.push("-fflags", "+genpts");
  }
  const transcodeTokens = [
    ...mapTokens,
    "-c",
    "copy",
    ...videoNeedsEncode ? ["-c:v", encoder.encoder, ...tokenizeArguments(encoder.outputArgs ?? ""), ...rateControl.tokens] : [],
    ...audioTokens,
    "-max_muxing_queue_size",
    "9999",
    ...extraTokens
  ];
  response.preset = renderArguments([...prefixTokens, "<io>", ...transcodeTokens]);
  response.processFile = true;
  if (videoNeedsEncode && audioNeedsEncode) {
    pushLog(`File is not in ${normalizedInputs.target_codec}. Transcoding video and multi-channel audio.`);
  } else if (videoNeedsEncode) {
    pushLog(`File is not in ${normalizedInputs.target_codec}. Transcoding.`);
  } else {
    pushLog("Video stream copied; transcoding multi-channel audio.");
  }
  return response;
};
var plugin = createPlugin();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createPlugin,
  details,
  plugin
});