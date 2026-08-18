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
  { value: "elementary_1", label: "小学 1 年" },
  { value: "elementary_2", label: "小学 2 年" },
  { value: "elementary_3", label: "小学 3 年" },
  { value: "elementary_4", label: "小学 4 年" },
  { value: "elementary_5", label: "小学 5 年" },
  { value: "elementary_6", label: "小学 6 年" },
  { value: "junior_high_1", label: "中学 1 年" },
  { value: "junior_high_2", label: "中学 2 年" },
  { value: "junior_high_3", label: "中学 3 年" },
];

const timeOptions: Array<{ value: TimeSlot; label: string }> = [
  { value: "weekday_afternoon", label: "平日下午" },
  { value: "weekday_evening", label: "平日晚间" },
  { value: "saturday_morning", label: "周末上午" },
];

const pickupOptions: Array<{ value: PickupPreference; label: string }> = [
  { value: "yes", label: "可以送迎" },
  { value: "no", label: "不能送迎" },
  { value: "unknown", label: "还不确定" },
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
  const [naturalText, setNaturalText] = useState(
    "我住在新宿区，孩子是初二，平日下午可以利用，不能送迎，每月最多能负担 3 万元。",
  );
  const [conditions, setConditions] =
    useState<ConsultationConditions>(initialConditions);
  const [results, setResults] = useState<FilterResult | null>(null);
  const [error, setError] = useState("");
  const [parseNotice, setParseNotice] = useState("");

  function handleParse() {
    const parsed = parseNaturalLanguage(naturalText);
    if (Object.keys(parsed).length === 0) {
      setParseNotice("");
      setError("暂时没有识别出条件，请直接使用下面的固定表单填写。");
      return;
    }

    setConditions((current) => ({ ...current, ...parsed }));
    setResults(null);
    setError("");
    setParseNotice("已把可识别的信息带入下方表单，请确认后开始筛选。");
  }

  function handleSearch() {
    const validated = ConsultationConditionsSchema.safeParse(conditions);
    if (!validated.success) {
      setResults(null);
      setError("请补齐地区、学龄、时段和月预算后再开始筛选。");
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
        <a className="brand" href="#top" aria-label="よりそいナビ首页">
          <span className="brand-mark" aria-hidden="true">
            +
          </span>
          <span className="brand-copy">
            <span className="brand-name">よりそいナビ</span>
            <span className="brand-caption">SUPPORT CHOICE TOOL</span>
          </span>
        </a>
        <span className="header-note">不保存完整咨询内容</span>
      </header>

      <main id="top">
        <section className="hero">
          <p className="eyebrow">不登校支援 · prototype v1</p>
          <h1>
            先把现实条件理清，
            <br />
            再一起看看<em>有哪些选择。</em>
          </h1>
          <p className="hero-lead">
            用普通语言说说现在的情况，再从限定的演示数据中并列比较可能的支援选项。这里不做诊断，也不替家长作出唯一决定。
          </p>
          <span className="demo-badge">开发演示 · 当前仅覆盖新宿区演示数据</span>
        </section>

        <section className="workspace" aria-label="支援选项筛选工具">
          <form
            className="panel form-panel"
            onSubmit={(event) => {
              event.preventDefault();
              handleSearch();
            }}
          >
            <div className="panel-heading">
              <div>
                <h2>说说你的情况</h2>
                <p>先自由输入，也可以直接填写条件。</p>
              </div>
              <span className="step-number">01</span>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="natural-text">
                用普通语言描述
              </label>
              <textarea
                id="natural-text"
                className="textarea"
                value={naturalText}
                onChange={(event) => setNaturalText(event.target.value)}
                placeholder="例如：我住在新宿区，孩子初二，平日下午可以利用……"
              />
              <div className="parse-row">
                <span className="parse-hint">
                  第一版使用本地演示解析；AI 不可用时仍可继续使用固定表单。
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={handleParse}
                >
                  整理到表单
                </button>
              </div>
              {parseNotice ? <p className="field-hint">{parseNotice}</p> : null}
            </div>

            <div className="field-group">
              <span className="field-label">确认五项条件</span>
              <div className="condition-grid">
                <label className="field-group" htmlFor="municipality">
                  <span className="field-label">居住地区</span>
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
                    <option value="新宿区">新宿区（演示范围）</option>
                  </select>
                </label>

                <label className="field-group" htmlFor="grade">
                  <span className="field-label">孩子的学年</span>
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
              <span className="field-label">可以利用的日期或时间</span>
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
              <span className="field-label">是否能够送迎</span>
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
                <span className="field-label">每月可承担金额</span>
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
                <span className="field-label">年收入（可选）</span>
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
              查找可能的支援选项 <span aria-hidden="true">→</span>
            </button>

            <div className="form-disclaimer">
              输入内容只在当前页面内用于演示筛选，不要求姓名、学校名称或诊断信息。
            </div>
            {error ? <p className="error-message">{error}</p> : null}
          </form>

          <section className="panel results-panel" aria-live="polite">
            <div className="results-heading">
              <div>
                <h2>可能的选择</h2>
                <p>先看并列选项，再决定要向谁确认。没有“AI 第一名”。</p>
              </div>
              <div className="result-count" aria-label="匹配数量">
                <strong>{results?.matches.length ?? "—"}</strong>
                <span>个候选</span>
              </div>
            </div>

            {!results ? (
              <div className="empty-state">
                <div>
                  <div className="empty-illustration" aria-hidden="true">
                    ◌
                  </div>
                  <h3>从你的条件开始</h3>
                  <p>
                    右侧会显示多个可能的选项，并分别说明费用、保留理由和需要再次确认的内容。
                  </p>
                </div>
              </div>
            ) : results.matches.length === 0 ? (
              <div className="empty-state">
                <div>
                  <div className="empty-illustration" aria-hidden="true">
                    …
                  </div>
                  <h3>暂时没有同时符合的条目</h3>
                  <p>
                    可以尝试放宽可利用时段、送迎条件或月预算。当前数据共排除了 {results.excluded_count} 个演示条目。
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="results-summary">
                  根据目前输入：<strong>{conditions.municipality}</strong> ·{" "}
                  <strong>{gradeLabel(conditions.grade)}</strong> ·{" "}
                  <strong>{conditions.preferred_times.map(timeLabel).join(" / ")}</strong>
                  。共保留 <strong>{results.matches.length} 个</strong> 可能选项。
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
                          {resource.category === "public" ? "公营选项" : "民营选项"}
                        </span>
                        <span className="status-badge">演示数据 · 待核实</span>
                      </div>
                      <div className="candidate-title-row">
                        <h3>{resource.name}</h3>
                        <span className="candidate-type">
                          {resource.can_pickup === true
                            ? "可送迎登记"
                            : "送迎未确认"}
                        </span>
                      </div>
                      <p className="candidate-note">
                        这是基于目前输入条件保留下来的可能选项，不代表一定可以利用。
                      </p>

                      <ul className="reason-list" aria-label="保留理由">
                        {resource.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>

                      <div className="cost-box">
                        <div className="cost-row">
                          <span>登记月费</span>
                          <strong>{formatYen(resource.cost.monthly_fee)}</strong>
                        </div>
                        <div className="cost-row">
                          <span>开发演示月度补助</span>
                          <strong>
                            −{formatYen(resource.cost.monthly_subsidy)}
                          </strong>
                        </div>
                        <div className="cost-row total">
                          <span>预计月度自付</span>
                          <strong>
                            {formatYen(resource.cost.estimated_self_pay)}
                          </strong>
                        </div>
                        <p className="prototype-tag">
                          开发演示用假公式（非真实制度）：年收入 × 0.2 ÷ 12
                        </p>
                      </div>

                      <ul className="verify-list" aria-label="需要确认的内容">
                        {resource.verification_points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>

                      <div className="source-row">
                        <div className="source-meta">
                          <span>来源：未来地図 · {resource.verified_at}</span>
                          <span>当前仅展示白名单内的本地演示条目</span>
                        </div>
                        <a
                          className="source-link"
                          href={resource.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          查看来源入口 ↗
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}

            <p className="disclaimer">
              这是功能开发演示，不进行医疗、心理或教育诊断，也不预测复学。费用与资格请以机构和自治体最新说明为准。
            </p>
          </section>
        </section>
      </main>

      <footer className="site-footer">
        よりそいナビ prototype v1 · 支援选择工具 · 当前不保存长期个人档案
      </footer>
    </div>
  );
}
