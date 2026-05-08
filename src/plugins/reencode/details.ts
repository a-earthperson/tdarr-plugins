import type { Tdarr } from "../../tdarr/types";

export const details = (): Tdarr.PluginDetails => ({
  id: "Tdarr_Plugin_00td_action_transcode",
  Stage: "Pre-processing",
  Name: "Transcode A Video File",
  Type: "Video",
  Operation: "Transcode",
  Description:
    "Transcode a video file using ffmpeg. GPU transcoding will be used if possible.",
  Version: "3.5",
  Tags: "pre-processing,ffmpeg,video only,nvenc h265,configurable",
  Inputs: [
    {
      name: "target_codec",
      type: "string",
      defaultValue: "hevc",
      inputUI: {
        type: "dropdown",
        options: ["hevc", "h264"],
      },
      tooltip: "Specify the codec to use",
    },
    {
      name: "target_bitrate_multiplier",
      type: "number",
      defaultValue: 0.5,
      inputUI: {
        type: "text",
      },
      tooltip:
        "Specify the multiplier to use to calculate the target bitrate. Default of 0.5 will roughly half the size of the file.",
    },
    {
      name: "target_resolution",
      type: "string",
      defaultValue: "none",
      inputUI: {
        type: "dropdown",
        options: ["none", "720p", "480p"],
      },
      tooltip:
        "Optionally rescale the video to the selected resolution target. This is independent of target_bitrate_multiplier and does not adjust bitrate calculations.",
    },
    {
      name: "try_use_gpu",
      type: "boolean",
      defaultValue: true,
      inputUI: {
        type: "dropdown",
        options: ["false", "true"],
      },
      tooltip: "If enabled then will use GPU if possible.",
    },
    {
      name: "container",
      type: "string",
      defaultValue: "mkv",
      inputUI: {
        type: "dropdown",
        options: ["mkv", "mp4", "avi", "ts", "original"],
      },
      tooltip:
        "Specify output container of file. Use 'original' to keep original container. Ensure stream types are supported by container. mkv is recommended.",
    },
    {
      name: "bitrate_cutoff",
      type: "number",
      defaultValue: 0,
      inputUI: {
        type: "text",
      },
      tooltip:
        "Specify bitrate cutoff in kbps. Files with current bitrate lower than this are not transcoded.",
    },
    {
      name: "enable_10bit",
      type: "boolean",
      defaultValue: false,
      inputUI: {
        type: "dropdown",
        options: ["false", "true"],
      },
      tooltip: "Specify if output file should be 10bit.",
    },
    {
      name: "bframes_enabled",
      type: "boolean",
      defaultValue: false,
      inputUI: {
        type: "dropdown",
        options: ["false", "true"],
      },
      tooltip:
        "Specify if b frames should be used. This can decrease file sizes but needs newer GPUs.",
    },
    {
      name: "bframes_value",
      type: "number",
      defaultValue: 5,
      inputUI: {
        type: "text",
      },
      tooltip: "Specify number of bframes to use.",
    },
    {
      name: "force_conform",
      type: "boolean",
      defaultValue: false,
      inputUI: {
        type: "dropdown",
        options: ["false", "true"],
      },
      tooltip:
        "Conform to output container requirements by dropping incompatible streams.",
    },
    {
      name: "exclude_gpus",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text",
      },
      tooltip: "Comma-separated GPU ids to exclude from NVENC selection.",
    },
  ],
});
