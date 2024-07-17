import { UnorderedAsyncIterator, UnorderedAsyncIteratorHelpersNop } from "./unordered-async-iterator-helpers";

export function unordered<T>(a: AsyncIterator<T>): UnorderedAsyncIterator<T> {
  return new UnorderedAsyncIteratorHelpersNop(a);
}