import {
  FoundryChatCompletionSchema,
  FoundryOutputSchema,
  FoundryResponsesSchema,
  DuplicateGroupsOutputSchema,
  SourceExtractionOutputSchema,
  type FoundryOutput,
  type SourceExtractionResource,
  type DuplicateGroupsOutput,
} from "./schemas";
import type { SupportResource } from "../../shared/types";

export type FoundryEnv = {
  MS_FOUNDRY_ENDPOINT?: string;
  MS_FOUNDRY_DEPLOYMENT_NAME?: string;
  MS_FOUNDRY_API_VERSION?: string;
  MS_FOUNDRY_API_KEY?: string;
  ENABLE_LIVE_SOURCE_INGESTION?: string;
};

export type FoundrySourcePage = {
  id: string;
  source_id: string;
  label: string;
  url: string;
  text: string;
};

type FoundryTransport = "classic" | "v1" | "models" | "project";

type FoundryConfig = {
  endpoint: URL;
  deploymentName: string;
  apiVersion?: string;
  apiKey: string;
  transport: FoundryTransport;
};

const FOUNDRY_REQUEST_TIMEOUT_MS = 45_000;

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export class FoundryConfigurationError extends Error {
  readonly code = "FOUNDRY_NOT_CONFIGURED" as const;

  constructor(message: string) {
    super(message);
    this.name = "FoundryConfigurationError";
  }
}

export class FoundryResponseError extends Error {
  readonly code = "FOUNDRY_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "FoundryResponseError";
  }
}

function detectTransport(endpoint: URL): FoundryTransport {
  const path = endpoint.pathname.replace(/\/+$/, "");

  if (path.includes("/api/projects/")) {
    return "project";
  }
  if (path.endsWith("/openai/v1") || path.includes("/openai/v1/")) {
    return "v1";
  }
  if (
    path.endsWith("/models") ||
    endpoint.hostname.endsWith(".services.ai.azure.com")
  ) {
    return "models";
  }
  return "classic";
}

function requiredConfig(env: FoundryEnv): FoundryConfig {
  const missing = [
    ["MS_FOUNDRY_ENDPOINT", env.MS_FOUNDRY_ENDPOINT],
    ["MS_FOUNDRY_DEPLOYMENT_NAME", env.MS_FOUNDRY_DEPLOYMENT_NAME],
    ["MS_FOUNDRY_API_KEY", env.MS_FOUNDRY_API_KEY],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new FoundryConfigurationError(
      `Microsoft Foundryの環境変数が未設定です: ${missing.join(", ")}`,
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(env.MS_FOUNDRY_ENDPOINT!.trim());
  } catch {
    throw new FoundryConfigurationError(
      "MS_FOUNDRY_ENDPOINTはhttps://から始まる有効なURLにしてください。",
    );
  }

  if (endpoint.protocol !== "https:") {
    throw new FoundryConfigurationError(
      "MS_FOUNDRY_ENDPOINTはHTTPSのURLにしてください。",
    );
  }

  return {
    endpoint,
    deploymentName: env.MS_FOUNDRY_DEPLOYMENT_NAME!.trim(),
    apiVersion: env.MS_FOUNDRY_API_VERSION?.trim() || undefined,
    apiKey: env.MS_FOUNDRY_API_KEY!.trim(),
    transport: detectTransport(endpoint),
  };
}

export function buildFoundryChatCompletionsUrl(env: FoundryEnv) {
  const config = requiredConfig(env);

  const url = new URL(config.endpoint.toString());
  const path = url.pathname.replace(/\/+$/, "");
  const isFullChatCompletionsUrl = path.endsWith("/chat/completions");
  const isFullResponsesUrl = path.endsWith("/openai/v1/responses");

  if (!isFullChatCompletionsUrl && !isFullResponsesUrl) {
    if (config.transport === "project") {
      url.pathname = `${path}/openai/v1/responses`;
    } else if (config.transport === "v1") {
      url.pathname = `${path}/chat/completions`;
    } else if (config.transport === "models") {
      url.pathname = path.endsWith("/models")
        ? `${path}/chat/completions`
        : `${path}/models/chat/completions`;
    } else if (path.endsWith("/openai")) {
      url.pathname = `${path}/deployments/${encodeURIComponent(config.deploymentName)}/chat/completions`;
    } else {
      url.pathname = `${path}/openai/deployments/${encodeURIComponent(config.deploymentName)}/chat/completions`;
    }
  }

  if (config.transport !== "project" && !url.searchParams.has("api-version")) {
    const defaultApiVersion =
      config.transport === "classic"
        ? "2024-10-21"
        : config.transport === "models"
          ? "2024-05-01-preview"
          : undefined;
    const apiVersion = config.apiVersion ?? defaultApiVersion;
    if (apiVersion) url.searchParams.set("api-version", apiVersion);
  } else if (config.transport !== "project" && config.apiVersion) {
    url.searchParams.set("api-version", config.apiVersion);
  }
  return url;
}

function collectResponseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(collectResponseText).filter(Boolean).join("\n");
  }
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (typeof record.text === "string") return record.text;
  for (const key of ["content", "output", "message", "response", "data", "result"]) {
    if (record[key]) {
      const text = collectResponseText(record[key]);
      if (text) return text;
    }
  }
  return "";
}

