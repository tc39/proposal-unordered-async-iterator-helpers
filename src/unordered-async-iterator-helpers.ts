import { Semaphore } from "../../proposal-concurrency-control/lib/index.js";
import type { Governor } from "../../proposal-concurrency-control/lib/index.js";

type Mapper<T, R> = (this: AsyncIterator<T>, e: T) => R;
type Predicate<T> = Mapper<T, boolean | Promise<boolean>>;

export abstract class UnorderedAsyncIterator<T> implements AsyncIterator<T> {
  abstract next(): ReturnType<AsyncIterator<T>["next"]>;

  buffered(governor: Governor | number): UnorderedAsyncIteratorHelpersBuffered<T> {
    return new UnorderedAsyncIteratorHelpersBuffered(this, governor);
  }

  map<R>(mapper: Mapper<T, R>): UnorderedAsyncIteratorHelpersMap<T, R> {
    return new UnorderedAsyncIteratorHelpersMap(this, mapper);
  }

  filter(filter: Predicate<T>): UnorderedAsyncIteratorHelpersFilter<T> {
    return new UnorderedAsyncIteratorHelpersFilter(this, filter);
  }

  some(predicate: Predicate<T>, governor: Governor = new Semaphore(1)): Promise<boolean> {
    const p = Promise.withResolvers<boolean>();
    let settled = false;
    let outstanding = 0;
    let seenEnd = false;

    let recur = () => {
      if (settled || seenEnd) return;
      governor.acquire().then(token => {
        if (settled || seenEnd) {
          token.release();
          return;
        }
        ++outstanding;
        this.next().then(({ done, value }) => {
          --outstanding;
          token.release();
          if (settled) return;
          if (done) {
            seenEnd = true;
            if (outstanding === 0) {
              // settled = true;
              p.resolve(false);
            }
          } else {
            Promise.resolve(predicate.call(this, value)).then(matched => {
              if (settled) return;
              if (matched) {
                settled = true;
                p.resolve(true);
              } else if(seenEnd && outstanding === 0) {
                // settled = true;
                p.resolve(false);
              }
            });
          }
        }, e => {
          --outstanding;
          token.release();
          if (settled) return;
          settled = true;
          p.reject(e);
        });
        recur();
      });
    };
    recur();
    return p.promise;
  }
}

class UnorderedAsyncIteratorHelpersBuffered<T> extends UnorderedAsyncIterator<T> {
  #underlying: AsyncIterator<T>;
  #governor: Governor;
  #vendedPromises: PromiseWithResolvers<IteratorResult<T>>[] = [];
  #done: boolean = false;
  #outstanding: number = 0;
  #buffer: IteratorResult<T>[] = [];

  constructor(underlying: AsyncIterator<T>, governor: Governor | number) {
    super();
    this.#underlying = underlying;
    if (typeof governor === 'number') {
      governor = new Semaphore(governor);
    }
    this.#governor = governor;
    this.#fillBuffer();
  }

