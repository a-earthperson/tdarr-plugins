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

// src/plugins/two-pass-loudness/index.ts
var two_pass_loudness_exports = {};
__export(two_pass_loudness_exports, {
  createPlugin: () => createPlugin,
  details: () => details,
  plugin: () => plugin
});
module.exports = __toCommonJS(two_pass_loudness_exports);

// src/core/plugin.ts
var import_node_child_process = require("child_process");

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

// src/common/parse.ts
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

// src/core/mediaFile.ts
var MediaFile = class {
  constructor(metadata) {
    this.metadata = metadata;
  }
  isVideo() {
    return this.metadata.fileMedium === "video";
  }
  get streams() {
    return this.metadata.ffProbeData?.streams ?? [];
  }
  resolveContainer(preference) {
    if (preference !== "original") {
      return { container: preference, warnings: [] };
    }
    const normalized = typeof this.metadata.container === "string" ? this.metadata.container.trim().toLowerCase() : "";
    if (Media.outputContainers.includes(normalized)) {
      return { container: normalized, warnings: [] };
    }
    return {
      container: "mkv",
      warnings: [
        "Input requested original container, but source container was unavailable or unsupported; using mkv."
      ]
    };
  }
  duration() {
    const candidates = [
      this.metadata.ffProbeData?.format?.duration,
      this.metadata.meta?.Duration,
      this.metadata.ffProbeData?.streams?.[0]?.duration
    ];
    for (const candidate of candidates) {
      const parsed = typeof candidate === "number" ? candidate : Number(candidate);
      if (isFiniteNonNegative(parsed) && parsed > 0) {
        return { kind: "ok", seconds: parsed };
      }
    }
    return {
      kind: "invalid",
      seconds: 0,
      reason: "Unable to determine media duration."
    };
  }
  bitrateBudget(durationSeconds, multiplier) {
    const fileSizeMb = typeof this.metadata.file_size === "number" ? this.metadata.file_size : Number(this.metadata.file_size);
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
  }
  tag(name) {
    return this.metadata.ffProbeData?.format?.tags?.[name];
  }
};

// src/core/response.ts
var TranscodeResponseBuilder = class {
  constructor(initial) {
    this.response = {
      processFile: false,
      preset: "",
      handBrakeMode: false,
      FFmpegMode: true,
      reQueueAfter: true,
      infoLog: "",
      ...initial
    };
  }
  setContainer(container) {
    this.response.container = container.startsWith(".") ? container : `.${container}`;
    return this;
  }
  log(message) {
    this.response.infoLog += `${message}
`;
    return this;
  }
  logAll(messages) {
    messages.forEach((message) => this.log(message));
    return this;
  }
  transcode(preset) {
    this.response.preset = preset;
    this.response.processFile = true;
    return this;
  }
  skip() {
    this.response.processFile = false;
    this.response.preset = "";
    return this;
  }
  toResponse() {
    return { ...this.response };
  }
};

// src/core/plugin.ts
var defaultChildProcess = {
  exec: import_node_child_process.exec,
  execSync: import_node_child_process.execSync
};
var TdarrPlugin = class {
  constructor(detailsProvider, options = {}) {
    this.detailsProvider = detailsProvider;
    this.options = options;
  }
  details() {
    return this.detailsProvider();
  }
  entrypoint() {
    return async (file, librarySettings, inputs, otherArguments) => {
      const runtime = this.options.runtime ?? createDefaultTdarrRuntime();
      const childProcess = this.options.childProcess ?? defaultChildProcess;
      const loadedInputs = runtime.loadDefaultValues(inputs ?? {}, this.detailsProvider);
      const normalized = this.normalizeInputs(loadedInputs);
      const response = this.createResponse();
      response.logAll(normalized.warnings);
      const context = {
        media: new MediaFile(file),
        rawFile: file,
        librarySettings,
        host: otherArguments,
        policy: normalized.policy,
        runtime,
        childProcess,
        response
      };
      await this.execute(context);
      return response.toResponse();
    };
  }
  createResponse() {
    return new TranscodeResponseBuilder();
  }
};
var VideoTdarrPlugin = class extends TdarrPlugin {
  async execute(context) {
    if (!context.media.isVideo()) {
      context.response.log("File is not a video.").skip();
      return;
    }
    await this.executeVideo(context);
  }
};

