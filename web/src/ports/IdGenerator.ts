/** Port: opaque id allocation for domain entities. */
export interface IdGenerator {
  next(prefix: string): string
}
