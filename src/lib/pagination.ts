export const ITEMS_PER_PAGE = 10;

export type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

export function totalPages(totalItems: number, pageSize = ITEMS_PER_PAGE) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateItems<T>(items: T[], page: number, pageSize = ITEMS_PER_PAGE) {
  const safePage = Math.min(Math.max(page, 1), totalPages(items.length, pageSize));
  const start = (safePage - 1) * pageSize;

  return items.slice(start, start + pageSize);
}

export function visiblePaginationItems(pageCount: number, currentPage: number): PaginationItem[] {
  const safePageCount = Math.max(1, pageCount);
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), safePageCount);

  if (safePageCount <= 7) {
    return Array.from({ length: safePageCount }, (_, index) => index + 1);
  }

  if (safeCurrentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-end", safePageCount];
  }

  if (safeCurrentPage >= safePageCount - 3) {
    return [
      1,
      "ellipsis-start",
      safePageCount - 4,
      safePageCount - 3,
      safePageCount - 2,
      safePageCount - 1,
      safePageCount,
    ];
  }

  return [
    1,
    "ellipsis-start",
    safeCurrentPage - 1,
    safeCurrentPage,
    safeCurrentPage + 1,
    "ellipsis-end",
    safePageCount,
  ];
}
