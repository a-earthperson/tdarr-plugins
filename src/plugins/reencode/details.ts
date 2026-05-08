import type { Tdarr } from "../../tdarr/types";
import { FORM_INPUTS } from "./form_inputs";

const PLUGIN_ID: Tdarr.PluginDetails["id"] = "Tdarr_Plugin_00td_action_transcode";

const PLUGIN_STAGE: Tdarr.PluginDetails["Stage"] = "Pre-processing";

const PLUGIN_NAME: Tdarr.PluginDetails["Name"] = "Transcode A Video File";

const PLUGIN_TYPE: Tdarr.PluginDetails["Type"] = "Video";

const PLUGIN_OPERATION: Tdarr.PluginDetails["Operation"] = "Transcode";

const PLUGIN_DESCRIPTION: Tdarr.PluginDetails["Description"] =
  "Transcode a video file using ffmpeg. GPU transcoding will be used if possible.";

const PLUGIN_VERSION: Tdarr.PluginDetails["Version"] = "3.5";

const PLUGIN_TAGS: Tdarr.PluginDetails["Tags"] =
  "pre-processing,ffmpeg,video only,nvenc h265,configurable";

export const PLUGIN_DETAILS: Tdarr.PluginDetails = {
  id: PLUGIN_ID,
  Stage: PLUGIN_STAGE,
  Name: PLUGIN_NAME,
  Type: PLUGIN_TYPE,
  Operation: PLUGIN_OPERATION,
  Description: PLUGIN_DESCRIPTION,
  Version: PLUGIN_VERSION,
  Tags: PLUGIN_TAGS,
  Inputs: FORM_INPUTS,
};

export default PLUGIN_DETAILS;
