// Small undo/redo stack shared by the text editor and the pen pad.
export class HistoryStack {
  constructor(initial, limit = 200) { this.items = [initial]; this.index = 0; this.limit = limit; }
  get current() { return this.items[this.index]; }
  push(value) {
    if (value === this.current) return false;
    this.items = this.items.slice(0, this.index + 1);
    this.items.push(value);
    if (this.items.length > this.limit) this.items.shift();
    this.index = this.items.length - 1;
    return true;
  }
  undo() { if (this.index > 0) this.index--; return this.current; }
  redo() { if (this.index < this.items.length - 1) this.index++; return this.current; }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.items.length - 1; }
  reset(value) { this.items = [value]; this.index = 0; }
}

/** Word-level diff: marks words in `after` that are new compared with `before`. */
export function changedWords(before, after) {
  const a = (before || '').split(/(\s+)/), b = (after || '').split(/(\s+)/);
  const n = a.length, m = b.length;
  // LCS table (notes are short; cap the work so huge notes still render).
  if (n * m > 400000) return b.map(text => ({ text, changed: false }));
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (j < m) {
    if (i < n && a[i] === b[j]) { out.push({ text: b[j], changed: false }); i++; j++; }
    else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else { out.push({ text: b[j], changed: !/^\s+$/.test(b[j]) }); j++; }
  }
  return out;
}
