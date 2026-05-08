import type { Tdarr } from "../../tdarr/types";
import { parseJobName } from "./loudnorm";
import type { TwoPassLoudness } from "./types";

interface FetchResponseLike {
  status: number;
  json: () => Promise<unknown>;
}

type FetchLike = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  }
) => Promise<FetchResponseLike>;

const getServerUrl = (
  policy: TwoPassLoudness.Policy
): string => {
  const serverIp = policy.serverIp ?? process.env.serverIp;
  const serverPort = policy.serverPort ?? process.env.serverPort;
  if (!serverIp || !serverPort) {
    throw new Error("Tdarr serverIp/serverPort are required to read loudnorm first-pass reports.");
  }
  return `http://${serverIp}:${serverPort}`;
};

const postJson = async (
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  apiKey?: string
): Promise<unknown> => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (response.status !== 200) {
    throw new Error(`Tdarr report API returned status ${response.status}.`);
  }
  return response.json();
};

const expectStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error("Tdarr report API did not return a string array.");
  }
  return value;
};

const expectReportText = (value: unknown): string => {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as { text?: unknown }).text !== "string"
  ) {
    throw new Error("Tdarr report API did not return report text.");
  }
  return (value as { text: string }).text;
};

export const createTdarrReportClient = (params: {
  policy: TwoPassLoudness.Policy;
  host: Tdarr.HostInfo;
  fetchImpl?: FetchLike;
}): TwoPassLoudness.TdarrReportClient => {
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
            footprintId: file.footprintId,
          },
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
            jobFileId,
          },
        },
        apiKey
      );
      return expectReportText(response);
    },
  };
};
