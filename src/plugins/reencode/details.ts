import type { Tdarr } from "../../tdarr/types";
import { FORM_INPUTS } from "./form_inputs";

export const PLUGIN_DETAILS: Tdarr.PluginDetails = {
  id: "re-encode",
  Stage: "Pre-processing",
  Name: "Transcode A Video File",
  Type: "Video",
  Operation: "Transcode",
  Description: "Transcode a video file using FFmpeg. GPU transcoding will be used if possible.",
  Version: "3.5",
  Tags: "pre-processing,ffmpeg,video only,nvenc h265,configurable",
  Inputs: FORM_INPUTS,
};

export default PLUGIN_DETAILS;