// src/plugins/two-pass-loudness/audio.ts
var normalize = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
var AudioStreamCollection = class {
  constructor(streams) {
    this.streams = streams;
  }
  get length() {
    return this.streams.length;
  }
  isEmpty() {
    return this.streams.length === 0;
  }
  toArray() {
    return [...this.streams];
  }
};
var AudioStreamDetector = class {
  detect(file) {
    let audioIndex = 0;
    const streams = file.ffProbeData?.streams ?? [];
    return new AudioStreamCollection(
      streams.flatMap((stream, streamIndex) => {
        if (normalize(stream.codec_type) !== "audio") return [];
        const audioStream = {
          streamIndex,
          audioIndex,
          codecName: normalize(stream.codec_name) || "unknown"
        };
        audioIndex += 1;
        return [audioStream];
      })
    );
  }
};

// src/plugins/two-pass-loudness/details.ts
var details = () => ({
  id: "Tdarr_Plugin_earthperson_2_Pass_Loudnorm_Add_Audio_Streams",
  Stage: "Pre-processing",
  Name: "2 Pass Loudnorm Add Audio Streams",
  Type: "Video",
  Operation: "Transcode",
  Description: "Runs two-pass ffmpeg loudnorm analysis for every audio stream, then appends one loudness-normalized audio stream per original audio stream while preserving the originals.",
  Version: "1.0",
  Tags: "pre-processing,ffmpeg,configurable,audio only",
  Inputs: [
    {
      name: "i",
      type: "number",
      defaultValue: -23,
      inputUI: {
        type: "text"
      },
      tooltip: "Integrated loudness target for loudnorm I."
    },
    {
      name: "lra",
      type: "number",
      defaultValue: 7,
      inputUI: {
        type: "text"
      },
      tooltip: "Loudness range target for loudnorm LRA."
    },
    {
      name: "tp",
      type: "number",
      defaultValue: -2,
      inputUI: {
        type: "text"
      },
      tooltip: "True peak target for loudnorm TP."
    },
    {
      name: "output_codec",
      type: "string",
      defaultValue: "aac",
      inputUI: {
        type: "dropdown",
        options: ["aac", "ac3"]
      },
      tooltip: "Codec used for appended normalized audio streams."
    },
    {
      name: "output_bitrate",
      type: "string",
      defaultValue: "192k",
      inputUI: {
        type: "text"
      },
      tooltip: "Bitrate used for appended normalized audio streams."
    },
    {
      name: "serverIp",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text"
      },
      tooltip: "Optional Tdarr server IP override for reading first-pass reports."
    },
    {
      name: "serverPort",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text"
      },
      tooltip: "Optional Tdarr server port override for reading first-pass reports."
    }
  ]
});

