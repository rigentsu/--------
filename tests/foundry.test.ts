import assert from "node:assert/strict";
import test from "node:test";
import {
  ConsultationRequestSchema,
  ExtractedConditionsSchema,
  SourceExtractionOutputSchema,
} from "../src/server/ai/schemas";
import {
  buildFoundryChatCompletionsUrl,
  callFoundry,
  FoundryResponseError,
} from "../src/server/ai/foundryClient";

test("Foundry接続URLはサーバー側の環境変数から組み立てる", () => {
  const url = buildFoundryChatCompletionsUrl({
    MS_FOUNDRY_ENDPOINT: "https://example.openai.azure.com/",
    MS_FOUNDRY_DEPLOYMENT_NAME: "demo deployment",
    MS_FOUNDRY_API_VERSION: "2024-10-21",
    MS_FOUNDRY_API_KEY: "test-only-key",
  });

  assert.equal(
    url.toString(),
    "https://example.openai.azure.com/openai/deployments/demo%20deployment/chat/completions?api-version=2024-10-21",
  );
});

test("Microsoft Foundry Modelsの/models endpointにも対応する", () => {
  const url = buildFoundryChatCompletionsUrl({
    MS_FOUNDRY_ENDPOINT: "https://example.services.ai.azure.com/models",
    MS_FOUNDRY_DEPLOYMENT_NAME: "gpt-4o-mini",
    MS_FOUNDRY_API_KEY: "test-only-key",
  });

  assert.equal(
    url.toString(),
    "https://example.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview",
  );
});

test("Microsoft Foundry OpenAI v1 endpointはdeploymentをmodelとして送るURLになる", () => {
  const url = buildFoundryChatCompletionsUrl({
    MS_FOUNDRY_ENDPOINT: "https://example.openai.azure.com/openai/v1/",
    MS_FOUNDRY_DEPLOYMENT_NAME: "gpt-4o-mini",
    MS_FOUNDRY_API_KEY: "test-only-key",
  });

  assert.equal(
    url.toString(),
    "https://example.openai.azure.com/openai/v1/chat/completions",
  );
});

test("Microsoft Foundry Project endpointはResponses APIのURLになる", () => {
  const url = buildFoundryChatCompletionsUrl({
    MS_FOUNDRY_ENDPOINT:
      "https://example.services.ai.azure.com/api/projects/yorisoi",
    MS_FOUNDRY_DEPLOYMENT_NAME: "gpt-5-mini",
    MS_FOUNDRY_API_VERSION: "2024-05-01-preview",
    MS_FOUNDRY_API_KEY: "test-only-key",
  });

  assert.equal(
    url.toString(),
    "https://example.services.ai.azure.com/api/projects/yorisoi/openai/v1/responses",
  );
});

