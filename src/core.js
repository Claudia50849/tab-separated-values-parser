/**
 * TSV (Tab Separated Values) parser and serializer.
 *
 * The format this library implements is a strict, well-defined subset that
 * handles the two awkward cases real-world TSV data tends to hit:
 *
 *   - embedded newlines inside a field
 *   - embedded tabs and/or newlines that would otherwise break the row/column
 *     structure
 *
 * Both are handled by RFC-4180-style escaping: a field is wrapped in double
 * quotes when it contains a tab, a newline, a carriage return, or a double
 * quote. Inside quoted fields, a literal double quote is written twice ("").
 *
 * IMPORTANT DESIGN DECISION (documented because ambiguity is where these
 * libraries break):
 *
 * This library treats the field delimiter as the TAB character only. It does
 * not support comma, semicolon, or configurable delimiters. TSV means tabs.
 * If you need CSV, use a CSV library. Trying to support a delimiter argument
 * invites two failure modes (quoting rules drift, and the parser/serializer
 * disagree on the default) that a focused library can avoid entirely.
 *
 * Line endings: input may use \n, \r\n, or a lone \r; all are treated as row
 * separators when outside quotes. Output always uses \n as the row separator.
 *
 * Empty input yields an empty array. A single blank line (just a newline or
 * empty string after trimming a trailing newline) yields zero rows, not one
 * row with one empty field. This matches what tools like `awk` produce and
 * avoids spurious trailing empty rows from files that end with a newline.
 */

/**
 * Thrown when input cannot be parsed.
 */
export class TsvError extends Error {
  /**
   * @param {string} message Human-readable description of the failure.
   * @param {number} position Byte-ish offset into the input where parsing
   *   stopped. Useful for surfacing errors to users.
   */
  constructor(message, position) {
    super(message);
    this.name = 'TsvError';
    this.position = typeof position === 'number' ? position : -1;
  }
}

/**
 * Determine whether a field value must be quoted on output.
 *
 * A field needs quoting if it contains any character that would otherwise
 * be structurally significant: tab, newline, carriage return, or the quote
 * character itself. We also quote on embedded NUL for cleanliness, since
 * NULs in text data are almost always a corruption signal and quoting makes
 * them visible rather than silent.
 *
 * @param {string} field
 * @returns {boolean}
 */
function needsQuoting(field) {
  return /\t|\r|\n|"|\0/.test(field);
}

/**
 * Serialize one field for output.
 *
 * @param {string} field
 * @returns {string}
 */
function serializeField(field) {
  if (field.indexOf('"') !== -1) {
    // Double-quote escaping must happen before wrapping, otherwise we'd
    // escape the quotes we just added.
    return '"' + field.replace(/"/g, '""') + '"';
  }
  if (needsQuoting(field)) {
    return '"' + field + '"';
  }
  return field;
}

/**
 * Serialize a 2D array of strings into TSV text.
 *
 * @param {string[][]} rows
 * @returns {string}
 */
export function serializeTsv(rows) {
  if (!Array.isArray(rows)) {
    throw new TsvError('serializeTsv expects an array of arrays of strings', -1);
  }
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) {
      throw new TsvError('Row ' + r + ' is not an array', -1);
    }
    const parts = [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (typeof cell !== 'string') {
        throw new TsvError('Cell at row ' + r + ', column ' + c + ' is not a string', -1);
      }
      parts.push(serializeField(cell));
    }
    out.push(parts.join('\t'));
  }
  return out.join('\n');
}

/**
 * Parse TSV text into a 2D array of strings.
 *
 * Algorithm: a single forward pass over the input. We track whether we are
 * inside a quoted field. Inside quotes, "" is an escaped literal quote; a
 * standalone " closes the field. Outside quotes, \t ends the field, a line
 * ending ends the row.
 *
 * Trailing-newline handling: before parsing, we strip a single trailing
 * newline (\n, \r\n, or \r) so that a file ending in a newline does not
 * produce a phantom trailing empty row. A genuinely empty field at the end
 * of the last row is still preserved because we only strip one newline.
 *
 * @param {string} input
 * @returns {string[][]}
 * @throws {TsvError} on malformed quoting (e.g. unterminated quoted field).
 */
export function parseTsv(input) {
  if (typeof input !== 'string') {
    throw new TsvError('parseTsv expects a string', -1);
  }

  // Normalize: strip one trailing line ending so files ending in a newline
  // don't yield a trailing empty row. We deliberately strip at most one so
  // that a final field that is genuinely empty ("a\tb\n") still parses as
  // two fields in one row, not three.
  let s = input;
  if (s.length > 0) {
    if (s.endsWith('\r\n')) {
      s = s.slice(0, -2);
    } else if (s.endsWith('\n') || s.endsWith('\r')) {
      s = s.slice(0, -1);
    }
  }

  if (s.length === 0) {
    return [];
  }

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = s.length;

  while (i < len) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek: is this a doubled quote (escape) or a closing quote?
        if (i + 1 < len && s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // Closing quote.
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    // Outside quotes.
    if (ch === '"') {
      // A quote in the middle of an unquoted field is malformed under
      // strict RFC-4180 rules. We reject rather than guess, because silent
      // acceptance here is how data corruption hides.
      if (field.length > 0) {
        throw new TsvError('Unexpected quote inside unquoted field', i);
      }
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === '\t') {
      row.push(field);
      field = '';
      i++;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      // Handle \r\n as a single separator.
      if (ch === '\r' && i + 1 < len && s[i + 1] === '\n') {
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    field += ch;
    i++;
  }

  if (inQuotes) {
    throw new TsvError('Unterminated quoted field', i);
  }

  // Flush the final field and row. Because we stripped the trailing newline,
  // any remaining content is real data, not a separator artifact.
  row.push(field);
  rows.push(row);

  return rows;
}
