# tsv-format

A small, zero-dependency parser and serializer for Tab Separated Values that handles embedded tabs and newlines via RFC-4180-style quoting.

## Usage

```js
import { parseTsv, serializeTsv, TsvError } from './src/index.js';

const text = serializeTsv([['name', 'note'], ['Alice', 'has	a tab']]);
// -> 'name\tnote\nAlice\t"has\ta tab"'

const rows = parseTsv(text);
// -> [['name', 'note'], ['Alice', 'has\ta tab']]
```

Run the tests with `node --test`.

## Why this exists

Plain TSV breaks the moment a field contains a tab or a newline. Real data has both. This library implements a single, strict quoting convention so embedded structural characters survive a serialize/parse round-trip.

The trade-off is deliberate: the delimiter is the tab character only. There is no `delimiter` option. Supporting configurable delimiters is where TSV/CSV libraries tend to drift into inconsistent quoting rules and parser/serializer disagreements. If you need CSV, use a CSV library.

## The awkward edge you will hit

A quote character (`"`) appearing in the middle of an *unquoted* field is rejected with a `TsvError` rather than silently absorbed. If your data has stray quotes in unquoted fields, you'll need to clean them before parsing. This strictness is intentional: silently guessing what the producer meant is how corrupted data hides.

Also note: a single trailing newline on input is stripped (so `"a\tb\n"` parses to one row, not two). This matches typical command-line tool behaviour and avoids phantom empty rows from newline-terminated files.
