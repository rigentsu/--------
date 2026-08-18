import {
  APPROVED_SOURCE_PAGES,
  type ApprovedSourcePage,
} from "../../config/sourceRegistry";
import {
  callFoundryForSourcePage,
  type FoundryEnv,
  type FoundrySourcePage,
} from "../ai/foundryClient";
import type { SupportResource } from "../../shared/types";

const MAX_SOURCE_HTML_CHARACTERS = 120_000;
const MAX_SOURCE_CHARACTERS = 12_000;
const SOURCE_FETCH_TIMEOUT_MS = 15_000;

export class SourceIngestionError extends Error {
  readonly code = "SOURCE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "SourceIngestionError";
  }
}

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

async function readTextWithLimit(response: Response, maxCharacters: number) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
    if (text.length >= maxCharacters) {
      await reader.cancel();
      return text.slice(0, maxCharacters);
    }
  }

  return (text + decoder.decode()).slice(0, maxCharacters);
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchApprovedPage(page: ApprovedSourcePage): Promise<FoundrySourcePage> {
  let url: URL;
  try {
    url = new URL(page.url);
  } catch {
    throw new SourceIngestionError(`情報源URLが不正です: ${page.id}`);
  }

  if (url.protocol !== "https:") {
    throw new SourceIngestionError(`HTTPS以外の情報源は利用できません: ${page.id}`);
  }

  try {
    return await withTimeout(
      async (signal) => {
        const response = await fetch(url, {
          redirect: "follow",
          headers: {
            accept: "text/html, text/plain;q=0.9",
            "user-agent": "yorisoi-navi/0.1 source-reader",
          },
          signal,
        });

        if (!response.ok) {
          throw new SourceIngestionError(
            `情報源ページがHTTP ${response.status}を返しました: ${page.id}`,
          );
        }

        const finalUrl = response.url ? new URL(response.url) : url;
        if (finalUrl.protocol !== "https:" || finalUrl.hostname !== url.hostname) {
          throw new SourceIngestionError(
            `情報源URLのリダイレクト先を確認してください: ${page.id}`,
          );
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
          throw new SourceIngestionError(
            `HTMLまたはテキスト以外の情報源です: ${page.id}`,
          );
        }

        const text = htmlToText(
          await readTextWithLimit(response, MAX_SOURCE_HTML_CHARACTERS),
        ).slice(0, MAX_SOURCE_CHARACTERS);
        if (text.length === 0) {
          throw new SourceIngestionError(`情報源ページに本文がありません: ${page.id}`);
        }

        return { ...page, text };
      },
      SOURCE_FETCH_TIMEOUT_MS,
    );
  } catch (error) {
    if (error instanceof SourceIngestionError) throw error;
    if (isAbortError(error)) {
      throw new SourceIngestionError(
        `情報源ページの取得がタイムアウトしました（15秒）: ${page.id}`,
      );
    }
    throw new SourceIngestionError(`情報源ページを取得できませんでした: ${page.id}`);
  }
}

function toSupportResource(
  page: FoundrySourcePage,
  extracted: Awaited<ReturnType<typeof callFoundryForSourcePage>>[number],
  index: number,
  verifiedAt: string,
): SupportResource {
  return {
    id: `${page.id}-${index + 1}`,
    name: extracted.name,
    source_id: page.source_id,
    source_label: page.label,
    category: extracted.category,
    municipality: extracted.municipality,
    address: extracted.address,
    latitude: null,
    longitude: null,
    eligible_grades: extracted.eligible_grades,
    eligible_household_statuses: extracted.eligible_household_statuses,
    opening_times: extracted.opening_times,
    can_pickup: extracted.can_pickup,
    monthly_fee: extracted.monthly_fee,
    subsidy_eligible: extracted.subsidy_eligible,
    supported_needs: extracted.supported_needs,
    source_url: page.url,
    verified_at: verifiedAt,
    notes: [
      ...extracted.notes,
      "登録済みURLからAIが抽出した情報です。利用前に原ページと窓口で確認してください。",
    ],
    data_status: "ai_extracted_unverified",
  };
}

export async function loadResourcesFromApprovedSources(
  env: FoundryEnv,
): Promise<SupportResource[]> {
  if (APPROVED_SOURCE_PAGES.length === 0) {
    throw new SourceIngestionError("登録済みの情報源URLがありません。");
  }

  const fetchedPages = await Promise.allSettled(
    APPROVED_SOURCE_PAGES.map((page) => fetchApprovedPage(page)),
  );
  const fetchErrors = fetchedPages.flatMap((result) =>
    result.status === "rejected" ? [errorMessage(result.reason)] : [],
  );
  const pages = fetchedPages.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  if (pages.length === 0) {
    throw new SourceIngestionError(
      `登録済みURLから情報を取得できませんでした。${formatReasons(fetchErrors)}`,
    );
  }

  const extractedPages = await Promise.allSettled(
    pages.map((page) => callFoundryForSourcePage(env, page)),
  );
  const extractionErrors = extractedPages.flatMap((result) =>
    result.status === "rejected" ? [errorMessage(result.reason)] : [],
  );
  const verifiedAt = `AI抽出日：${new Date().toISOString().slice(0, 10)}`;
  const resources: SupportResource[] = [];

  extractedPages.forEach((result, pageIndex) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((item, itemIndex) => {
      const resource = toSupportResource(
        pages[pageIndex],
        item,
        itemIndex,
        verifiedAt,
      );
      resources.push(resource);
    });
  });

  if (resources.length === 0) {
    throw new SourceIngestionError(
      "情報源から機関情報を抽出できませんでした。" +
        formatReasons(extractionErrors),
    );
  }

  return resources;
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error && reason.message) return reason.message;
  return "原因不明のエラーです。";
}

function formatReasons(reasons: string[]) {
  return reasons.length > 0 ? `（${reasons.slice(0, 3).join(" / ")}）` : "";
}
