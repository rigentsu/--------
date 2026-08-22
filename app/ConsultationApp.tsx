"use client";

import { useState } from "react";
import {
  ConsultationConditionsSchema,
  FilterResultSchema,
  SearchApiErrorSchema,
} from "../src/server/domain/schemas";
import { parseNaturalLanguage } from "../src/server/domain/naturalLanguage";
import {
  ConsultApiResponseSchema,
  type ConsultationAnswer,
} from "../src/server/ai/schemas";
import type {
  ConsultationConditions,
  FilterResult,
  Grade,
  HouseholdStatus,
  PickupPreference,
  PriorityNeed,
  ReviewResource,
  TimeSlot,
} from "../src/shared/types";

const initialConditions: ConsultationConditions = {
  municipality: "葛飾区",
  postal_code: "",
  grade: "junior_high_2",
  household_status: "all",
  preferred_times: ["weekday_afternoon"],
  can_pickup: "unknown",
  monthly_budget: 30000,
  annual_income: 0,
  priority_need: "stage2_places",
};

const CONSULT_TIMEOUT_MS = 50_000;

const gradeOptions: Array<{ value: Grade; label: string }> = [
  { value: "elementary_1", label: "小学1年生" },
  { value: "elementary_2", label: "小学2年生" },
  { value: "elementary_3", label: "小学3年生" },
  { value: "elementary_4", label: "小学4年生" },
  { value: "elementary_5", label: "小学5年生" },
  { value: "elementary_6", label: "小学6年生" },
  { value: "junior_high_1", label: "中学1年生" },
  { value: "junior_high_2", label: "中学2年生" },
  { value: "junior_high_3", label: "中学3年生" },
];

const timeOptions: Array<{ value: TimeSlot; label: string }> = [
  { value: "weekday_afternoon", label: "平日午後" },
  { value: "weekday_evening", label: "平日夜間" },
  { value: "saturday_morning", label: "土曜午前" },
];

const pickupOptions: Array<{ value: PickupPreference; label: string }> = [
  { value: "yes", label: "送迎できる" },
  { value: "no", label: "送迎できない" },
  { value: "unknown", label: "まだわからない" },
];

const householdOptions: Array<{ value: HouseholdStatus; label: string }> = [
  { value: "all", label: "こだわらない" },
  { value: "free", label: "完全無料（0円）" },
  { value: "single_parent", label: "ひとり親世帯優先" },
  { value: "subsidy", label: "助成金対象" },
];

type SupportFocus =
  | "voice"
  | "organize"
  | "learn"
  | "school_discussion"
  | "find_support"
  | "future"
  | "home"
  | "listen"
  | "unknown"
  | "other"
  | "prefer_not";

const supportFocusOptions: Array<{
  id: SupportFocus;
  label: string;
  description: string;
  priorityNeed: PriorityNeed;
  exclusive?: boolean;
}> = [
  {
    id: "voice",
    label: "子どもへの声かけを考えたい",
    description: "相談・情報整理を中心に探します",
    priorityNeed: "stage1_anonymous",
  },
  {
    id: "organize",
    label: "今の状況を整理したい",
    description: "相談・情報整理を中心に探します",
    priorityNeed: "stage1_anonymous",
  },
  {
    id: "learn",
    label: "不登校について知りたい",
    description: "相談・情報整理を中心に探します",
    priorityNeed: "stage1_anonymous",
  },
  {
    id: "school_discussion",
    label: "学校との話し合い方を考えたい",
    description: "相談・情報整理を中心に探します",
    priorityNeed: "stage1_anonymous",
  },
  {
    id: "find_support",
    label: "利用できる支援を探したい",
    description: "居場所・学び・進路支援を中心に探します",
    priorityNeed: "stage2_places",
  },
  {
    id: "future",
    label: "今後の進路を考えたい",
    description: "居場所・学び・進路支援を中心に探します",
    priorityNeed: "stage2_places",
  },
  {
    id: "home",
    label: "家での過ごし方を考えたい",
    description: "相談・情報整理を中心に探します",
    priorityNeed: "stage1_anonymous",
  },
  {
    id: "listen",
    label: "とにかく話を聞いてほしい",
    description: "相談できる窓口を中心に探します",
    priorityNeed: "stage1_anonymous",
  },
  {
    id: "unknown",
    label: "まだ分からない",
    description: "希望を限定せずに探します",
    priorityNeed: "all",
  },
  {
    id: "other",
    label: "その他",
    description: "希望を限定せずに探します",
    priorityNeed: "all",
  },
  {
    id: "prefer_not",
    label: "答えたくない",
    description: "希望を限定せずに探します",
    priorityNeed: "all",
    exclusive: true,
  },
];