  #fillBuffer() {
    if (this.#done) return;
    this.#governor.acquire().then(token => {
      if (this.#done) {
        token.release();
        return;
      }
      ++this.#outstanding;
      this.#underlying.next().then(result => {
        --this.#outstanding;
        token.release();
        if (result.done) {
          this.#done = true;
          if (this.#outstanding === 0) {
            for (const q of this.#vendedPromises) {
              q.resolve({ done: true, value: undefined });
            }
          }
        } else {
          if (this.#vendedPromises.length === 0) {
            this.#buffer.push(result);
          } else {
            this.#vendedPromises.shift()!.resolve(result);
            if (this.#outstanding === 0) {
              for (const q of this.#vendedPromises) {
                q.resolve({ done: true, value: undefined });
              }
            }
          }
        }
      }, e => {
        --this.#outstanding;
        token.release();
        this.#done = true;
        if (this.#vendedPromises.length === 0) return;
        this.#vendedPromises.shift()!.reject(e);
        for (const q of this.#vendedPromises) {
          q.resolve({ done: true, value: undefined });
        }
      });
      this.#fillBuffer();
    });
  }

  next(): Promise<IteratorResult<T>> {
    if (this.#done) return Promise.resolve<IteratorResult<T>>({ done: true, value: undefined });
    if (this.#buffer.length === 0) {
      const p = Promise.withResolvers<IteratorResult<T>>();
      this.#vendedPromises.push(p);
      return p.promise;
    } else {
      return Promise.resolve(this.#buffer.shift()!);
    }
  }
}

class UnorderedAsyncIteratorHelpersMap<T, R> extends UnorderedAsyncIterator<R> {
  #underlying: AsyncIterator<T>;
  #mapper: Mapper<T, R>;
  #vendedPromises: PromiseWithResolvers<IteratorResult<R>>[] = [];
  #done: boolean = false;

  constructor(underlying: AsyncIterator<T>, mapper: Mapper<T, R>) {
    super();
    this.#underlying = underlying;
    this.#mapper = mapper;
  }

  next() {
    if (this.#done) return Promise.resolve<IteratorResult<R>>({ done: true, value: undefined });
    const p = Promise.withResolvers<IteratorResult<R>>();
    this.#vendedPromises.push(p);
    this.#underlying.next().then(({ done, value }) => {
      if (done) {
        this.#done = true;
        if (this.#vendedPromises.length === 0) return;
        this.#vendedPromises.pop()!.resolve({ done: true, value: undefined });
      } else {
        Promise.resolve(this.#mapper.call(this.#underlying, value)).then(mappedValue => {
          if (this.#vendedPromises.length === 0) return;
          this.#vendedPromises.shift()!.resolve({ done: false, value: mappedValue });
        });
      }
    }, e => {
      this.#done = true;
      if (this.#vendedPromises.length === 0) return;
      this.#vendedPromises.shift()!.reject(e);
      for (const q of this.#vendedPromises) {
        q.resolve({ done: true, value: undefined });
      }
    });
    return p.promise;
  }
}

class UnorderedAsyncIteratorHelpersFilter<T> extends UnorderedAsyncIterator<T> {
  #underlying: AsyncIterator<T>;
  #filter: Predicate<T>;
  #vendedPromises: PromiseWithResolvers<IteratorResult<T>>[] = [];
  #done: boolean = false;

  constructor(underlying: AsyncIterator<T>, filter: Predicate<T>) {
    super();
    this.#underlying = underlying;
    this.#filter = filter;
  }

  next() {
    if (this.#done) return Promise.resolve<IteratorResult<T>>({ done: true, value: undefined });
    const p = Promise.withResolvers<IteratorResult<T>>();
    this.#vendedPromises.push(p);
    this.#underlying.next().then(({ done, value }) => {
      if (done) {
        this.#done = true;
        if (this.#vendedPromises.length === 0) return;
        this.#vendedPromises.pop()!.resolve({ done: true, value: undefined });
      } else {
        Promise.resolve(this.#filter.call(this.#underlying, value)).then(filterResult => {
          if (this.#vendedPromises.length === 0) return;
          if (filterResult) {
            this.#vendedPromises.shift()!.resolve({ done: false, value });
          } else {
            this.#vendedPromises.pop()!.resolve({ done: true, value: undefined });
          }
        });
      }
    }, e => {
      this.#done = true;
      if (this.#vendedPromises.length === 0) return;
      this.#vendedPromises.shift()!.reject(e);
      for (const q of this.#vendedPromises) {
        q.resolve({ done: true, value: undefined });
      }
    });
    return p.promise;
  }
}

export class UnorderedAsyncIteratorHelpersNop<T> extends UnorderedAsyncIterator<T> {
  #underlying: AsyncIterator<T>;
  #vendedPromises: PromiseWithResolvers<IteratorResult<T>>[] = [];
  #done: boolean = false;

  constructor(underlying: AsyncIterator<T>) {
    super();
    this.#underlying = underlying;
  }

  async next() {
    if (this.#done) return Promise.resolve<IteratorResult<T>>({ done: true, value: undefined });
    const p = Promise.withResolvers<IteratorResult<T>>();
    this.#vendedPromises.push(p);
    this.#underlying.next().then(({ done, value }) => {
      if (done) {
        this.#done = true;
        if (this.#vendedPromises.length === 0) return;
        this.#vendedPromises.pop()!.resolve({ done: true, value: undefined });
      } else {
        if (this.#vendedPromises.length === 0) return;
        this.#vendedPromises.shift()!.resolve({ done: false, value });
      }
    }, e => {
      this.#done = true;
      if (this.#vendedPromises.length === 0) return;
      this.#vendedPromises.shift()!.reject(e);
      for (const q of this.#vendedPromises) {
        q.resolve({ done: true, value: undefined });
      }
    });
    return p.promise;
  }
}
