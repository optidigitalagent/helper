import { NormalizedItem } from '../types';
import { makeId }          from '../utils/hash';

// ─── Clustering ───────────────────────────────────────────────────────────────
// Groups items that cover the same story from multiple sources.
// Goal: one cluster = one unit of attention in the brief.
// Primary item = highest source weight. Others = confirmation signals.
//
// Algorithm: title word overlap.
// Two items share a cluster if their "key word" sets overlap ≥ THRESHOLD.

const THRESHOLD    = 0.30;   // 30% key-word overlap → same story
const MIN_WORD_LEN = 4;      // ignore short words (the, a, is, etc.)

// Words that are common in titles but carry no story signal
const STOP_WORDS = new Set([
  'this','that','with','from','have','will','your','what','when','where',
  'which','they','their','about','into','more','than','some','just',
  'been','also','were','there','been','could','would','should','after',
  'before','during','under','over','between','through','within','without',
]);

function keyWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= MIN_WORD_LEN && !STOP_WORDS.has(w))
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.max(a.size, b.size);
}

/**
 * Mutates items in-place: assigns clusterId, confirmationsCount, isPrimary.
 * Source weights are used to pick the primary item per cluster.
 */
export function clusterItems(
  items: NormalizedItem[],
  sourceWeights: Record<string, number>,
): NormalizedItem[] {
  // Precompute key-word sets
  const wordSets = items.map((item) => keyWords(`${item.title} ${item.sourceName ?? ''}`));

  // Union-find to group items
  const parent = items.map((_, i) => i);
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(i: number, j: number) {
    parent[find(i)] = find(j);
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      // Don't cluster items from the same source
      if (items[i].source === items[j].source) continue;
      if (overlap(wordSets[i], wordSets[j]) >= THRESHOLD) {
        union(i, j);
      }
    }
  }

  // Group by root
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(i);
  }

  // Assign cluster metadata
  for (const [, indices] of clusters) {
    const clId = makeId('cluster', indices.map((i) => items[i].id).join(''));

    // Primary = highest source weight
    let primaryIdx = indices[0];
    for (const idx of indices) {
      const w = sourceWeights[items[idx].source] ?? 5;
      const pw = sourceWeights[items[primaryIdx].source] ?? 5;
      if (w > pw) primaryIdx = idx;
    }

    for (const idx of indices) {
      items[idx].clusterId          = clId;
      items[idx].confirmationsCount = indices.length - 1;
      items[idx].isPrimary          = idx === primaryIdx;
    }
  }

  return items;
}
