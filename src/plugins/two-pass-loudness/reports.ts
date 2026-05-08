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
  },
) => Promise<FetchResponseLike>;

function getServerUrl(policy: TwoPassLoudness.Policy): string {
  const serverIp: string | undefined = policy.serverIp ?? process.env.serverIp;
  const serverPort: string | undefined = policy.serverPort ?? process.env.serverPort;
  if (!serverIp || !serverPort) {
    throw new Error("Tdarr serverIp/serverPort are required to read loudnorm first-pass reports.");
  }
  return `http://${serverIp}:${serverPort}`;
}

async function postJson(fetchImpl: FetchLike, url: string, body: unknown, apiKey?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  const response: FetchResponseLike = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (response.status !== 200) {
    throw new Error(`Tdarr report API returned status ${String(response.status)}.`);
  }
  return response.json();
}

function expectStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error("Tdarr report API did not return a string array.");
  }
  return value;
}

function expectReportText(value: unknown): string {
  if (typeof value !== "object" || value === null || typeof (value as { text?: unknown }).text !== "string") {
    throw new Error("Tdarr report API did not return report text.");
  }
  return (value as { text: string }).text;
}

export class HttpTdarrReportClient implements TwoPassLoudness.TdarrReportClient {
  private readonly fetchImpl: FetchLike;
  private readonly serverUrl: string;
  private readonly apiKey?: string;

  public constructor(params: { policy: TwoPassLoudness.Policy; host: Tdarr.HostInfo; fetchImpl?: FetchLike }) {
    const fetchImpl: FetchLike = params.fetchImpl ?? globalThis.fetch;
    this.fetchImpl = fetchImpl;
    this.serverUrl = getServerUrl(params.policy);
    this.apiKey = params.host.configVars?.config?.apiKey;
  }

  public async listFootprintReports(file: Tdarr.MediaMetadata): Promise<string[]> {
    const response: unknown = await postJson(
      this.fetchImpl,
      `${this.serverUrl}/api/v2/list-footprintId-reports`,
      {
        data: {
          footprintId: file.footprintId,
        },
      },
      this.apiKey,
    );
    return expectStringArray(response).sort((left, right) => {
      const leftJob: { jobId: string; start: number } = parseJobName(left);
      const rightJob: { jobId: string; start: number } = parseJobName(right);
      return rightJob.start - leftJob.start;
    });
  }

  public async readJobFile(file: Tdarr.MediaMetadata, jobFileId: string): Promise<string> {
    const response: unknown = await postJson(
      this.fetchImpl,
      `${this.serverUrl}/api/v2/read-job-file`,
      {
        data: {
          footprintId: file.footprintId,
          jobId: parseJobName(jobFileId).jobId,
          jobFileId,
        },
      },
      this.apiKey,
    );
    return expectReportText(response);
  }
}

export function createTdarrReportClient(params: {
  policy: TwoPassLoudness.Policy;
  host: Tdarr.HostInfo;
  fetchImpl?: FetchLike;
}): TwoPassLoudness.TdarrReportClient {
  return new HttpTdarrReportClient(params);
}
