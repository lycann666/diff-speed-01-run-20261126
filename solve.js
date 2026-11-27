// Fast drop-in for makefun-diff 1.0.0 — "Diff two texts faster, 27 November 2026".
//
// My own implementation of the rule in the kit's RULES.txt, written from that
// specification: run(input) returns exactly makefun-diff 1.0.0's patch of the
// case's input { old, new } as one JSON string.
//
// How it is faster than the reference: the reference walks the search with one
// heap object per (depth, diagonal) and compares lines as strings; this module
// interns every distinct line to a small integer id once, then runs Myers's
// greedy search over those ids in flat Int32Array rows (one row per depth, kept
// for the backtrack), with the reference's own tie-break — a deletion wins when
// it reaches as far into the old text as the insertion — and no edge-diagonal
// pruning, so the script it recovers is the reference's script, byte for byte.
//
// Line rule: a text is cut after every "\n" (the only separator; "\r" stays part
// of its line); a last line with no "\n" is a line too. Two lines are equal only
// when they are the same code units, newline or its absence included.
//
// Edit-script rule: keep the common prefix of lines, then the common suffix of
// what is left; between them Myers's greedy search from the first lines, keeping
// on each diagonal the path reaching furthest into the old text, deletion on a
// tie, never moving past either text's end, following every run of equal lines
// as far as it goes; the first path to reach both ends is the script.
//
// Patch rule: "makefun-diff/1 old=N new=M hunks=H deleted=D inserted=I", then per
// hunk "@ os ol ns nl" (os one more than the old lines before the hunk, ol the old
// lines it covers, ns and nl the same in the new text) and one line per line it
// covers ("=" kept, "-" deleted, "+" inserted). Each run of changes lists its
// deletions before its insertions and shows up to 3 kept lines before and after
// it; two runs at most 6 kept lines apart share a hunk. A line that ends its text
// with no newline is written with one and followed by a line "%". Identical
// texts are the first line alone.

/** The patch's first word. */
const FORMAT = 'makefun-diff/1';

/** The kept lines a hunk shows before and after each change run. */
const CONTEXT = 3;

/** Run kinds. */
const KEEP = 0;
const DELETE = 1;
const INSERT = 2;

/** A text's lines, each with its "\n" (the last one without, when the text does not end in one). */
function splitLines(text) {
  const parts = text.split('\n');
  const last = parts.length - 1;
  const lines = new Array(last + 1);
  let n = 0;
  for (let i = 0; i < last; i++) lines[n++] = parts[i] + '\n';
  if (parts[last] !== '') lines[n++] = parts[last];
  lines.length = n;
  return lines;
}

/**
 * Myers's greedy search over the middle region, returning the edit runs
 * [{ kind, count }] for it (KEEP / DELETE / INSERT, in order).
 *
 * A and B are the interned line ids of the two texts; the region is
 * A[a0 .. a0+N), B[b0 .. b0+M). Positions are counts of lines consumed.
 * V rows: rows[d] is an Int32Array of length 2d+1; entry k+d holds the old-line
 * count reached on diagonal k after following that depth's snake, plus one
 * (0 means the diagonal is unreachable at that depth). Diagonal k means
 * x - y = k. The region is copied once into padded arrays whose end markers
 * (-1 on the old side, -2 on the new side) can never equal a real line id, so
 * a snake needs no bounds check: it stops at the first unequal pair, and the
 * markers stop it at either text's end.
 */