// src/ffmpeg/args.ts
var TOKEN_REGEX = /"([^"]*)"|'([^']*)'|[^\s]+/g;
var quoteToken = (token) => {
  if (token === "<io>") return token;
  if (token === "") return '""';
  if (/[\s"';&|()<>`$\\]/.test(token)) {
    return `"${token.replace(/(["`$\\])/g, "\\$1")}"`;
  }
  return token;
};
var FfmpegArguments = class _FfmpegArguments {
  constructor(tokens) {
    this.tokens = tokens;
  }
  static empty() {
    return new _FfmpegArguments([]);
  }
  static of(tokens) {
    return new _FfmpegArguments([...tokens]);
  }
  static parse(raw) {
    const tokens = [];
    const normalized = raw.trim();
    if (!normalized) return _FfmpegArguments.empty();
    normalized.replace(TOKEN_REGEX, (match, dq, sq) => {
      tokens.push(dq ?? sq ?? match);
      return match;
    });
    return new _FfmpegArguments(tokens);
  }
  append(...tokens) {
    return new _FfmpegArguments([...this.tokens, ...tokens]);
  }
  concat(...groups) {
    return new _FfmpegArguments([
      ...this.tokens,
      ...groups.flatMap((group) => group.toArray())
    ]);
  }
  upsertVideoFilter(videoFilter) {
    if (!videoFilter) return this;
    const next = this.toArray();
    const filterIndex = next.findIndex((token) => token === "-vf" || token === "-filter:v");
    if (filterIndex >= 0 && filterIndex + 1 < next.length) {
      next[filterIndex + 1] = `${next[filterIndex + 1]},${videoFilter}`;
      return new _FfmpegArguments(next);
    }
    return new _FfmpegArguments([...next, "-vf", videoFilter]);
  }
  toArray() {
    return [...this.tokens];
  }
  render() {
    return this.tokens.filter((token) => token.trim() !== "").map(quoteToken).join(" ");
  }
};
var renderArguments = (tokens) => FfmpegArguments.of(tokens).render();

// src/plugins/two-pass-loudness/loudnorm.ts
var normalisationStageTag = "NORMALISATIONSTAGE";
var parseJobName = (text) => {
  const [withoutExtension] = text.split(".txt");
  const parts = withoutExtension.split("()");
  return {
    jobId: parts[3] ?? "",
    start: Number(parts[4] ?? 0)
  };
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
  const candidate = value;
  return typeof candidate.input_i === "string" && typeof candidate.input_tp === "string" && typeof candidate.input_lra === "string" && typeof candidate.input_thresh === "string" && typeof candidate.target_offset === "string";
};
var LoudnormReportParser = class {
  parse(report) {
    const lines = report.split(/\r?\n/);
    const values = [];
    lines.forEach((line, index) => {
      if (!line.includes("Parsed_loudnorm")) return;
      const jsonBlock = findJsonBlockAfter(lines, index);
      if (!jsonBlock) return;
      const parsed = JSON.parse(jsonBlock);
      if (!isLoudnormMeasuredValues(parsed)) {
        throw new Error("Parsed loudnorm JSON did not contain expected measured values.");
      }
      values.push(parsed);
    });
    return values;
  }
};
var loudnormAnalysisExpression = (policy) => `loudnorm=I=${policy.integratedLoudness}:LRA=${policy.loudnessRange}:TP=${policy.truePeak}:print_format=json`;
var loudnormApplyExpression = (policy, measured) => `loudnorm=print_format=summary:linear=true:I=${policy.integratedLoudness}:LRA=${policy.loudnessRange}:TP=${policy.truePeak}:measured_i=${measured.input_i}:measured_lra=${measured.input_lra}:measured_tp=${measured.input_tp}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}`;
var LoudnormCommandBuilder = class {
  buildFirstPassArgs(params) {
    const labels = params.audioStreams.map((_, index) => `ln${index}`);
    const filterComplex = params.audioStreams.map(
      (stream, index) => `[0:${stream.streamIndex}]${loudnormAnalysisExpression(params.policy)}[${labels[index]}]`
    ).join(";");
    return [
      "<io>",
      "-filter_complex",
      filterComplex,
      ...labels.flatMap((label) => ["-map", `[${label}]`]),
      "-f",
      "null",
      params.nullOutput ?? "NUL",
      "-map",
      "0",
      "-c",
      "copy",
      "-metadata",
      `${normalisationStageTag}=FirstPassComplete`
    ];
  }
  buildSecondPassArgs(params) {
    const labels = params.audioStreams.map((_, index) => `ln${index}`);
    const filterComplex = params.audioStreams.map(
      (stream, index) => `[0:${stream.streamIndex}]${loudnormApplyExpression(params.policy, params.measuredValues[index])}[${labels[index]}]`
    ).join(";");
    const appendedAudioCodecArgs = params.audioStreams.flatMap((stream, index) => {
      const outputAudioIndex = params.audioStreams.length + index;
      return [
        `-c:a:${outputAudioIndex}`,
        params.policy.outputCodec,
        `-b:a:${outputAudioIndex}`,
        params.policy.outputBitrate,
        `-metadata:s:a:${outputAudioIndex}`,
        `title=Loudness normalized ${stream.codecName}`
      ];
    });
    return [
      "-y",
      "<io>",
      "-filter_complex",
      filterComplex,
      "-map",
      "0",
      ...labels.flatMap((label) => ["-map", `[${label}]`]),
      "-c",
      "copy",
      ...appendedAudioCodecArgs,
      "-metadata",
      `${normalisationStageTag}=Complete`
    ];
  }
};
var renderPreset = (args) => renderArguments(args);