type IntakeQuestion = {
  id: string;
  number: string;
  title: string;
  prompt: string;
  hint?: string;
  selection: "single" | "multiple";
  options: Array<{ value: string; label: string; exclusive?: boolean }>;
};

const intakeQuestions: IntakeQuestion[] = [
  {
    id: "call_me",
    number: "Q0",
    title: "呼び方",
    prompt:
      "まず、あなたの呼び方を教えてください。このあと、あなたのことを何とお呼びすればよいですか？",
    hint: "※本名を入力する必要はありません。",
    selection: "single",
    options: [
      { value: "mother", label: "お母さん" },
      { value: "father", label: "お父さん" },
      { value: "guardian", label: "保護者さん" },
      { value: "other", label: "その他" },
      { value: "custom", label: "自分で入力する" },
      { value: "prefer_not", label: "答えたくない", exclusive: true },
    ],
  },
  {
    id: "consultation_topics",
    number: "Q1",
    title: "相談したいこと",
    prompt: "今日はどんなことについて相談したいですか？",
    hint: "複数選択できます。",
    selection: "multiple",
    options: [
      { value: "reason", label: "子どもが学校に行けない理由を知りたい" },
      { value: "communication", label: "子どもへの接し方を知りたい" },
      { value: "school", label: "学校との関わり方を知りたい" },
      { value: "home", label: "家での過ごし方を知りたい" },
      { value: "study_path", label: "勉強・進路について相談したい" },
      { value: "support", label: "利用できる支援について知りたい" },
      { value: "self", label: "自分自身の不安や悩みを相談したい" },
      { value: "unsure", label: "まだ何を相談したいか分からない" },
      { value: "other", label: "その他" },
    ],
  },
  {
    id: "school_status",
    number: "Q2",
    title: "現在の学校との状況",
    prompt: "お子さんの学校との関わりについて、近いものを教えてください。",
    selection: "single",
    options: [
      { value: "attending", label: "今もほぼ毎日登校している" },
      { value: "late_early", label: "遅刻・早退が増えている" },
      { value: "more_absences", label: "休む日が増えている" },
      { value: "rarely", label: "ほとんど学校に行っていない" },
      { value: "long_absence", label: "長期間、学校に行っていない" },
      { value: "recent", label: "最近、学校に行けなくなった" },
      { value: "unknown", label: "よく分からない" },
      { value: "prefer_not", label: "答えたくない", exclusive: true },
    ],
  },
  {
    id: "duration",
    number: "Q3",
    title: "いつ頃から？",
    prompt: "その状態は、いつ頃から続いていますか？",
    selection: "single",
    options: [
      { value: "one_week", label: "ここ1週間くらい" },
      { value: "one_month", label: "1か月以内" },
      { value: "one_to_three_months", label: "1〜3か月くらい" },
      { value: "half_year", label: "半年くらい" },
      { value: "over_year", label: "1年以上" },
      { value: "unknown", label: "はっきり分からない" },
      { value: "prefer_not", label: "答えたくない", exclusive: true },
    ],
  },
  {
    id: "main_concerns",
    number: "Q4",
    title: "今、一番気になっていること",
    prompt: "今、お子さんについて一番気になっていることは何ですか？",
    hint: "複数選択できます。",
    selection: "multiple",
    options: [
      { value: "feelings", label: "子どもの気持ちが分からない" },
      { value: "conversation", label: "子どもとの会話が難しい" },
      { value: "encourage", label: "学校に行くよう声をかけるべきか迷っている" },
      { value: "morning_health", label: "朝になると体調が悪くなる" },
      { value: "stays_home", label: "家からあまり出なくなった" },
      { value: "study_delay", label: "勉強の遅れが心配" },
      { value: "friends", label: "友人関係が心配" },
      { value: "future", label: "進路が心配" },
      { value: "school_relationship", label: "学校との関係がうまくいっていない" },
      { value: "family_disagreement", label: "家族間で意見が合わない" },
      { value: "exhausted", label: "自分自身が疲れている" },
      { value: "other", label: "その他" },
      { value: "unknown", label: "まだ分からない" },
      { value: "prefer_not", label: "答えたくない", exclusive: true },
    ],
  },
  {
    id: "recent_state",
    number: "Q5",
    title: "最近のお子さんの様子",
    prompt: "最近のお子さんの様子について、当てはまるものはありますか？",
    hint: "複数選択できます。",
    selection: "multiple",
    options: [
      { value: "sometimes_well", label: "元気なときもある" },
      { value: "same_at_home", label: "家では普段とあまり変わらない" },
      { value: "goes_out", label: "外出することはある" },
      { value: "interests", label: "好きなことには取り組めている" },
      { value: "sleep", label: "睡眠リズムが変わった" },
      { value: "appetite", label: "食欲が変わった" },
      { value: "morning_health", label: "朝に体調が悪くなる" },
      { value: "avoids_people", label: "人との関わりを避けるようになった" },
      { value: "irritated", label: "イライラすることが増えた" },
      { value: "anxious", label: "不安そうにしている" },
      { value: "low_mood", label: "気分が落ち込んでいるように見える" },
      { value: "unknown", label: "よく分からない" },
      { value: "other", label: "その他" },
      { value: "prefer_not", label: "答えたくない", exclusive: true },
    ],
  },
  {
    id: "support_focus",
    number: "Q6",
    title: "どんなサポートがあると助かりますか？",
    prompt: "今、どんなことを一緒に考えられると助かりそうですか？",
    selection: "single",
    options: supportFocusOptions.map((option) => ({
      value: option.id,
      label: option.label,
      exclusive: option.exclusive,
    })),
  },
];