function describeResponsesPayload(value: unknown) {
  if (!value || typeof value !== "object") return "応答形式が不明です。";

  const record = value as Record<string, unknown>;
  const details = [`status=${typeof record.status === "string" ? record.status : "unknown"}`];
  if (Array.isArray(record.output)) {
    const types = record.output.map((item) => {
      if (!item || typeof item !== "object") return "unknown";
      const type = (item as Record<string, unknown>).type;
      return typeof type === "string" ? type : "unknown";
    });
    details.push(`output_types=${types.slice(0, 5).join(",") || "none"}`);
  }

  const error = record.error;
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    const message =
      typeof errorRecord.message === "string" ? errorRecord.message : "";
    const code = typeof errorRecord.code === "string" ? errorRecord.code : "";
    if (message || code) details.push(`error=${[code, message].filter(Boolean).join(": ")}`);
  }

  const incompleteDetails = record.incomplete_details;
  if (incompleteDetails && typeof incompleteDetails === "object") {
    const reason = (incompleteDetails as Record<string, unknown>).reason;
    if (typeof reason === "string") details.push(`incomplete_reason=${reason}`);
  }

  return `（${details.join("; ")}）`;
}

async function readFoundryErrorDetail(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: unknown; message?: unknown };
      message?: unknown;
    };
    const errorCode = typeof parsed.error?.code === "string" ? parsed.error.code : "";
    const errorMessage =
      typeof parsed.error?.message === "string"
        ? parsed.error.message
        : typeof parsed.message === "string"
          ? parsed.message
          : "";
    if (errorCode && errorMessage) return `${errorCode}: ${errorMessage}`;
    if (errorMessage) return errorMessage;
  } catch {
    // Fall back to a bounded plain-text response below.
  }

  return raw.replace(/\s+/g, " ").trim().slice(0, 500);
}

function extractJsonObject(content: string) {
  const withoutFence = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as unknown;
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new FoundryResponseError("Microsoft Foundryの応答にJSONがありません。");
    }

    try {
      return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
    } catch {
      throw new FoundryResponseError("Microsoft Foundryの応答JSONを読み取れませんでした。");
    }
  }
}

export const CONSULTATION_SAFETY_SYSTEM_PROMPT = `あなたは不登校児童・生徒を支援する情報提供AIです。

【基本原則】
利用者の安全、尊厳、プライバシーを最優先する。
必要以上の個人情報を質問しない。
本名、住所、電話番号、メールアドレス、学校名、SNSアカウント等を尋ねない。
利用者が自発的に個人情報を入力した場合、その情報を繰り返し表示・引用・拡散しない。
入力された情報から本人の身元、住所、学校、家族構成等を推測しない。
利用者の病気・障害・精神状態等を診断しない。
医療・法律・教育上の重大な判断を断定しない。
「絶対に秘密にする」「誰にも知られない」等の保証をしない。

【会話方針】
不登校であることを否定・批判しない。
登校を一方的に促さない。
利用者の意思を尊重し、選択肢を提示する。
必要に応じて保護者、学校、専門機関等への相談を提案する。
利用者が回答したくない場合、無理に質問を続けない。

【安全情報】
以下が疑われる場合、通常の会話より安全確保を優先する。
自殺・自傷
虐待
性的被害
現在進行中の暴力
犯罪被害
その他、生命・身体への重大な危険

これらを検知した場合、具体的な危険行為を助長する情報を提供せず、
利用者の現在の安全を確認し、信頼できる大人や適切な支援先への相談を促す。`;

