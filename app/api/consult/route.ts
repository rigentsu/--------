import { env as workerEnv } from "cloudflare:workers";
import {
  ConsultApiErrorSchema,
  ConsultApiSuccessSchema,
  ConsultationRequestSchema,
} from "../../../src/server/ai/schemas";
import {
  callFoundry,
  FoundryConfigurationError,
  FoundryResponseError,
} from "../../../src/server/ai/foundryClient";

function errorResponse(
  code: "INVALID_REQUEST" | "FOUNDRY_NOT_CONFIGURED" | "FOUNDRY_ERROR",
  message: string,
  status: number,
) {
  const payload = ConsultApiErrorSchema.parse({ ok: false, code, message });
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
    return errorResponse("INVALID_REQUEST", "リクエストの形式を確認してください。", 400);
  }

  const input = ConsultationRequestSchema.safeParse(body);
  if (!input.success) {
    return errorResponse(
      "INVALID_REQUEST",
      "相談内容を確認してください（補足は2,000文字以内）。",
      400,
    );
  }

  try {
    const output = await callFoundry(workerEnv, input.data);
    const payload = ConsultApiSuccessSchema.parse({
      ok: true,
      conditions: output.conditions,
      search_plan: output.search_plan,
      assistant_message: output.assistant_message,
      source: "foundry",
    });
    return Response.json(payload, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error(
      "[api/consult]",
      error instanceof Error ? error.message : "原因不明のエラーです。",
    );
    if (error instanceof FoundryConfigurationError) {
      return errorResponse(
        "FOUNDRY_NOT_CONFIGURED",
        "Microsoft Foundryの環境変数が未設定です。AIによる整理を開始できませんでした。",
        503,
      );
    }

    if (error instanceof FoundryResponseError) {
      return errorResponse(
        "FOUNDRY_ERROR",
        input.data.confirmed_results !== undefined
          ? "支援候補の検索は完了しましたが、AIによる結果説明を取得できませんでした。候補はそのまま確認できます。"
          : "Microsoft Foundryから検索計画を取得できませんでした。時間をおいてもう一度お試しください。",
        502,
      );
    }

    return errorResponse(
      "FOUNDRY_ERROR",
      "AIサービスから応答を取得できませんでした。時間をおいてもう一度お試しください。",
      502,
    );
  }
}
