/**
 * Bingo card generation utilities.
 *
 * Standard 5x5 bingo card layout:
 *   B: 1-15   (column 0)
 *   I: 16-30  (column 1)
 *   N: 31-45  (column 2)
 *   G: 46-60  (column 3)
 *   O: 61-75  (column 4)
 *
 * In the updated rule set, the center cell is a normal numbered cell.
 * New employees only receive the center cell as an initial opened bonus.
 */

const COLUMN_RANGES: [number, number][] = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
];

export const CENTER_CELL_INDEX = 12;
const CENTER_CELL_BIT = 1 << CENTER_CELL_INDEX;
export const FULL_CARD_MASK = (1 << 25) - 1;

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
 * Generate a 5x5 bingo card as a row-major flat array of 25 numbers.
 * The center cell is treated like any other cell so non-new employees can
 * still open it through the regular draw flow.
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

  return card;
}

/** Initial opened cell mask based on participant type */
export function getInitialOpenedCells(isNewEmployee: boolean): number {
  return isNewEmployee ? CENTER_CELL_BIT : 0;
}

/** Open the center cell when a participant qualifies for the new employee bonus */
export function openCenterCell(openedCells: number): number {
  return openedCells | CENTER_CELL_BIT;
}

/**
 * Legacy cards used 0 in the center as a free cell. Replace that placeholder
 * with an unused N-column number so old cards remain playable under the new rule.
 */
export function normalizeLegacyCardNumbers(numbers: number[]): number[] {
  if (numbers[CENTER_CELL_INDEX] !== 0) return numbers;

  const nextNumbers = [...numbers];
  const usedInCenterColumn = new Set([
    nextNumbers[2],
    nextNumbers[7],
    nextNumbers[17],
    nextNumbers[22],
  ]);
  const available = [];
  for (let value = 31; value <= 45; value++) {
    if (!usedInCenterColumn.has(value)) {
      available.push(value);
    }
  }

  nextNumbers[CENTER_CELL_INDEX] = available[Math.floor(Math.random() * available.length)];
  return nextNumbers;
}

/** Normalize persisted opened cells when migrating away from the legacy free center cell */
export function normalizeOpenedCells(
  openedCells: number,
  isNewEmployee: boolean,
  hadLegacyFreeCenter: boolean,
): number {
  if (hadLegacyFreeCenter && !isNewEmployee) {
    return openedCells & ~CENTER_CELL_BIT;
  }
  return isNewEmployee ? openCenterCell(openedCells) : openedCells;
}

/**
 * Open the cell(s) matching `drawnNumber` in the given card.
 * Returns the new openedCells bitmask (unchanged if number not on card).
 */
export function openCell(numbers: number[], openedCells: number, drawnNumber: number): number {
  const idx = numbers.indexOf(drawnNumber);
  if (idx === -1) return openedCells;
  return openedCells | (1 << idx);
}

/** Open a specific cell index directly (used for bonus-time free selection). */
export function openCellByIndex(openedCells: number, cellIndex: number): number {
  return openedCells | (1 << cellIndex);
}

/** Check whether at least one unopened cell remains on the card. */
export function hasUnopenedCell(openedCells: number): boolean {
  return openedCells !== FULL_CARD_MASK;
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
  // Main diagonal (top-left -> bottom-right)
  let diag1 = 0;
  for (let i = 0; i < 5; i++) diag1 |= 1 << (i * 5 + i);
  if ((openedCells & diag1) === diag1) return true;
  // Anti-diagonal (top-right -> bottom-left)
  let diag2 = 0;
  for (let i = 0; i < 5; i++) diag2 |= 1 << (i * 5 + (4 - i));
  if ((openedCells & diag2) === diag2) return true;

  return false;
}
