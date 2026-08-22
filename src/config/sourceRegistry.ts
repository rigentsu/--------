export type ApprovedSourcePage = {
  id: string;
  source_id: string;
  url: string;
  label: string;
  search_enabled?: boolean;
};

/**
 * Add institution or portal URLs here. This is the only URL allowlist used by
 * source ingestion; browser clients cannot submit arbitrary URLs.
 */
export const APPROVED_SOURCE_PAGES: ApprovedSourcePage[] = [
  {
    id: "miraitizu-parent-meeting",
    source_id: "miraitizu",
    url: "https://miraitizu.com/parent-meeting/",
    label: "未来地図（保護者向け情報）",
    search_enabled: false,
  },
  {
    id: "futoukou-shien",
    source_id: "katsushikaku",
    url: "https://www.city.katsushika.lg.jp/kosodate/1000057/1002475/1042946/index.html",
    label: "不登校支援（葛飾区）",
  },
  {
    id: "katsushika-education-center",
    source_id: "katsushikaku",
    url: "https://www.city.katsushika.lg.jp/institution/1030224/1000099/1034183.html",
    label: "葛飾区立総合教育センター・ふれあいスクール明石",
    search_enabled: false,
  },
  {
    id: "katsushika-school-refusal-consultation",
    source_id: "katsushikaku",
    url: "https://www.city.katsushika.lg.jp/kurashi/1000061/1003784/1003817.html",
    label: "総合教育センター 不登校などの教育相談",
    search_enabled: false,
  },
];

export function isApprovedSourceUrl(sourceId: string, sourceUrl: string) {
  return APPROVED_SOURCE_PAGES.some(
    (page) => page.source_id === sourceId && page.url === sourceUrl,
  );
}
