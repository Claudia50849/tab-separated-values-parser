/**
 * Public API for the tsv-format library.
 *
 * The library is split into `core.js` (the actual parser and serializer)
 * and this file, which simply re-exports the public surface. Keeping the
 * surface in one place lets callers `import { parseTsv, serializeTsv }` from
 * a single entry point while the implementation is free to use internal
 * helpers without polluting the public namespace.
 */
import { parseTsv, serializeTsv, TsvError } from './core.js';

export { parseTsv, serializeTsv, TsvError };
