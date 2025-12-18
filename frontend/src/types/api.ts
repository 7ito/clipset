export interface ApiError {
  detail: string
}

export interface PaginationParams {
  page?: number
  page_size?: number
}

export interface ApiResponse<T> {
  data: T
  error?: ApiError
}
