
import { unordered as convert } from "./index.js";

const AsyncIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf((async function*(){})())));

Object.defineProperty(AsyncIteratorPrototype, "unordered", {
  value: function unordered() {
    if (new.target) throw new TypeError;
    return convert(this as AsyncIterator<any>);
  },
  configurable: true,
  writable: true,
  enumerable: false,
});