// src/plugins/two-pass-loudness/policy.ts
var outputCodecs = ["aac", "ac3"];
var normalizeOptionalString = (value) => {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed === "" ? void 0 : trimmed;
};
var TwoPassLoudnessPolicy = class _TwoPassLoudnessPolicy {
  constructor(integratedLoudness, loudnessRange, truePeak, outputCodec, outputBitrate, serverIp, serverPort) {
    this.integratedLoudness = integratedLoudness;
    this.loudnessRange = loudnessRange;
    this.truePeak = truePeak;
    this.outputCodec = outputCodec;
    this.outputBitrate = outputBitrate;
    this.serverIp = serverIp;
    this.serverPort = serverPort;
  }
  static fromInputs(rawInputs) {
    return {
      policy: new _TwoPassLoudnessPolicy(
        parseFiniteNumber(rawInputs.i, -23),
        parseFiniteNumber(rawInputs.lra, 7),
        parseFiniteNumber(rawInputs.tp, -2),
        parseEnum(rawInputs.output_codec, outputCodecs, "aac"),
        normalizeOptionalString(rawInputs.output_bitrate) ?? "192k",
        normalizeOptionalString(rawInputs.serverIp),
        normalizeOptionalString(rawInputs.serverPort)
      ),
      warnings: []
    };
  }
};
var normalizeInputs = (rawInputs) => {
  return TwoPassLoudnessPolicy.fromInputs(rawInputs);
};

// src/plugins/two-pass-loudness/reports.ts
var getServerUrl = (policy) => {
  const serverIp = policy.serverIp ?? process.env.serverIp;
  const serverPort = policy.serverPort ?? process.env.serverPort;
  if (!serverIp || !serverPort) {
    throw new Error("Tdarr serverIp/serverPort are required to read loudnorm first-pass reports.");
  }
  return `http://${serverIp}:${serverPort}`;
};
var postJson = async (fetchImpl, url, body, apiKey) => {
  const headers = {
    "content-type": "application/json"
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (response.status !== 200) {
    throw new Error(`Tdarr report API returned status ${response.status}.`);
  }
  return response.json();
};
var expectStringArray = (value) => {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error("Tdarr report API did not return a string array.");
  }
  return value;
};
var expectReportText = (value) => {
  if (typeof value !== "object" || value === null || typeof value.text !== "string") {
    throw new Error("Tdarr report API did not return report text.");
  }
  return value.text;
};
var HttpTdarrReportClient = class {
  constructor(params) {
    const fetchImpl = params.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error("Global fetch is unavailable; cannot read Tdarr reports.");
    }
    this.fetchImpl = fetchImpl;
    this.serverUrl = getServerUrl(params.policy);
    this.apiKey = params.host.configVars?.config?.apiKey;
  }
  async listFootprintReports(file) {
    const response = await postJson(
      this.fetchImpl,
      `${this.serverUrl}/api/v2/list-footprintId-reports`,
      {
        data: {
          footprintId: file.footprintId
        }
      },
      this.apiKey
    );
    return expectStringArray(response).sort((left, right) => {
      const leftJob = parseJobName(left);
      const rightJob = parseJobName(right);
      return rightJob.start - leftJob.start;
    });
  }
  async readJobFile(file, jobFileId) {
    const response = await postJson(
      this.fetchImpl,
      `${this.serverUrl}/api/v2/read-job-file`,
      {
        data: {
          footprintId: file.footprintId,
          jobId: parseJobName(jobFileId).jobId,
          jobFileId
        }
      },
      this.apiKey
    );
    return expectReportText(response);
  }
};
var createTdarrReportClient = (params) => new HttpTdarrReportClient(params);