test("Project endpointにはResponses API形式でinstructionsとinputを送る", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      output_text:
        '{"conditions":{"priority_need":"stage2_places"},"assistant_message":"反映しました。"}',
    });
  }) as typeof fetch;

  try {
    const result = await callFoundry(
      {
        MS_FOUNDRY_ENDPOINT:
          "https://example.services.ai.azure.com/api/projects/yorisoi",
        MS_FOUNDRY_DEPLOYMENT_NAME: "gpt-5-mini",
        MS_FOUNDRY_API_KEY: "test-only-key",
      },
      "子どもの居場所を探したい",
    );

    assert.equal(
      requestUrl,
      "https://example.services.ai.azure.com/api/projects/yorisoi/openai/v1/responses",
    );
    const capturedBody = requestBody as unknown as Record<string, unknown>;
    assert.equal(capturedBody.model, "gpt-5-mini");
    assert.equal(capturedBody.input, "子どもの居場所を探したい");
    assert.equal(typeof capturedBody.instructions, "string");
    const instructions = String(capturedBody.instructions);
    assert.match(
      instructions,
      /利用者の安全、尊厳、プライバシーを最優先する/,
    );
    assert.match(instructions, /自殺・自傷/);
    assert.match(instructions, /登校を一方的に促さない/);
    assert.match(instructions, /conditionsを空にし/);
    assert.ok(
      instructions.indexOf("【基本原則】") <
        instructions.indexOf("【この機能での役割】"),
    );
    assert.equal("temperature" in capturedBody, false);
    assert.equal("reasoning" in capturedBody, false);
    assert.deepEqual(capturedBody.text, { format: { type: "json_object" } });
    assert.equal(result.conditions.priority_need, "stage2_places");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Project Responses APIのoutput配列から本文を抽出する", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: '{"conditions":{},"assistant_message":"抽出しました。"}',
            },
          ],
        },
      ],
    })) as typeof fetch;

  try {
    const result = await callFoundry(
      {
        MS_FOUNDRY_ENDPOINT:
          "https://example.services.ai.azure.com/api/projects/yorisoi",
        MS_FOUNDRY_DEPLOYMENT_NAME: "gpt-5-mini",
        MS_FOUNDRY_API_KEY: "test-only-key",
      },
      "テスト",
    );
    assert.equal(result.assistant_message, "抽出しました。");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Project Responses APIの本文がない場合に安全な状態を返す", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({
      status: "incomplete",
      output: [],
      incomplete_details: { reason: "max_output_tokens" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        callFoundry(
          {
            MS_FOUNDRY_ENDPOINT:
              "https://example.services.ai.azure.com/api/projects/yorisoi",
            MS_FOUNDRY_DEPLOYMENT_NAME: "gpt-5-mini",
            MS_FOUNDRY_API_KEY: "test-only-key",
          },
          "テスト",
        ),
      (error: unknown) => {
        assert.ok(error instanceof FoundryResponseError);
        assert.match(error.message, /status=incomplete/);
        assert.match(error.message, /incomplete_reason=max_output_tokens/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("FoundryのHTTPエラー詳細を安全に返す", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json(
      { error: { code: "BadRequest", message: "Invalid model" } },
      { status: 400 },
    )) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        callFoundry(
          {
            MS_FOUNDRY_ENDPOINT:
              "https://example.services.ai.azure.com/api/projects/yorisoi",
            MS_FOUNDRY_DEPLOYMENT_NAME: "gpt-5-mini",
            MS_FOUNDRY_API_KEY: "test-only-key",
          },
          "テスト",
        ),
      (error: unknown) => {
        assert.ok(error instanceof FoundryResponseError);
        assert.match(error.message, /HTTP 400/);
        assert.match(error.message, /BadRequest: Invalid model/);
        assert.doesNotMatch(error.message, /test-only-key/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Foundryへ送る補足文と返却条件をZodで制限する", () => {
  assert.equal(
    ConsultationRequestSchema.safeParse({ text: "平日午後に利用したい" }).success,
    true,
  );
  assert.equal(ConsultationRequestSchema.safeParse({ text: "" }).success, false);
  assert.equal(
    ExtractedConditionsSchema.safeParse({
      grade: "junior_high_2",
      household_status: "single_parent",
      preferred_times: ["weekday_afternoon"],
      monthly_budget: 30_000,
      priority_need: "stage2_places",
    }).success,
    true,
  );
  assert.equal(
    ExtractedConditionsSchema.safeParse({ grade: "not-a-grade" }).success,
    false,
  );
});

test("情報源の日本語enumとnullを内部形式へ正規化する", () => {
  const output = SourceExtractionOutputSchema.parse({
    resources: [
      {
        name: "地域の学習支援",
        category: "公営",
        municipality: null,
        "住所": "東京都葛飾区立石1-2-3",
        eligible_grades: ["中学2年"],
        eligible_household_statuses: ["ひとり親世帯"],
        opening_times: ["平日午後"],
        can_pickup: "なし",
        monthly_fee: "月額5,000円",
        subsidy_eligible: "対象",
        supported_needs: ["居場所"],
        notes: null,
      },
    ],
  });

  assert.equal(output.resources[0]?.category, "public");
  assert.deepEqual(output.resources[0]?.eligible_grades, ["junior_high_2"]);
  assert.deepEqual(output.resources[0]?.eligible_household_statuses, ["single_parent"]);
  assert.deepEqual(output.resources[0]?.opening_times, ["weekday_afternoon"]);
  assert.deepEqual(output.resources[0]?.supported_needs, ["stage2_places"]);
  assert.equal(output.resources[0]?.monthly_fee, 5_000);
  assert.equal(output.resources[0]?.address, "東京都葛飾区立石1-2-3");
});

test("情報源の欠損フィールドを空値として保持する", () => {
  const output = SourceExtractionOutputSchema.parse({ resources: [{}] });
  const resource = output.resources[0];

  assert.equal(resource?.name, "情報源から抽出した支援情報");
  assert.equal(resource?.category, "private");
  assert.equal(resource?.municipality, "");
  assert.deepEqual(resource?.eligible_grades, []);
  assert.deepEqual(resource?.opening_times, []);
  assert.equal(resource?.monthly_fee, null);
});
