"use client";

import { useState } from "react";
import { filterSupportResources } from "../src/server/domain/serviceFilter";
import { ConsultationConditionsSchema } from "../src/server/domain/schemas";
import { parseNaturalLanguage } from "../src/server/domain/naturalLanguage";
import type {
  ConsultationConditions,
  FilterResult,
  Grade,
  PickupPreference,
  TimeSlot,
} from "../src/shared/types";

const initialConditions: ConsultationConditions = {
  municipality: "新宿区",
  grade: "junior_high_2",
  preferred_times: ["weekday_afternoon"],
  can_pickup: "unknown",
  monthly_budget: 30000,
  annual_income: 0,
};

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

function formatYen(value: number) {
  return "¥" + value.toLocaleString("ja-JP");
}

function gradeLabel(grade: Grade) {
  return gradeOptions.find((option) => option.value === grade)?.label ?? grade;
}

function timeLabel(time: TimeSlot) {
  return timeOptions.find((option) => option.value === time)?.label ?? time;
}

export default function ConsultationApp() {
  const [naturalText, setNaturalText] = useState("");
  const [conditions, setConditions] =
    useState<ConsultationConditions>(initialConditions);
  const [results, setResults] = useState<FilterResult | null>(null);
  const [error, setError] = useState("");
  const [parseNotice, setParseNotice] = useState("");

  function handleParse() {
    const parsed = parseNaturalLanguage(naturalText);
    if (Object.keys(parsed).length === 0) {
      setParseNotice("");
      setError("条件を読み取れませんでした。下の固定フォームに入力してください。");
      return;
    }

    setConditions((current) => ({ ...current, ...parsed }));
    setResults(null);
    setError("");
    setParseNotice("読み取れた情報を下のフォームに反映しました。内容を確認してから検索してください。");
  }

  function handleSearch() {
    const validated = ConsultationConditionsSchema.safeParse(conditions);
    if (!validated.success) {
      setResults(null);
      setError("地域、学年、時間帯、月の予算を入力してから検索してください。");
      return;
    }

    setError("");
    setParseNotice("");
    setResults(filterSupportResources(validated.data));
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
          <p className="eyebrow">不登校支援 · 試作 v1</p>
          <h1>
            まずは現実的な条件を整理して、
            <br />
            いっしょに<em>選択肢を見てみる。</em>
          </h1>
          <p className="hero-lead">
            まずは5つの基本条件だけで検索できます。必要に応じて、下の補足欄に自由に入力した内容を条件へ反映できます。診断や唯一の答えを出すものではありません。
          </p>
          <span className="demo-badge">開発デモ · 現在は新宿区のデモデータのみ</span>
        </section>

        <section className="workspace" aria-label="支援選択肢の検索ツール">
          <form
            className="panel form-panel"
            onSubmit={(event) => {
              event.preventDefault();
              handleSearch();
            }}
          >
            <div className="panel-heading">
              <div>
                <h2>条件を設定する</h2>
                <p>入力した5つの条件だけを使って、利用できそうな支援を検索します。</p>
              </div>
              <span className="step-number">01</span>
            </div>

            <div className="field-group">
              <span className="field-label">5つの条件を確認</span>
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
                    <option value="新宿区">新宿区（デモ対象）</option>
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
                <span className="field-label">年収（任意）</span>
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
              </label>
            </div>

            <button className="primary-button" type="submit">
              利用できそうな支援を探す <span aria-hidden="true">→</span>
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
                    ほかに伝えておきたいことがある場合だけ使えます。ここに入力した内容は、ボタンを押すまで検索条件に入りません。
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
                placeholder="例：新宿区に住んでいて、中学2年生の子どもがいます。平日午後に利用できて…"
              />
              <div className="parse-row">
                <span className="parse-hint">
                  基本条件だけで検索できます。補足を反映した後は、上の検索ボタンをもう一度押してください。
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={handleParse}
                >
                  補足を条件に反映
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
                <strong>{results?.matches.length ?? "—"}</strong>
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
            ) : results.matches.length === 0 ? (
              <div className="empty-state">
                <div>
                  <div className="empty-illustration" aria-hidden="true">
                    …
                  </div>
                  <h3>すべての条件に合う候補はありませんでした</h3>
                  <p>
                    利用時間帯、送迎条件、月の予算を少し広げてみてください。現在 {results.excluded_count} 件のデモ項目を除外しました。
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="results-summary">
                  現在の入力：<strong>{conditions.municipality}</strong> ·{" "}
                  <strong>{gradeLabel(conditions.grade)}</strong> ·{" "}
                  <strong>{conditions.preferred_times.map(timeLabel).join(" / ")}</strong>
                  。<strong>{results.matches.length}件</strong>の候補を残しました。
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
                        <span className="status-badge">デモデータ · 要確認</span>
                      </div>
                      <div className="candidate-title-row">
                        <h3>{resource.name}</h3>
                        <span className="candidate-type">
                          {resource.can_pickup === true
                            ? "送迎ありの登録"
                            : "送迎は未確認"}
                        </span>
                      </div>
                      <p className="candidate-note">
                        現在の入力条件で残った候補です。必ず利用できることを示すものではありません。
                      </p>

                      <ul className="reason-list" aria-label="保留理由">
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

                      <ul className="verify-list" aria-label="確認が必要な内容">
                        {resource.verification_points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>

                      <div className="source-row">
                        <div className="source-meta">
                          <span>出典：未来地図 · {resource.verified_at}</span>
                          <span>現在はホワイトリスト内のローカルデモ項目のみ表示</span>
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
            )}

            <p className="disclaimer">
              これは機能開発デモです。医療・心理・教育上の診断や復学予測は行いません。費用と資格は各機関・自治体の最新情報を確認してください。
            </p>
          </section>
        </section>
      </main>

      <footer className="site-footer">
        よりそいナビ 試作 v1 · 支援選択ツール · 長期的な個人記録は保存しません
      </footer>
    </div>
  );
}