function myersRuns(A, B, a0, b0, N, M) {
  const Am = new Int32Array(N + 1);
  Am.set(A.subarray(a0, a0 + N));
  Am[N] = -1;
  const Bm = new Int32Array(M + 1);
  Bm.set(B.subarray(b0, b0 + M));
  Bm[M] = -2;

  const rows = [];
  // Depth 0: the snake from (0, 0); y = x here, so x stops at min(N, M).
  let x = 0;
  while (Am[x] === Bm[x]) x++;
  const v0 = new Int32Array(1);
  v0[0] = x + 1;
  rows.push(v0);

  let D = 0;
  if (x !== N || x !== M) {
    // Only the diagonal kFinal = N-M can stand at (N, M), so the search is
    // done when that diagonal's row reaches N; it is checked once per depth,
    // after the whole row, instead of once per diagonal.
    const kFinal = N - M;
    let done = false;
    for (let d = 1; d <= N + M && !done; d++) {
      const prev = rows[d - 1];
      const cur = new Int32Array(2 * d + 1);
      // k = -d: the deletion candidate (diagonal -d-1 at depth d-1) does not exist.
      {
        const k = -d;
        const xRight = prev[0];
        if (xRight !== 0 && xRight + d - 2 < M) {
          let xx = xRight - 1;
          while (Am[xx] === Bm[xx - k]) xx++;
          cur[0] = xx + 1;
        }
      }
      // Middle diagonals: both reads of prev are in bounds here.
      for (let i = 2; i <= 2 * d - 2; i += 2) {
        const k = i - d;
        const xDown = prev[i - 2];
        const xRight = prev[i];
        // A move past either text's end is no candidate: the deletion consumes
        // old line xDown-1 (valid while xDown <= N); the insertion consumes new
        // line xRight-k-2 (valid while xRight-k-2 < M).
        const canDel = xDown !== 0 && xDown <= N;
        const canIns = xRight !== 0 && xRight - k - 2 < M;
        if (!canDel && !canIns) continue;
        // Furthest into the old text wins; the deletion wins a tie. After the
        // move the old-line count is xDown (deletion) or xRight-1 (insertion).
        let xx = canDel && (!canIns || xDown >= xRight - 1) ? xDown : xRight - 1;
        // The snake: follow equal lines as far as they go (y = xx - k).
        while (Am[xx] === Bm[xx - k]) xx++;
        cur[i] = xx + 1;
      }
      // k = d: the insertion candidate (diagonal d+1 at depth d-1) does not exist.
      {
        const k = d;
        const xDown = prev[2 * d - 2];
        if (xDown !== 0 && xDown <= N) {
          let xx = xDown;
          while (Am[xx] === Bm[xx - k]) xx++;
          cur[2 * d] = xx + 1;
        }
      }
      rows.push(cur);
      const fi = kFinal + d;
      if (fi >= 0 && fi <= 2 * d && cur[fi] === N + 1) {
        D = d;
        done = true;
      }
    }
    if (!done) throw new Error('makefun-diff: the search ended without reaching both ends');
  }

  // Backtrack from (N, M), undoing one edit per depth with the same tie-break
  // the forward search used, so the script recovered is the forward search's.
  const rev = [];
  x = N;
  let y = M;
  for (let d = D; d >= 1; d--) {
    const prev = rows[d - 1];
    const prevLen = prev.length;
    const k = x - y;
    const i = k + d;
    const xDown = i - 2 >= 0 ? prev[i - 2] : 0;
    const xRight = i < prevLen ? prev[i] : 0;
    const canDel = xDown !== 0 && xDown <= N;
    const canIns = xRight !== 0 && xRight - k - 2 < M;
    let cx;
    let kind;
    let px;
    let py;
    if (canDel && (!canIns || xDown >= xRight - 1)) {
      // Deletion: from (xDown-1, xDown-k) to (xDown, xDown-k).
      px = xDown - 1;
      py = xDown - k;
      cx = px + 1;
      kind = DELETE;
    } else {
      // Insertion: from (xRight-1, xRight-k-2) to (xRight-1, xRight-k-1).
      px = xRight - 1;
      py = xRight - k - 2;
      cx = px;
      kind = INSERT;
    }
    if (x > cx) rev.push({ kind: KEEP, count: x - cx });
    rev.push({ kind, count: 1 });
    x = px;
    y = py;
  }
  if (x > 0) rev.push({ kind: KEEP, count: x });

  // Reverse into forward order, merging runs of one kind that touch.
  const runs = [];
  for (let i = rev.length - 1; i >= 0; i--) {
    const r = rev[i];
    const last = runs[runs.length - 1];
    if (last !== undefined && last.kind === r.kind) last.count += r.count;
    else runs.push({ kind: r.kind, count: r.count });
  }
  return runs;
}

/** A line as the patch writes it: its op, the line, a newline, and "%" on a line of its own when it had none. */
function written(op, line) {
  return line.endsWith('\n') ? op + line : op + line + '\n%\n';
}

/** makefun-diff 1.0.0's answer for one case's input. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const a = splitLines(input.old);
  const b = splitLines(input.new);
  const n = a.length;
  const m = b.length;

  // Intern every distinct line to a small integer id, so the search compares
  // integers instead of strings. One map serves both texts.
  const ids = new Map();
  let nextId = 0;
  const A = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const line = a[i];
    let id = ids.get(line);
    if (id === undefined) {
      id = nextId++;
      ids.set(line, id);
    }
    A[i] = id;
  }
  const B = new Int32Array(m);
  for (let i = 0; i < m; i++) {
    const line = b[i];
    let id = ids.get(line);
    if (id === undefined) {
      id = nextId++;
      ids.set(line, id);
    }
    B[i] = id;
  }

  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && A[prefix] === B[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && A[n - 1 - suffix] === B[m - 1 - suffix]) suffix++;

  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  runs.push(...myersRuns(A, B, prefix, prefix, n - prefix - suffix, m - prefix - suffix));
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // The change runs: each a stretch of deletions and insertions between two kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h === undefined ? undefined : h[h.length - 1];
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }

  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written('=', a[at]));
      for (let i = 0; i < c.dels; i++) out.push(written('-', a[c.o + i]));
      for (let i = 0; i < c.ins; i++) out.push(written('+', b[c.p + i]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written('=', a[at]));
  }
  return out.join('');
}
