export function normalizeListSearch(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

export function getPaginationBounds(total: number, page: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pageCount, Math.max(1, Math.floor(page)));
  return {
    page: current,
    pageCount,
    start: total === 0 ? 0 : (current - 1) * size + 1,
    end: Math.min(current * size, total),
  };
}
