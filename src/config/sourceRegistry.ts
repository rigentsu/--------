export const APPROVED_SOURCES = [
  {
    id: "miraitizu",
    origin: "https://miraitizu.com",
    allowed_paths: ["/parent-meeting/", "/freeschool/"],
    label: "未来地図",
  },
] as const;

export function isApprovedSourceUrl(sourceId: string, sourceUrl: string) {
  const source = APPROVED_SOURCES.find((item) => item.id === sourceId);
  if (!source) return false;

  try {
    const url = new URL(sourceUrl);
    return (
      url.origin === source.origin &&
      source.allowed_paths.some((path) => url.pathname.startsWith(path))
    );
  } catch {
    return false;
  }
}