function IntakeQuestionnaire({
  onSupportFocusChange,
  onConsult,
}: {
  onSupportFocusChange: (focus: SupportFocus) => void;
  onConsult: (answers: ConsultationAnswer[]) => Promise<string>;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [customCallName, setCustomCallName] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");
  const [consultError, setConsultError] = useState("");
  const [isConsulting, setIsConsulting] = useState(false);
  const isComplete = step >= intakeQuestions.length;
  const question = intakeQuestions[Math.min(step, intakeQuestions.length - 1)];

  function toggleAnswer(option: IntakeQuestion["options"][number]) {
    if (!question) return;
    const selected = answers[question.id] ?? [];
    let nextSelected: string[];
    if (question.selection === "single" || option.exclusive) {
      nextSelected = selected.includes(option.value) ? [] : [option.value];
    } else {
      const withoutExclusive = selected.filter((value) =>
        question.options.every(
          (candidate) => candidate.value !== value || !candidate.exclusive,
        ),
      );
      nextSelected = withoutExclusive.includes(option.value)
        ? withoutExclusive.filter((value) => value !== option.value)
        : [...withoutExclusive, option.value];
    }
    setAnswers((current) => ({
      ...current,
      [question.id]: nextSelected,
    }));
    if (question.id === "support_focus" && nextSelected.length > 0) {
      onSupportFocusChange(option.value as SupportFocus);
    }
  }

  const answeredCount = intakeQuestions.filter(
    (item) => (answers[item.id]?.length ?? 0) > 0,
  ).length;

  function consultationAnswers(): ConsultationAnswer[] {
    return intakeQuestions.flatMap((item) => {
      const selectedValues = answers[item.id] ?? [];
      if (selectedValues.length === 0) return [];
      const labels = selectedValues.flatMap((value) => {
        const option = item.options.find((candidate) => candidate.value === value);
        return option ? [option.label] : [];
      });
      if (labels.length === 0) return [];
      return [{ question_id: item.id as ConsultationAnswer["question_id"], question: item.title, answers: labels }];
    });
  }

  async function requestAiResponse() {
    setIsConsulting(true);
    setConsultError("");
    try {
      setAssistantMessage(await onConsult(consultationAnswers()));
    } catch (error) {
      setAssistantMessage("");
      setConsultError(
        error instanceof Error
          ? error.message
          : "AIから応答を取得できませんでした。時間をおいてもう一度お試しください。",
      );
    } finally {
      setIsConsulting(false);
    }
  }

  function finishQuestionnaire() {
    setStep(intakeQuestions.length);
    void requestAiResponse();
  }

  if (isComplete) {
    return (
      <section className="panel intake-panel intake-complete" aria-label="相談の入口">
        <div className="intake-complete-mark" aria-hidden="true">✓</div>
        <div>
          <p className="intake-kicker">相談の入口</p>
          <h2>回答ありがとうございます</h2>
          <p>
            {intakeQuestions.length}問中{answeredCount}問に回答しました。答えなかった質問があっても問題ありません。
            回答内容は保存せず、相談内容を整理するためにAIへ送信します。
          </p>
          <div className="ai-guidance" aria-live="polite">
            <p className="ai-guidance-label">AIからのご案内</p>
            {isConsulting ? (
              <p>回答内容を整理しています…</p>
            ) : assistantMessage ? (
              <p className="ai-guidance-message">{assistantMessage}</p>
            ) : consultError ? (
              <div>
                <p className="error-message">{consultError}</p>
                <button className="ghost-button" type="button" onClick={() => void requestAiResponse()}>
                  AIへもう一度送る
                </button>
              </div>
            ) : null}
          </div>
          <div className="intake-complete-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setAssistantMessage("");
                setConsultError("");
                setStep(0);
              }}
            >
              回答を見直す
            </button>
            <a className="intake-next-link" href="#search-conditions">
              支援先の条件設定へ進む ↓
            </a>
          </div>
        </div>
      </section>
    );
  }

  if (!question) return null;
  const selected = answers[question.id] ?? [];
  const progress = ((step + 1) / intakeQuestions.length) * 100;

  return (
    <section className="panel intake-panel" aria-labelledby="intake-title">
      <div className="intake-topline">
        <div>
          <p className="intake-kicker">相談の入口 · {question.number}</p>
          <h2 id="intake-title">{question.title}</h2>
        </div>
        <span className="intake-progress-label">{step + 1} / {intakeQuestions.length}</span>
      </div>
      <div className="intake-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className="intake-prompt">{question.prompt}</p>
      {question.hint ? <p className="intake-hint">{question.hint}</p> : null}
      <div
        className="intake-options"
        role="group"
        aria-label={`${question.number} ${question.title}`}
      >
        {question.options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              className="intake-option"
              data-active={isSelected}
              data-selection={question.selection}
              type="button"
              aria-pressed={isSelected}
              key={option.value}
              onClick={() => toggleAnswer(option)}
            >
              <span className="intake-check" aria-hidden="true">
                {isSelected ? "✓" : ""}
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      {question.id === "call_me" && selected.includes("custom") ? (
        <label className="intake-custom-name" htmlFor="custom-call-name">
          <span>呼んでほしい呼び方</span>
          <input
            id="custom-call-name"
            className="input"
            maxLength={30}
            placeholder="例：〇〇さん（本名でなくて構いません）"
            value={customCallName}
            onChange={(event) => setCustomCallName(event.target.value)}
          />
        </label>
      ) : null}
      <div className="intake-navigation">
        <button
          className="intake-back"
          type="button"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
        >
          ← 戻る
        </button>
        <span>回答せずに進んでも大丈夫です</span>
        <button
          className="intake-forward"
          type="button"
          onClick={() => {
            if (step === intakeQuestions.length - 1) {
              finishQuestionnaire();
            } else {
              setStep((current) => current + 1);
            }
          }}
        >
          {step === intakeQuestions.length - 1 ? "回答を確認" : "次へ"} →
        </button>
      </div>
    </section>
  );
}