function systemPrompt() {
  return [
    CONSULTATION_SAFETY_SYSTEM_PROMPT,
    "【この機能での役割】",
    "あなたは、保護者の補足文から検索条件だけを抽出するアシスタントです。",
    "入力文に明示された情報だけを使い、推測や診断をしないでください。",
    "子どもの氏名、学校名、詳細住所などは出力に含めないでください。",
    "必ず次のJSONだけを返してください。Markdownや説明文は不要です。",
    '{"conditions":{},"assistant_message":"補足情報を反映しました。"}',
    "安全情報に該当する危険が疑われる場合は、conditionsを空にし、assistant_messageで現在の安全を短く確認したうえで、信頼できる大人や適切な緊急・専門窓口への相談を促してください。入力に含まれる個人情報や危険行為の具体的内容は繰り返さないでください。",
    "分からない項目はconditionsから省略してください。利用可能な値は、学年が elementary_1〜elementary_6 または junior_high_1〜junior_high_3、世帯状況が all・free・single_parent・subsidy、時間帯が weekday_afternoon・weekday_evening・saturday_morning、送迎が yes・no・unknown、いま一番求めていることが stage1_anonymous・stage2_places・respite・family_peer です。金額は整数の円で返してください。",
  ].join("\n");
}

async function requestChatCompletion(
  env: FoundryEnv,
  messages: Array<{ role: "system" | "user"; content: string }>,
  maxTokens: number,
) {
  const config = requiredConfig(env);
  const requestUrl = buildFoundryChatCompletionsUrl(env);
  const systemMessage = messages.find((message) => message.role === "system");
  const userMessages = messages.filter((message) => message.role === "user");
  const requestBody =
    config.transport === "project"
      ? {
          model: config.deploymentName,
          instructions: systemMessage?.content,
          input: userMessages.map((message) => message.content).join("\n\n"),
          max_output_tokens: maxTokens,
          text: { format: { type: "json_object" } },
        }
      : {
          messages,
          temperature: 0,
          max_tokens: maxTokens,
          ...(config.transport === "classic"
            ? {}
            : { model: config.deploymentName }),
        };

  let response: Response;
  try {
    response = await withTimeout(
      (signal) =>
        fetch(requestUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "api-key": config.apiKey,
          },
          body: JSON.stringify(requestBody),
          signal,
        }),
      FOUNDRY_REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw new FoundryResponseError(
        "Microsoft Foundryへの接続がタイムアウトしました（45秒）。",
      );
    }
    throw new FoundryResponseError("Microsoft Foundryへの接続に失敗しました。");
  }

  if (!response.ok) {
    const detail = await readFoundryErrorDetail(response);
    throw new FoundryResponseError(
      detail
        ? `Microsoft Foundryへの接続に失敗しました（HTTP ${response.status}）：${detail}`
        : `Microsoft Foundryへの接続に失敗しました（HTTP ${response.status}）。`,
    );
  }

  const rawResponse = await response.json();
  if (config.transport === "project") {
    const projectResponse = FoundryResponsesSchema.safeParse(rawResponse);
    if (!projectResponse.success) {
      throw new FoundryResponseError("Microsoft Foundryの応答形式が想定と異なります。");
    }

    const content =
      projectResponse.data.output_text?.trim() ||
      collectResponseText(projectResponse.data.output).trim();
    if (!content) {
      throw new FoundryResponseError(
        `Microsoft Foundryから有効な内容が返りませんでした。${describeResponsesPayload(rawResponse)}`,
      );
    }
    return content;
  }

  const completion = FoundryChatCompletionSchema.safeParse(rawResponse);
  if (!completion.success) {
    throw new FoundryResponseError("Microsoft Foundryの応答形式が想定と異なります。");
  }

  const content = completion.data.choices[0]?.message.content;
  if (!content) {
    throw new FoundryResponseError("Microsoft Foundryから有効な内容が返りませんでした。");
  }

  return content;
}

