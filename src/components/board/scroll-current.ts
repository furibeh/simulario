/**
 * Svelte action for a horizontally scrolling table wrapper: whenever `key` changes, scrolls so the
 * first `.now` cell (the current column) is visible. It jumps instead of animating, so it needs no
 * reduced-motion branch, and it never scrolls the page itself.
 */
export function scrollCurrent(node: HTMLElement, _key: unknown) {
  const reveal = () => {
    const cell = node.querySelector<HTMLElement>(".now");
    if (!cell) return;
    const left = cell.offsetLeft;
    const right = left + cell.offsetWidth;
    if (left < node.scrollLeft) node.scrollLeft = Math.max(0, left - cell.offsetWidth * 2);
    else if (right > node.scrollLeft + node.clientWidth) {
      node.scrollLeft = right - node.clientWidth + cell.offsetWidth * 2;
    }
  };
  reveal();
  return {
    update(_next: unknown) {
      reveal();
    },
  };
}
