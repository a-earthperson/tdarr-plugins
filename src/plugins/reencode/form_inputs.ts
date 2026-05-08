import type { Tdarr } from "../../tdarr/types";

const TARGET_CODEC: Tdarr.FormInputSpec = {
  name: "target_codec",
  type: "string",
  defaultValue: "hevc",
  inputUI: {
    type: "dropdown",
    options: ["hevc", "h264"],
  },
  tooltip: "Specify the codec to use",
};

const TARGET_BITRATE_MULTIPLIER: Tdarr.FormInputSpec = {
  name: "target_bitrate_multiplier",
  type: "number",
  defaultValue: 0.5,
  inputUI: {
    type: "text",
  },
  tooltip: "Specify the multiplier to use to calculate the target bitrate. Default of 0.5 will roughly half the size of the file.",
};

const TARGET_RESOLUTION: Tdarr.FormInputSpec = {
  name: "target_resolution",
  type: "string",
  defaultValue: "none",
  inputUI: {
    type: "dropdown",
    options: ["none", "720p", "480p"],
  },
  tooltip:
    "Optionally rescale the video to the selected resolution target. This is independent of target_bitrate_multiplier and does not adjust bitrate calculations.",
};

const TRY_USE_GPU: Tdarr.FormInputSpec = {
  name: "try_use_gpu",
  type: "boolean",
  defaultValue: true,
  inputUI: {
    type: "dropdown",
    options: ["false", "true"],
  },
  tooltip: "If enabled then will use GPU if possible.",
};

const CONTAINER: Tdarr.FormInputSpec = {
  name: "container",
  type: "string",
  defaultValue: "mkv",
  inputUI: {
    type: "dropdown",
    options: ["mkv", "mp4", "avi", "ts", "original"],
  },
  tooltip:
    "Specify output container of file. Use 'original' to keep original container. Ensure stream types are supported by container. mkv is recommended.",
};

const BITRATE_CUTOFF: Tdarr.FormInputSpec = {
  name: "bitrate_cutoff",
  type: "number",
  defaultValue: 0,
  inputUI: {
    type: "text",
  },
  tooltip: "Specify bitrate cutoff in kbps. Files with current bitrate lower than this are not transcoded.",
};

const ENABLE_10BIT: Tdarr.FormInputSpec = {
  name: "enable_10bit",
  type: "boolean",
  defaultValue: false,
  inputUI: {
    type: "dropdown",
    options: ["false", "true"],
  },
  tooltip: "Specify if output file should be 10bit.",
};

const BFRAMES_ENABLED: Tdarr.FormInputSpec = {
  name: "bframes_enabled",
  type: "boolean",
  defaultValue: false,
  inputUI: {
    type: "dropdown",
    options: ["false", "true"],
  },
  tooltip: "Specify if b frames should be used. This can decrease file sizes but needs newer GPUs.",
};

const BFRAMES_VALUE: Tdarr.FormInputSpec = {
  name: "bframes_value",
  type: "number",
  defaultValue: 5,
  inputUI: {
    type: "text",
  },
  tooltip: "Specify number of bframes to use.",
};

const FORCE_CONFORM: Tdarr.FormInputSpec = {
  name: "force_conform",
  type: "boolean",
  defaultValue: false,
  inputUI: {
    type: "dropdown",
    options: ["false", "true"],
  },
  tooltip: "Conform to output container requirements by dropping incompatible streams.",
};

const EXCLUDE_GPUS: Tdarr.FormInputSpec = {
  name: "exclude_gpus",
  type: "string",
  defaultValue: "",
  inputUI: {
    type: "text",
  },
  tooltip: "Comma-separated GPU ids to exclude from NVENC selection.",
};

export const FORM_INPUTS: readonly Tdarr.FormInputSpec[] = [
  TARGET_CODEC,
  TARGET_BITRATE_MULTIPLIER,
  TARGET_RESOLUTION,
  TRY_USE_GPU,
  CONTAINER,
  BITRATE_CUTOFF,
  ENABLE_10BIT,
  BFRAMES_ENABLED,
  BFRAMES_VALUE,
  FORCE_CONFORM,
  EXCLUDE_GPUS,
];

export default FORM_INPUTS;
