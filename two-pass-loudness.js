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

// src/plugins/two-pass-loudness/audio.ts
var normalize = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
var detectAudioStreams = (file) => {
  let audioIndex = 0;
  const streams = file.ffProbeData?.streams ?? [];
  return streams.flatMap((stream, streamIndex) => {
    if (normalize(stream.codec_type) !== "audio") return [];
    const audioStream = {
      streamIndex,
      audioIndex,
      codecName: normalize(stream.codec_name) || "unknown"
    };
    audioIndex += 1;
    return [audioStream];
  });
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
var quoteToken = (token) => {
  if (token === "<io>") return token;
  if (token === "") return '""';
  if (/[\s"';&|()<>`$\\]/.test(token)) {
    return `"${token.replace(/(["`$\\])/g, "\\$1")}"`;
  }
  return token;
};
var renderArguments = (tokens) => tokens.filter((token) => token.trim() !== "").map(quoteToken).join(" ");

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
var parseLoudnormValuesFromReport = (report) => {
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
};
var loudnormAnalysisExpression = (policy) => `loudnorm=I=${policy.integratedLoudness}:LRA=${policy.loudnessRange}:TP=${policy.truePeak}:print_format=json`;
var loudnormApplyExpression = (policy, measured) => `loudnorm=print_format=summary:linear=true:I=${policy.integratedLoudness}:LRA=${policy.loudnessRange}:TP=${policy.truePeak}:measured_i=${measured.input_i}:measured_lra=${measured.input_lra}:measured_tp=${measured.input_tp}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}`;
var buildFirstPassArgs = (params) => {
  const labels = params.audioStreams.map((_, index) => `ln${index}`);
  const filterComplex = params.audioStreams.map((stream, index) => `[0:${stream.streamIndex}]${loudnormAnalysisExpression(params.policy)}[${labels[index]}]`).join(";");
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
};
var buildSecondPassArgs = (params) => {
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
};
var renderPreset = (args) => renderArguments(args);

// src/common/parse.ts
var parseFiniteNumber = (value, fallback) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
var parseEnum = (value, allowed, fallback) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.includes(normalized) ? normalized : fallback;
};

// src/plugins/two-pass-loudness/policy.ts
var outputCodecs = ["aac", "ac3"];
var normalizeOptionalString = (value) => {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed === "" ? void 0 : trimmed;
};
var normalizeInputs = (rawInputs) => {
  const outputBitrate = normalizeOptionalString(rawInputs.output_bitrate) ?? "192k";
  return {
    policy: {
      integratedLoudness: parseFiniteNumber(rawInputs.i, -23),
      loudnessRange: parseFiniteNumber(rawInputs.lra, 7),
      truePeak: parseFiniteNumber(rawInputs.tp, -2),
      outputCodec: parseEnum(rawInputs.output_codec, outputCodecs, "aac"),
      outputBitrate,
      serverIp: normalizeOptionalString(rawInputs.serverIp),
      serverPort: normalizeOptionalString(rawInputs.serverPort)
    },
    warnings: []
  };
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
var createTdarrReportClient = (params) => {
  const fetchImpl = params.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("Global fetch is unavailable; cannot read Tdarr reports.");
  }
  const serverUrl = getServerUrl(params.policy);
  const apiKey = params.host.configVars?.config?.apiKey;
  return {
    async listFootprintReports(file) {
      const response = await postJson(
        fetchImpl,
        `${serverUrl}/api/v2/list-footprintId-reports`,
        {
          data: {
            footprintId: file.footprintId
          }
        },
        apiKey
      );
      return expectStringArray(response).sort((left, right) => {
        const leftJob = parseJobName(left);
        const rightJob = parseJobName(right);
        return rightJob.start - leftJob.start;
      });
    },
    async readJobFile(file, jobFileId) {
      const response = await postJson(
        fetchImpl,
        `${serverUrl}/api/v2/read-job-file`,
        {
          data: {
            footprintId: file.footprintId,
            jobId: parseJobName(jobFileId).jobId,
            jobFileId
          }
        },
        apiKey
      );
      return expectReportText(response);
    }
  };
};

// src/plugins/two-pass-loudness/index.ts
var createResponse = () => ({
  processFile: false,
  preset: "",
  container: ".mkv",
  handBrakeMode: false,
  FFmpegMode: true,
  reQueueAfter: true,
  infoLog: ""
});
var getNormalisationStage = (file) => {
  const stage = file.ffProbeData?.format?.tags?.[normalisationStageTag];
  if (stage === "FirstPassComplete" || stage === "Complete") return stage;
  return void 0;
};
var createPlugin = (options) => async (file, librarySettings, inputs, otherArguments) => {
  void librarySettings;
  void options?.childProcess;
  const runtime = options?.runtime ?? createDefaultTdarrRuntime();
  const response = createResponse();
  const pushLog = (line) => {
    response.infoLog += `${line}
`;
  };
  if (file.fileMedium !== "video") {
    pushLog("File is not a video.");
    return response;
  }
  const loadedDefaults = runtime.loadDefaultValues(inputs ?? {}, details);
  const normalizedInputs = normalizeInputs(loadedDefaults);
  normalizedInputs.warnings.forEach(pushLog);
  const policy = normalizedInputs.policy;
  const audioStreams = detectAudioStreams(file);
  if (audioStreams.length === 0) {
    pushLog("No audio streams detected.");
    return response;
  }
  const stage = getNormalisationStage(file);
  if (!stage) {
    pushLog(`Detected ${audioStreams.length} audio stream(s). Running loudnorm analysis pass.`);
    response.preset = renderPreset(
      buildFirstPassArgs({
        audioStreams,
        policy
      })
    );
    response.processFile = true;
    return response;
  }
  if (stage === "Complete") {
    pushLog("File is already marked as normalised.");
    return response;
  }
  const reportClient = options?.reportClient ?? createTdarrReportClient({
    policy,
    host: otherArguments,
    fetchImpl: options?.fetchImpl
  });
  const reports = await reportClient.listFootprintReports(file);
  if (reports.length === 0) {
    throw new Error("No Tdarr job reports found for loudnorm first pass.");
  }
  const report = await reportClient.readJobFile(file, reports[0]);
  const measuredValues = parseLoudnormValuesFromReport(report);
  if (measuredValues.length < audioStreams.length) {
    throw new Error(
      `Expected ${audioStreams.length} loudnorm measurement set(s), found ${measuredValues.length}.`
    );
  }
  pushLog(`Read ${measuredValues.length} loudnorm measurement set(s) from first-pass report.`);
  response.preset = renderPreset(
    buildSecondPassArgs({
      audioStreams,
      measuredValues,
      policy
    })
  );
  response.processFile = true;
  pushLog("Applying loudness normalization and appending normalized audio streams.");
  return response;
};
var plugin = createPlugin();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createPlugin,
  details,
  plugin
});
