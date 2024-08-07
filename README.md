JavaScript Unordered Async Iterator Helpers Proposal
====================================================

**Stage:** 1

**Champions:** Michael Ficarra

**Authors:** Michael Ficarra

## Presentations to Committee

- [July 2024: Stage 1](https://docs.google.com/presentation/d/1EDhoV4Vyh1Pte-W2qWvvCeLwhQ61dMFT55GNg0VeDLM)

## Background

An early form of the [iterator helpers MVP proposal](https://github.com/tc39/proposal-iterator-helpers) included variants of each iterator helper MVP method on `AsyncIterator.prototype`. These methods were specified to match the behaviour of a naive generator-based implementation, with the philosophy that reasoning about their behaviour would be as simple as saying "what would this do in the first implementation that comes to mind?". This unfortunately meant that the async iterator helper variants adopted the undesirable queueing behaviour of generators: no matter how many times the produced async iterator was `next()`-ed without waiting for outstanding promises to settle, the underlying iterator would never have more than one outstanding `next()`. The high-level consequence of this is that async iterators that supported (and could benefit from) concurrent `next()`s would lose their support when transformed by any of the transformation methods provided by the iterator helpers MVP. To buy ourselves time to resolve this issue without holding up sync iterator helpers, we split async iterator helpers out into [their own proposal](https://github.com/tc39/proposal-async-iterator-helpers). *Note: I am very grateful to the community members who got involved and forced us to think harder about this, spend extra time, and not just do the easy thing!*

Later, when working on the async iterator helpers proposal and trying to maximise the concurrency that we could permit with the async iterator MVP methods, we discovered that dropping the ordering constraint allowed for far more efficient use of the available concurrency. It's also expected that many use cases (possibly most) will be able to drop the ordering constraint. Unordered helpers were briefly explored as part of the async iterator helpers proposal, but because the design space was large, and in order to not hold up that proposal, they were deferred to a later proposal, in the same way async iterator helpers were deferred from the sync iterator helpers proposal. This is that deferred proposal.

## Proposal

The async iterator helpers proposal introduces a `.toAsync()` method on `Iterator.prototype` to lift the iterator to an async iterator with `AsyncIterator.prototype` as its prototype. `AsyncIterator.prototype` has all of the same method names as `Iterator.prototype`. This proposal takes a similar approach.

`AsyncIterator.prototype` gets a method named `.unordered()` to lift an async iterator into an unordered async iterator with `UnorderedAsyncIterator.prototype` as its prototype. `UnorderedAsyncIterator.prototype` has all the same method names as `Iterator.prototype` and `AsyncIterator.prototype` (aside from `.toAsync()` and `.unordered()` probably?), except their implementations are able to achieve much higher concurrency by possibly resolving vended Promises in an order other than the order they were vended.

We can see a visualisation of the throughput difference between ordered and unordered transforms from [alexpusch/rust-magic-patterns/rust-stream-visualized](https://github.com/alexpusch/rust-magic-patterns/blob/master/rust-stream-visualized/Readme.md).

![ordered buffer](https://github.com/alexpusch/rust-magic-patterns/raw/master/rust-stream-visualized/resources/buffer_5.gif)

![unordered buffer](https://github.com/alexpusch/rust-magic-patterns/raw/master/rust-stream-visualized/resources/buffer_unordered_5.gif)

Because unordered helpers provide no advantage in the absence of concurrent calls to `.next()`, the iterator-consuming methods in this proposal (`.some()`, `.forEach()`, etc) will depend on the [concurrency control proposal](https://github.com/michaelficarra/proposal-concurrency-control).

## Open Questions

- should the names of `.toAsync()` and `.unordered()` match better?
  - `AsyncIterator.prototype.toUnordered()`?
  - `Iterator.prototype.async()`?
- require the concurrency parameter?
  - concurrency of 1 is basically like calling an ordered helper (bad)

## Considered Alternatives

### `-Unordered` variants of each helper

This is worse because it permits chaining order-preserving helpers after unordered helpers, losing the concurrency advantage. The naming also favours ordered helpers, even though unordered helpers should be encouraged wherever possible.
