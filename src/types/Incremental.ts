export interface IncrementalCollectionResponse<T> {
  cursor: number
  deletedIds: string[]
  items: T[]
}

export type CollectionResponse<T> = T[] | IncrementalCollectionResponse<T>
