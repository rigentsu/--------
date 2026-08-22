import type { SupportResource } from "../../shared/types";

function informationScore(resource: SupportResource) {
  return (
    (resource.data_status === "manually_verified" ? 100 : 0) +
    (resource.address ? 20 : 0) +
    (resource.latitude !== null && resource.longitude !== null ? 10 : 0) +
    resource.eligible_grades.length +
    resource.eligible_household_statuses.length +
    resource.opening_times.length +
    resource.supported_needs.length +
    (resource.monthly_fee !== null ? 2 : 0) +
    (resource.can_pickup !== null ? 1 : 0)
  );
}

export function selectUniqueResources(
  resources: SupportResource[],
  duplicateGroups: string[][],
) {
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const parent = new Map(resources.map((resource) => [resource.id, resource.id]));

  function find(id: string): string {
    const current = parent.get(id);
    if (!current || current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  }

  function union(left: string, right: string) {
    if (!byId.has(left) || !byId.has(right)) return;
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  }

  for (const group of duplicateGroups) {
    const knownIds = [...new Set(group)].filter((id) => byId.has(id));
    for (let index = 1; index < knownIds.length; index += 1) {
      union(knownIds[0], knownIds[index]);
    }
  }

  const bestByGroup = new Map<string, SupportResource>();
  for (const resource of resources) {
    const root = find(resource.id);
    const current = bestByGroup.get(root);
    if (!current || informationScore(resource) > informationScore(current)) {
      bestByGroup.set(root, resource);
    }
  }
  const selectedIds = new Set(
    [...bestByGroup.values()].map((resource) => resource.id),
  );
  return resources.filter((resource) => selectedIds.has(resource.id));
}
