export class PaginationMetaDto {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;

  constructor(page: number, limit: number, totalItems: number) {
    this.page = page;
    this.limit = limit;
    this.totalItems = totalItems;
    this.totalPages = Math.max(1, Math.ceil(this.totalItems / Math.max(1, this.limit)));
    this.hasNextPage = this.page < this.totalPages;
    this.hasPrevPage = this.page > 1;
  }
}

export class ApiResponseDto<T> {
  success: boolean;
  message: string;
  data: T | null;
  meta?: PaginationMetaDto | null;

  constructor(
    success: boolean,
    message: string,
    data: T | null = null,
    meta?: PaginationMetaDto | null,
  ) {
    this.success = success;
    this.message = message;
    this.data = data;
    if (meta !== undefined) {
      this.meta = meta;
    }
  }
}
