/**
 * Bingo card generation utilities.
 *
 * Standard 5×5 bingo card layout:
 *   B: 1-15   (column 0)
 *   I: 16-30  (column 1)
 *   N: 31-45  (column 2)  – center cell (index 12) is FREE
 *   G: 46-60  (column 3)
 *   O: 61-75  (column 4)
 */

const COLUMN_RANGES: [number, number][] = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
];

/** Pick `count` unique random integers from [min, max] inclusive */
function pickRandom(min: number, max: number, count: number): number[] {
  const pool: number[] = [];
  for (let i = min; i <= max; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/**
 * Generate a 5×5 bingo card as a row-major flat array of 25 numbers.
 * Index 12 (row 2, col 2) is the free center cell, represented as 0.
 */
export function generateBingoCard(): number[] {
  const card: number[] = new Array(25).fill(0);

  for (let col = 0; col < 5; col++) {
    const [min, max] = COLUMN_RANGES[col];
    const nums = pickRandom(min, max, 5);
    for (let row = 0; row < 5; row++) {
      card[row * 5 + col] = nums[row];
    }
  }

  // Free center cell
  card[12] = 0;
  return card;
}

/** Initial openedCells bitmask: only center cell (bit 12) is set */
export const INITIAL_OPENED_CELLS = 1 << 12;

/**
 * Open the cell(s) matching `drawnNumber` in the given card.
 * Returns the new openedCells bitmask (unchanged if number not on card).
 */
export function openCell(numbers: number[], openedCells: number, drawnNumber: number): number {
  const idx = numbers.indexOf(drawnNumber);
  if (idx === -1) return openedCells;
  return openedCells | (1 << idx);
}

/** Check if the given openedCells bitmask contains a winning bingo pattern */
export function checkBingo(openedCells: number): boolean {
  // All 5 rows
  for (let r = 0; r < 5; r++) {
    let row = 0;
    for (let c = 0; c < 5; c++) row |= 1 << (r * 5 + c);
    if ((openedCells & row) === row) return true;
  }
  // All 5 columns
  for (let c = 0; c < 5; c++) {
    let col = 0;
    for (let r = 0; r < 5; r++) col |= 1 << (r * 5 + c);
    if ((openedCells & col) === col) return true;
  }
  // Main diagonal (top-left → bottom-right)
  let diag1 = 0;
  for (let i = 0; i < 5; i++) diag1 |= 1 << (i * 5 + i);
  if ((openedCells & diag1) === diag1) return true;
  // Anti-diagonal (top-right → bottom-left)
  let diag2 = 0;
  for (let i = 0; i < 5; i++) diag2 |= 1 << (i * 5 + (4 - i));
  if ((openedCells & diag2) === diag2) return true;

  return false;
}
