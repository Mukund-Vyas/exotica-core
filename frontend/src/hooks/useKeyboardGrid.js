import { useRef, useCallback } from "react";

/**
 * Manages a 2D grid of input refs so Enter/Arrow keys move focus like a
 * spreadsheet. Enter on the last column of the last row calls onLastCellEnter
 * (used to append a new row) instead of doing nothing.
 */
export function useKeyboardGrid(colCount) {
  const cellRefs = useRef({}); // key: `${row}-${col}` -> element

  const registerCell = useCallback(
    (row, col) => (el) => {
      if (el) cellRefs.current[`${row}-${col}`] = el;
      else delete cellRefs.current[`${row}-${col}`];
    },
    []
  );

  const focusCell = useCallback((row, col) => {
    cellRefs.current[`${row}-${col}`]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (row, col, rowCount, onLastCellEnter) => (e) => {
      const isLastCell = row === rowCount - 1 && col === colCount - 1;

      if (e.key === "Enter") {
        e.preventDefault();
        if (isLastCell) {
          onLastCellEnter?.();
        } else if (col < colCount - 1) {
          focusCell(row, col + 1);
        } else {
          focusCell(row + 1, 0);
        }
      } else if (e.key === "ArrowDown" && !e.altKey) {
        if (cellRefs.current[`${row + 1}-${col}`]) {
          e.preventDefault();
          focusCell(row + 1, col);
        }
      } else if (e.key === "ArrowUp") {
        if (cellRefs.current[`${row - 1}-${col}`]) {
          e.preventDefault();
          focusCell(row - 1, col);
        }
      }
    },
    [colCount, focusCell]
  );

  return { registerCell, focusCell, handleKeyDown };
}