// src/plugins/two-pass-loudness/index.ts
var LoudnessStage = class _LoudnessStage {
  constructor(value) {
    this.value = value;
  }
  static from(file) {
    const stage = file.ffProbeData?.format?.tags?.[normalisationStageTag];
    if (stage === "FirstPassComplete" || stage === "Complete") {
      return new _LoudnessStage(stage);
    }
    return new _LoudnessStage(void 0);
  }
  isPendingFirstPass() {
    return this.value === void 0;
  }
  isComplete() {
    return this.value === "Complete";
  }
};
var TwoPassLoudnessPlugin = class extends VideoTdarrPlugin {
  constructor(options) {
    super(details, options);
    this.audioDetector = new AudioStreamDetector();
    this.commandBuilder = new LoudnormCommandBuilder();
    this.reportParser = new LoudnormReportParser();
  }
  createResponse() {
    return super.createResponse().setContainer(".mkv");
  }
  normalizeInputs(rawInputs) {
    return normalizeInputs(rawInputs);
  }
  async executeVideo(context) {
    const audioStreams = this.audioDetector.detect(context.rawFile);
    if (audioStreams.isEmpty()) {
      context.response.log("No audio streams detected.").skip();
      return;
    }
    const stage = LoudnessStage.from(context.rawFile);
    if (stage.isPendingFirstPass()) {
      context.response.log(
        `Detected ${audioStreams.length} audio stream(s). Running loudnorm analysis pass.`
      );
      context.response.transcode(
        renderPreset(
          this.commandBuilder.buildFirstPassArgs({
            audioStreams: audioStreams.toArray(),
            policy: context.policy
          })
        )
      );
      return;
    }
    if (stage.isComplete()) {
      context.response.log("File is already marked as normalised.").skip();
      return;
    }
    const reportClient = this.resolveReportClient(context);
    const reports = await reportClient.listFootprintReports(context.rawFile);
    if (reports.length === 0) {
      throw new Error("No Tdarr job reports found for loudnorm first pass.");
    }
    const report = await reportClient.readJobFile(context.rawFile, reports[0]);
    const measuredValues = this.reportParser.parse(report);
    if (measuredValues.length < audioStreams.length) {
      throw new Error(
        `Expected ${audioStreams.length} loudnorm measurement set(s), found ${measuredValues.length}.`
      );
    }
    context.response.log(
      `Read ${measuredValues.length} loudnorm measurement set(s) from first-pass report.`
    );
    context.response.transcode(
      renderPreset(
        this.commandBuilder.buildSecondPassArgs({
          audioStreams: audioStreams.toArray(),
          measuredValues,
          policy: context.policy
        })
      )
    );
    context.response.log("Applying loudness normalization and appending normalized audio streams.");
  }
  resolveReportClient(context) {
    return this.options.reportClient ?? createTdarrReportClient({
      policy: context.policy,
      host: context.host,
      fetchImpl: this.options.fetchImpl
    });
  }
};
var createPlugin = (options) => new TwoPassLoudnessPlugin(options).entrypoint();
var plugin = createPlugin();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createPlugin,
  details,
  plugin
});
