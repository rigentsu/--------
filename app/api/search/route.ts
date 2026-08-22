import { env as workerEnv } from "cloudflare:workers";
import {
  FilterResultSchema,
  SearchApiErrorSchema,
  SearchRequestSchema,
} from "../../../src/server/domain/schemas";
import { filterSupportResources } from "../../../src/server/domain/serviceFilter";
import {
  SourceIngestionError,
  loadResourcesFromApprovedSources,
} from "../../../src/server/sources/sourceIngestion";
import {
  geocodePostalCode,
  geocodeSupportResources,
  GoogleMapsError,
} from "../../../src/server/maps/googleGeocoding";

function errorResponse(
  code: "INVALID_REQUEST" | "SOURCE_ERROR",
  message: string,
  status: number,
) {
  const payload = SearchApiErrorSchema.parse({ ok: false, code, message });
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "検索条件の形式を確認してください。", 400);
  }

  const input = SearchRequestSchema.safeParse(body);
  if (!input.success) {
    return errorResponse("INVALID_REQUEST", "検索条件を確認してください。", 400);
  }

  try {
    const canUseGeocoding = Boolean(workerEnv.GOOGLE_MAPS_API_KEY?.trim());
    const origin = input.data.conditions.postal_code && canUseGeocoding
      ? await geocodePostalCode(input.data.conditions.postal_code, workerEnv)
      : null;
    const resources = await loadResourcesFromApprovedSources(workerEnv);
    const locatedResources = origin
      ? await geocodeSupportResources(resources, workerEnv)
      : resources;
    const result = FilterResultSchema.parse(
      filterSupportResources(input.data.conditions, locatedResources, origin),
    );
    return Response.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof GoogleMapsError || error instanceof SourceIngestionError
        ? error.message
        : "登録済みURLから情報を取得・整理できませんでした。URLとMicrosoft Foundryの設定を確認してください。";
    console.error("[api/search]", message);
    return errorResponse(
      "SOURCE_ERROR",
      message,
      502,
    );
  }
}
