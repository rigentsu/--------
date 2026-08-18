export type ApprovedSourcePage = {
  id: string;
  source_id: string;
  url: string;
  label: string;
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
  },
  {
    id: "futoukou-shien",
    source_id: "katsushikaku",
    url: "https://www.city.katsushika.lg.jp/kosodate/1000057/1002475/1042946/index.html",
    label: "不登校支援（葛飾区）",
  },
];

export function isApprovedSourceUrl(sourceId: string, sourceUrl: string) {
  return APPROVED_SOURCE_PAGES.some(
    (page) => page.source_id === sourceId && page.url === sourceUrl,
  );
}
