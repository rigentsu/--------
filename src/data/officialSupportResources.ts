import type { SupportResource } from "../shared/types";

/**
 * Minimum reliable local results backed by official Katsushika pages.
 * Unknown facts deliberately remain null and are shown as items to confirm.
 */
export const OFFICIAL_SUPPORT_RESOURCES: SupportResource[] = [
  {
    id: "official-katsushika-fureai-school-akashi",
    name: "ふれあいスクール明石",
    source_id: "katsushikaku",
    source_label: "葛飾区立総合教育センター・ふれあいスクール明石",
    category: "public",
    municipality: "葛飾区",
    address: "東京都葛飾区鎌倉2-12-1",
    latitude: null,
    longitude: null,
    eligible_grades: [
      "elementary_1",
      "elementary_2",
      "elementary_3",
      "elementary_4",
      "elementary_5",
      "elementary_6",
      "junior_high_1",
      "junior_high_2",
      "junior_high_3",
    ],
    eligible_household_statuses: ["all"],
    opening_times: ["weekday_afternoon"],
    can_pickup: null,
    monthly_fee: null,
    subsidy_eligible: false,
    supported_needs: ["stage2_places"],
    source_url:
      "https://www.city.katsushika.lg.jp/institution/1030224/1000099/1034183.html",
    verified_at: "葛飾区公式ページ確認：2026-08-19",
    notes: [
      "葛飾区内在住の小学1年生から中学3年生を対象とする教育支援センターです。",
      "利用前に見学・相談の予約が必要です。料金、空き状況、詳しい利用時間は窓口へ確認してください。",
    ],
    data_status: "manually_verified",
  },
  {
    id: "official-katsushika-education-consultation",
    name: "総合教育センター 不登校などの教育相談",
    source_id: "katsushikaku",
    source_label: "総合教育センター 不登校などの教育相談",
    category: "public",
    municipality: "葛飾区",
    address: "東京都葛飾区鎌倉2-12-1",
    latitude: null,
    longitude: null,
    eligible_grades: [
      "elementary_1",
      "elementary_2",
      "elementary_3",
      "elementary_4",
      "elementary_5",
      "elementary_6",
      "junior_high_1",
      "junior_high_2",
      "junior_high_3",
    ],
    eligible_household_statuses: ["all"],
    opening_times: ["weekday_afternoon"],
    can_pickup: null,
    monthly_fee: null,
    subsidy_eligible: false,
    supported_needs: ["stage1_anonymous", "stage2_places"],
    source_url:
      "https://www.city.katsushika.lg.jp/kurashi/1000061/1003784/1003817.html",
    verified_at: "葛飾区公式ページ確認：2026-08-19",
    notes: [
      "月曜日から金曜日の午前9時から午後5時まで、電話相談と予約制の来所相談を受け付けています。",
      "利用方法と最新の受付状況は総合教育センターへ確認してください。",
    ],
    data_status: "manually_verified",
  },
];
