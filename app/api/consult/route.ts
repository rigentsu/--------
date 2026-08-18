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
      "補足内容を入力してください（2,000文字以内）。",
      400,
    );
  }

  try {
    const output = await callFoundry(workerEnv, input.data.text);
    const payload = ConsultApiSuccessSchema.parse({
      ok: true,
      conditions: output.conditions,
      assistant_message: output.assistant_message,
      source: "foundry",
    });
    return Response.json(payload, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof FoundryConfigurationError) {
      return errorResponse(
        "FOUNDRY_NOT_CONFIGURED",
        "Microsoft Foundryの環境変数が未設定です。ローカル解析を使用します。",
        503,
      );
    }

    if (error instanceof FoundryResponseError) {
      return errorResponse(
        "FOUNDRY_ERROR",
        "Microsoft Foundryを利用できないため、ローカル解析を使用します。",
        502,
      );
    }

    return errorResponse(
      "FOUNDRY_ERROR",
      "AIサービスを利用できないため、ローカル解析を使用します。",
      502,
    );
  }
}