export async function callFoundry(
  env: FoundryEnv,
  text: string,
): Promise<FoundryOutput> {
  const content = await requestChatCompletion(
    env,
    [
      { role: "system", content: systemPrompt() },
      { role: "user", content: text },
    ],
    3_000,
  );

  const output = FoundryOutputSchema.safeParse(extractJsonObject(content));
  if (!output.success) {
    const details = output.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new FoundryResponseError(
      `Microsoft Foundryの抽出結果を検証できませんでした。${details ? `（${details}）` : ""}`,
    );
  }

  return output.data;
}

function sourceExtractionPrompt(page: FoundrySourcePage) {
  return [
    "あなたは登録済みの支援情報ページから、事実フィールドだけを整理するアシスタントです。",
    "与えられたページ本文以外の情報を検索・推測・補完してはいけません。",
    "ページに明記されていない条件は空配列、null、またはfalseにしてください。",
    "支援機関として識別できる項目だけをresourcesに入れてください。",
    "施設の公開住所は距離計算のため短く出力してください。電話番号、長い紹介文、個人宅の住所などは出力しないでください。",
    "必ず次のJSONだけを返してください。Markdownや説明文は不要です。",
    '{"resources":[{"name":"機関名","category":"public","municipality":"葛飾区","address":"東京都葛飾区〇〇1-2-3","eligible_grades":["junior_high_2"],"eligible_household_statuses":["all"],"opening_times":["weekday_afternoon"],"can_pickup":null,"monthly_fee":null,"subsidy_eligible":false,"supported_needs":["stage2_places"],"notes":["ページに明記された短い確認事項"]}]}',
    "categoryは公営・自治体等ならpublic、民間ならprivateです。不明なcategoryはprivateにしてください。municipalityが不明なら空文字にしてください。施設の公開住所が不明ならaddressはnullにしてください。enum値は必ず例の英語キーで返してください。学年、時間帯、料金、送迎、世帯状況、希望内容はページに明記されている場合だけ返してください。",
    `情報源ID: ${page.id}`,
    `情報源名: ${page.label}`,
    `情報源URL: ${page.url}`,
    "ページ本文:",
    page.text,
  ].join("\n");
}

export async function callFoundryForSourcePage(
  env: FoundryEnv,
  page: FoundrySourcePage,
): Promise<SourceExtractionResource[]> {
  const content = await requestChatCompletion(
    env,
    [
      {
        role: "system",
        content: "あなたは日本語の支援情報を事実ベースで構造化する専門家です。",
      },
      { role: "user", content: sourceExtractionPrompt(page) },
    ],
    6_000,
  );
  const output = SourceExtractionOutputSchema.safeParse(extractJsonObject(content));
  if (!output.success) {
    const details = output.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new FoundryResponseError(
      `情報源からの構造化結果を検証できませんでした。${details ? `（${details}）` : ""}`,
    );
  }

  return output.data.resources;
}

export async function callFoundryForDuplicateGroups(
  env: FoundryEnv,
  resources: SupportResource[],
): Promise<DuplicateGroupsOutput> {
  const candidates = resources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    municipality: resource.municipality,
    address: resource.address,
    source_label: resource.source_label,
    source_url: resource.source_url,
    notes: resource.notes.slice(0, 2),
  }));
  const prompt = [
    "以下は支援検索で抽出された候補です。同じ機関の同じ具体的なサービス・相談窓口を別名で重複掲載している候補だけをグループ化してください。",
    "同じ建物・運営組織であっても、フリースクールと教育相談など利用目的が異なるサービスは別候補です。",
    "名称が少し違っても、住所、情報源、説明から利用者にとって実質的に同じ内容なら重複です。判断できない場合は重複にしないでください。",
    "候補の事実を書き換えず、必ず既存idだけを使って次のJSONを返してください。重複がなければ空配列です。",
    '{"duplicate_groups":[["id-a","id-b"]]}',
    "候補:",
    JSON.stringify(candidates),
  ].join("\n");
  const content = await requestChatCompletion(
    env,
    [
      {
        role: "system",
        content: "あなたは日本語の支援情報の重複判定を慎重に行う専門家です。",
      },
      { role: "user", content: prompt },
    ],
    2_000,
  );
  const output = DuplicateGroupsOutputSchema.safeParse(extractJsonObject(content));
  if (!output.success) {
    throw new FoundryResponseError("Microsoft Foundryの重複判定結果を検証できませんでした。");
  }
  return output.data;
}
