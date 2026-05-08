import type { Tdarr } from "../../tdarr/types";

export const details = (): Tdarr.PluginDetails => ({
  id: "Tdarr_Plugin_earthperson_2_Pass_Loudnorm_Add_Audio_Streams",
  Stage: "Pre-processing",
  Name: "2 Pass Loudnorm Add Audio Streams",
  Type: "Video",
  Operation: "Transcode",
  Description:
    "Runs two-pass ffmpeg loudnorm analysis for every audio stream, then appends one loudness-normalized audio stream per original audio stream while preserving the originals.",
  Version: "1.0",
  Tags: "pre-processing,ffmpeg,configurable,audio only",
  Inputs: [
    {
      name: "i",
      type: "number",
      defaultValue: -23.0,
      inputUI: {
        type: "text",
      },
      tooltip: "Integrated loudness target for loudnorm I.",
    },
    {
      name: "lra",
      type: "number",
      defaultValue: 7.0,
      inputUI: {
        type: "text",
      },
      tooltip: "Loudness range target for loudnorm LRA.",
    },
    {
      name: "tp",
      type: "number",
      defaultValue: -2.0,
      inputUI: {
        type: "text",
      },
      tooltip: "True peak target for loudnorm TP.",
    },
    {
      name: "output_codec",
      type: "string",
      defaultValue: "aac",
      inputUI: {
        type: "dropdown",
        options: ["aac", "ac3"],
      },
      tooltip: "Codec used for appended normalized audio streams.",
    },
    {
      name: "output_bitrate",
      type: "string",
      defaultValue: "192k",
      inputUI: {
        type: "text",
      },
      tooltip: "Bitrate used for appended normalized audio streams.",
    },
    {
      name: "serverIp",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text",
      },
      tooltip: "Optional Tdarr server IP override for reading first-pass reports.",
    },
    {
      name: "serverPort",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text",
      },
      tooltip: "Optional Tdarr server port override for reading first-pass reports.",
    },
  ],
});