function formatYen(value: number) {
  return "¥" + value.toLocaleString("ja-JP");
}

function formatDistance(distanceKm: number | null) {
  if (distanceKm === null) return "距離未確認";
  if (distanceKm < 1) return `約${Math.max(10, Math.round(distanceKm * 1_000))}m`;
  return `約${distanceKm.toFixed(1)}km`;
}

function gradeLabel(grade: Grade) {
  return gradeOptions.find((option) => option.value === grade)?.label ?? grade;
}

function timeLabel(time: TimeSlot) {
  return timeOptions.find((option) => option.value === time)?.label ?? time;
}

function ReviewCandidateCard({ resource }: { resource: ReviewResource }) {
  return (
    <article className="candidate-card review-card" key={resource.id}>
      <div className="candidate-topline">
        <span
          className={
            resource.category === "public"
              ? "category-badge public"
              : "category-badge private"
          }
        >
          {resource.category === "public" ? "公営の情報" : "民間の情報"}
        </span>
        <span className="status-badge">
          {resource.data_status === "manually_verified"
            ? "公式確認済み"
            : resource.data_status === "ai_extracted_unverified"
              ? "AI抽出情報"
              : "要確認データ"}
        </span>
        {resource.distance_km !== null ? (
          <span className="distance-badge">{formatDistance(resource.distance_km)}</span>
        ) : null}
      </div>
      <div className="candidate-title-row">
        <h3>{resource.name}</h3>
        {resource.can_pickup !== null ? (
          <span className="candidate-type">
            {resource.can_pickup ? "送迎あり" : "送迎なし"}
          </span>
        ) : null}
      </div>
      <p className="candidate-note">
        入力条件との一致が確認できた情報を含む比較候補です。
      </p>

      <ul className="reason-list" aria-label="入力条件と一致する点">
        {resource.review_reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      {resource.address ? <p className="candidate-note">所在地：{resource.address}</p> : null}

      {resource.notes.length > 0 ? (
        <ul className="verify-list" aria-label="利用前に確認する内容">
          {resource.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          <li>料金、空き状況、利用条件は初回連絡時に確認してください。</li>
        </ul>
      ) : null}

      <div className="source-row">
        <div className="source-meta">
          <span>出典：{resource.source_label} · {resource.verified_at}</span>
          <span>登録済みURLから抽出した情報</span>
        </div>
        <a
          className="source-link"
          href={resource.source_url}
          target="_blank"
          rel="noreferrer"
        >
          出典を見る ↗
        </a>
      </div>
    </article>
  );
}

export default function ConsultationApp() {
  const [naturalText, setNaturalText] = useState("");
  const [conditions, setConditions] =
    useState<ConsultationConditions>(initialConditions);
  const [results, setResults] = useState<FilterResult | null>(null);
  const [error, setError] = useState("");
  const [parseNotice, setParseNotice] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [supportFocus, setSupportFocus] = useState<SupportFocus>("find_support");

  function applySupportFocus(focus: SupportFocus) {
    const option = supportFocusOptions.find((item) => item.id === focus);
    if (!option) return;
    setSupportFocus(focus);
    setConditions((current) => ({
      ...current,
      priority_need: option.priorityNeed,
    }));
    setResults(null);
  }

  async function handleIntakeConsult(consultationAnswers: ConsultationAnswer[]) {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      CONSULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch("/api/consult", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consultation_answers: consultationAnswers,
          current_conditions: {
            municipality: conditions.municipality,
            grade: conditions.grade,
            household_status: conditions.household_status,
            preferred_times: conditions.preferred_times,
            can_pickup: conditions.can_pickup,
            monthly_budget: conditions.monthly_budget,
            priority_need: conditions.priority_need,
          },
        }),
        signal: controller.signal,
      });
      const responseBody: unknown = await response.json().catch(() => null);
      const parsedResponse = ConsultApiResponseSchema.safeParse(responseBody);
      if (!parsedResponse.success) {
        throw new Error("AIから確認できる形式の応答を取得できませんでした。");
      }
      const data = parsedResponse.data;
      if (!data.ok) throw new Error(data.message);
      if (Object.keys(data.conditions).length > 0) {
        setConditions((current) => ({ ...current, ...data.conditions }));
        setResults(null);
      }
      return data.assistant_message;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("AIの応答に時間がかかっています。もう一度お試しください。");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function handleParse() {
    if (!naturalText.trim()) {
      setParseNotice("");
      setError("補足内容を入力してから反映してください。");
      return;
    }

    setIsParsing(true);
    setError("");

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      CONSULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch("/api/consult", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: naturalText }),
        signal: controller.signal,
      });
      const responseBody: unknown = await response.json().catch(() => null);
      const parsedResponse = ConsultApiResponseSchema.safeParse(responseBody);

      if (response.ok && parsedResponse.success) {
        const data = parsedResponse.data;
        if (data.ok && Object.keys(data.conditions).length > 0) {
          setConditions((current) => ({
            ...current,
            ...data.conditions,
          }));
          setResults(null);
          setParseNotice(
            `${data.assistant_message} 内容を確認してから検索してください。`,
          );
          return;
        }
      }
    } catch {
      // The deterministic local parser below keeps the prototype usable offline.
    } finally {
      window.clearTimeout(timeout);
      setIsParsing(false);
    }

    const parsed = parseNaturalLanguage(naturalText);
    if (Object.keys(parsed).length === 0) {
      setParseNotice("");
      setError("条件を読み取れませんでした。下の固定フォームに入力してください。");
      return;
    }

    setConditions((current) => ({ ...current, ...parsed }));
    setResults(null);
    setError("");
    setParseNotice(
      "AI解析を利用できなかったため、簡易解析で反映しました。内容を確認してから検索してください。",
    );
  }

  async function handleSearch() {
    const validated = ConsultationConditionsSchema.safeParse(conditions);
    if (!validated.success) {
      setResults(null);
      setError("地域、学年、時間帯、世帯状況、月の予算を入力してから検索してください。");
      return;
    }

    setIsSearching(true);
    setError("");
    setParseNotice("");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conditions: validated.data }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      const parsedResponse = FilterResultSchema.safeParse(responseBody);

      if (!response.ok || !parsedResponse.success) {
        const errorBody = SearchApiErrorSchema.safeParse(responseBody);
        throw new Error(
          errorBody.success
            ? errorBody.data.message
            : "登録済みURLから情報を取得・整理できませんでした。URLとMicrosoft Foundryの設定を確認してください。",
        );
      }

      setResults(parsedResponse.data);
    } catch (error) {
      setResults(null);
      setError(
        error instanceof Error
          ? error.message
          : "登録済みURLから情報を取得・整理できませんでした。URLとMicrosoft Foundryの設定を確認してください。",
      );
    } finally {
      setIsSearching(false);
    }
  }

  function toggleTime(time: TimeSlot) {
    setConditions((current) => {
      const selected = current.preferred_times.includes(time)
        ? current.preferred_times.filter((item) => item !== time)
        : [...current.preferred_times, time];
      return { ...current, preferred_times: selected };
    });
    setResults(null);
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="よりそいナビのトップ">
          <span className="brand-mark" aria-hidden="true">
            +
          </span>
          <span className="brand-copy">
            <span className="brand-name">よりそいナビ</span>
            <span className="brand-caption">支援選択サポート</span>
          </span>
        </a>
        <span className="header-note">相談内容は保存されません</span>
      </header>

      <main id="top">
        <section className="hero">
          <p className="eyebrow">不登校支援 · 葛飾区 実証版</p>
          <h1>
            まずは現実的な条件を整理して、
            <br />
            いっしょに<em>選択肢を見てみる。</em>
          </h1>
          <p className="hero-lead">
            まずは基本条件だけで検索できます。必要に応じて、下の補足欄に自由に入力した内容を条件へ反映できます。診断や唯一の答えを出すものではありません。
          </p>
          <span className="demo-badge">登録済みURLの情報をAIで整理 · 内容は要確認</span>
        </section>

        <IntakeQuestionnaire
          onSupportFocusChange={applySupportFocus}
          onConsult={handleIntakeConsult}
        />

        <section
          className="workspace"
          id="search-conditions"
          aria-label="支援選択肢の検索ツール"
        >
          <form
            className="panel form-panel"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSearch();
            }}
          >
            <div className="panel-heading">
              <div>
                <h2>条件を設定する</h2>
                <p>入力した条件だけを使って、利用できそうな支援を検索します。</p>
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">基本条件を確認</span>
              <div className="condition-grid">
                <label className="field-group" htmlFor="municipality">
                  <span className="field-label">居住地域</span>
                  <select
                    id="municipality"
                    className="select"
                    value={conditions.municipality}
                    onChange={(event) => {
                      setConditions((current) => ({
                        ...current,
                        municipality: event.target.value,
                      }));
                      setResults(null);
                    }}
                  >
                    <option value="葛飾区">葛飾区（デモ対象）</option>
                  </select>
                </label>

                <label className="field-group" htmlFor="grade">
                  <span className="field-label">子どもの学年</span>
                  <select
                    id="grade"
                    className="select"
                    value={conditions.grade}
                    onChange={(event) => {
                      setConditions((current) => ({
                        ...current,
                        grade: event.target.value as Grade,
                      }));
                      setResults(null);
                    }}
                  >
                    {gradeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-group" htmlFor="postal-code">
                  <span className="field-label">郵便番号（任意）</span>
                  <input
                    id="postal-code"
                    className="input"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={8}
                    placeholder="例：125-0061"
                    value={conditions.postal_code}
                    onChange={(event) => {
                      const postalCode = event.target.value
                        .replace(/[^\d-]/g, "")
                        .slice(0, 8);
                      setConditions((current) => ({
                        ...current,
                        postal_code: postalCode,
                      }));
                      setResults(null);
                    }}
                  />
                  <span className="field-hint">施設の公開住所から概算距離を計算します。</span>
                </label>
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">ご予算・世帯状況</span>
              <div className="choice-row">
                {householdOptions.map((option) => (
                  <button
                    className="choice-button"
                    data-active={conditions.household_status === option.value}
                    key={option.value}
                    type="button"
                    aria-pressed={conditions.household_status === option.value}
                    onClick={() => {
                      setConditions((current) => ({
                        ...current,
                        household_status: option.value,
                      }));
                      setResults(null);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">利用できる曜日・時間帯</span>
              <div className="choice-row">
                {timeOptions.map((option) => (
                  <button
                    className="choice-button"
                    data-active={conditions.preferred_times.includes(option.value)}
                    key={option.value}
                    type="button"
                    aria-pressed={conditions.preferred_times.includes(option.value)}
                    onClick={() => toggleTime(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">送迎の可否</span>
              <div className="choice-row">
                {pickupOptions.map((option) => (
                  <button
                    className="choice-button"
                    data-active={conditions.can_pickup === option.value}
                    key={option.value}
                    type="button"
                    aria-pressed={conditions.can_pickup === option.value}
                    onClick={() => {
                      setConditions((current) => ({
                        ...current,
                        can_pickup: option.value,
                      }));
                      setResults(null);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">いま一番求めていること</span>
              <span className="field-hint">
                選んだ内容を、近い支援カテゴリへ整理して検索します。
              </span>
              <div className="need-choice-grid">
                {supportFocusOptions.map((option) => (
                  <button
                    className="need-choice-button"
                    data-active={supportFocus === option.id}
                    key={option.id}
                    type="button"
                    aria-pressed={supportFocus === option.id}
                    onClick={() => applySupportFocus(option.id)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="condition-grid">
              <label className="field-group" htmlFor="monthly-budget">
                <span className="field-label">月に負担できる金額</span>
                <div className="currency-input">
                  <input
                    id="monthly-budget"
                    className="input"
                    type="number"
                    min="0"
                    step="1000"
                    value={conditions.monthly_budget}
                    onChange={(event) => {
                      setConditions((current) => ({
                        ...current,
                        monthly_budget: Number(event.target.value),
                      }));
                      setResults(null);
                    }}
                  />
                  <span>円</span>
                </div>
              </label>

              <label className="field-group" htmlFor="annual-income">
                <span className="field-label">年収（開発デモ計算・任意）</span>
                <div className="currency-input">
                  <input
                    id="annual-income"
                    className="input"
                    type="number"
                    min="0"
                    step="10000"
                    value={conditions.annual_income}
                    onChange={(event) => {
                      setConditions((current) => ({
                        ...current,
                        annual_income: Number(event.target.value),
                      }));
                      setResults(null);
                    }}
                  />
                  <span>円</span>
                </div>
                <span className="field-hint">
                  実在制度の資格判定には使用しません。未入力は0円のままで検索できます。
                </span>
              </label>
            </div>

            <button className="primary-button" type="submit" disabled={isSearching}>
              {isSearching ? "登録済みURLを確認中…" : "利用できそうな支援を探す"}{" "}
              <span aria-hidden="true">→</span>
            </button>

            <div className="form-disclaimer">
              入力内容はこのページ内のデモ検索にのみ使用し、氏名、学校名、診断情報は求めません。
            </div>
            {error ? <p className="error-message">{error}</p> : null}

            <div className="supplement-section">
              <div className="supplement-heading">
                <div>
                  <span className="field-label">補足を入力する（任意）</span>
                  <p className="field-hint">
                    ほかに伝えておきたいことがある場合だけ使えます。AI解析を利用できない場合は簡易解析へ切り替わります。
                  </p>
                </div>
                <span className="chat-mark" aria-hidden="true">＋</span>
              </div>
              <label className="sr-only" htmlFor="natural-text">
                補足内容
              </label>
              <textarea
                id="natural-text"
                className="textarea"
                value={naturalText}
                onChange={(event) => setNaturalText(event.target.value)}
                placeholder="例：葛飾区に住んでいて、中学2年生の子どもがいます。平日午後に利用できて…"
              />
              <div className="parse-row">
                <span className="parse-hint">
                  基本条件だけで検索できます。補足を反映した後は、上の検索ボタンをもう一度押してください。
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={isParsing}
                  onClick={handleParse}
                >
                  {isParsing ? "読み取り中…" : "補足を条件に反映"}
                </button>
              </div>
              {parseNotice ? <p className="field-hint">{parseNotice}</p> : null}
            </div>
          </form>

          <section className="panel results-panel" aria-live="polite">
            <div className="results-heading">
              <div>
                <h2>選択肢を見てみる</h2>
                <p>複数の候補を見比べて、次に確認する先を考えましょう。「AIの第1位」はありません。</p>
              </div>
              <div className="result-count" aria-label="候補の数">
                <strong>
                  {results
                    ? results.matches.length + results.review_candidates.length
                    : "—"}
                </strong>
                <span>候補</span>
              </div>
            </div>

            {!results ? (
              <div className="empty-state">
                <div>
                  <div className="empty-illustration" aria-hidden="true">
                    ◌
                  </div>
                  <h3>条件から始めましょう</h3>
                  <p>
                    右側に複数の候補を表示し、費用、残った理由、もう一度確認したい内容をそれぞれ説明します。
                  </p>
                </div>
              </div>
            ) : results.matches.length === 0 && results.review_candidates.length === 0 ? (
              <div className="empty-state">
                <div>
                  <div className="empty-illustration" aria-hidden="true">
                    …
                  </div>
                  <h3>すべての条件に合う候補はありませんでした</h3>
                  <p>
                    利用時間帯、送迎条件、月の予算を少し広げてみてください。現在 {results.excluded_count} 件の情報を条件外として除外しました。
                  </p>
                </div>
              </div>
            ) : (
              <>
                {results.matches.length > 0 ? (
                  <>
                    <div className="results-summary">
                      現在の入力：<strong>{conditions.municipality}</strong> ·{" "}
                      <strong>{gradeLabel(conditions.grade)}</strong> ·{" "}
                      <strong>
                        {householdOptions.find(
                          (option) => option.value === conditions.household_status,
                        )?.label}
                      </strong>{" "}·{" "}
                      <strong>{conditions.preferred_times.map(timeLabel).join(" / ")}</strong>
                      。<strong>{results.matches.length}件</strong>の候補を残しました。
                      {conditions.postal_code ? " 郵便番号から近い順に表示しています。" : null}
                    </div>

                    <div className="candidate-list">
                      {results.matches.map((resource) => (
                        <article className="candidate-card" key={resource.id}>
                      <div className="candidate-topline">
                        <span
                          className={
                            resource.category === "public"
                              ? "category-badge public"
                              : "category-badge private"
                          }
                        >
                          {resource.category === "public" ? "公営の選択肢" : "民間の選択肢"}
                        </span>
                        <span className="status-badge">
                          {resource.data_status === "manually_verified"
                            ? "公式確認済み"
                            : resource.data_status === "ai_extracted_unverified"
                              ? "AI抽出情報"
                              : "要確認データ"}
                        </span>
                        {resource.distance_km !== null ? (
                          <span className="distance-badge">{formatDistance(resource.distance_km)}</span>
                        ) : null}
                      </div>
                      <div className="candidate-title-row">
                        <h3>{resource.name}</h3>
                        {resource.can_pickup !== null ? (
                          <span className="candidate-type">
                            {resource.can_pickup ? "送迎あり" : "送迎なし"}
                          </span>
                        ) : null}
                      </div>
                      <p className="candidate-note">
                        現在の入力条件で残った候補です。必ず利用できることを示すものではありません。
                      </p>

                      <ul className="reason-list" aria-label="候補として残った理由">
                        {resource.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>

                      <div className="cost-box">
                        <div className="cost-row">
                          <span>登録月額</span>
                          <strong>{formatYen(resource.cost.monthly_fee)}</strong>
                        </div>
                        <div className="cost-row">
                          <span>開発デモ月額補助</span>
                          <strong>
                            −{formatYen(resource.cost.monthly_subsidy)}
                          </strong>
                        </div>
                        <div className="cost-row total">
                          <span>見込み月額自己負担</span>
                          <strong>
                            {formatYen(resource.cost.estimated_self_pay)}
                          </strong>
                        </div>
                        <p className="prototype-tag">
                          開発デモ用の仮計算式（実際の制度ではありません）：年収 × 0.2 ÷ 12
                        </p>
                      </div>

                      <ul className="verify-list" aria-label="利用前に確認する内容">
                        {resource.verification_points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>

                      <div className="source-row">
                        <div className="source-meta">
                          <span>出典：{resource.source_label} · {resource.verified_at}</span>
                          <span>登録済みURLから抽出した候補のみ表示</span>
                        </div>
                        <a
                          className="source-link"
                          href={resource.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          出典を見る ↗
                        </a>
                      </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : null}

                {results.review_candidates.length > 0 ? (
                  <section className="review-section" aria-label="比較候補">
                    <div className="results-summary review-summary">
                      入力条件との一致が確認できた比較候補が{" "}
                      <strong>{results.review_candidates.length}件</strong>
                      あります。料金などの未確認項目は、リンク先または窓口で確認してください。
                    </div>
                    <div className="candidate-list">
                      {results.review_candidates.map((resource) => (
                        <ReviewCandidateCard key={resource.id} resource={resource} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            )}

            <p className="disclaimer">
              これは機能開発デモです。医療・心理・教育上の診断や復学予測は行いません。費用と資格は各機関・自治体の最新情報を確認してください。
            </p>
          </section>
        </section>
      </main>

      <footer className="site-footer">
        よりそいナビ 葛飾区 実証版 · 支援選択ツール · 長期的な個人記録は保存しません
      </footer>
    </div>
  );
}
