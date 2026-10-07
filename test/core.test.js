import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTsv, serializeTsv, TsvError } from '../src/index.js';

/**
 * Round-trip: serialize then parse should recover the original data for any
 * field values that don't contain the NUL character (NUL survives escaping
 * but is unusual to assert on directly).
 */
function roundTrip(rows) {
  const text = serializeTsv(rows);
  const back = parseTsv(text);
  assert.deepEqual(back, rows);
}

test('parses a simple single row', () => {
  assert.deepEqual(parseTsv('a\tb\tc'), [['a', 'b', 'c']]);
});

test('parses multiple rows', () => {
  assert.deepEqual(
    parseTsv('a\tb\nc\td'),
    [['a', 'b'], ['c', 'd']]
  );
});

test('empty input yields empty array', () => {
  assert.deepEqual(parseTsv(''), []);
});

test('trailing newline does not create a phantom empty row', () => {
  // This is the awk behaviour and the least surprising for file input.
  assert.deepEqual(parseTsv('a\tb\n'), [['a', 'b']]);
});

test('trailing CRLF is stripped as one separator', () => {
  assert.deepEqual(parseTsv('a\tb\r\n'), [['a', 'b']]);
});

test('lone CR is treated as a row separator', () => {
  assert.deepEqual(parseTsv('a\tb\rc\td'), [['a', 'b'], ['c', 'd']]);
});

test('quoted field containing a tab', () => {
  assert.deepEqual(parseTsv('"a\tb"\tc'), [['a\tb', 'c']]);
});

test('quoted field containing a newline', () => {
  assert.deepEqual(parseTsv('"a\nb"\tc'), [['a\nb', 'c']]);
});

test('doubled quotes inside a quoted field are unescaped to one quote', () => {
  assert.deepEqual(parseTsv('"a""b"\tc'), [['a"b', 'c']]);
});

test('empty quoted field is an empty string', () => {
  assert.deepEqual(parseTsv('""\tb'), [['', 'b']]);
});

test('unterminated quoted field throws TsvError', () => {
  assert.throws(
    () => parseTsv('"abc'),
    (err) => {
      assert.ok(err instanceof TsvError);
      assert.match(err.message, /Unterminated/);
      return true;
    }
  );
});

test('quote inside an unquoted field is rejected', () => {
  assert.throws(
    () => parseTsv('ab"cd\tb'),
    (err) => {
      assert.ok(err instanceof TsvError);
      assert.match(err.message, /Unexpected quote/);
      return true;
    }
  );
});

test('serialize simple rows', () => {
  assert.equal(serializeTsv([['a', 'b'], ['c', 'd']]), 'a\tb\nc\td');
});

test('serialize quotes fields containing tabs', () => {
  assert.equal(serializeTsv([['a\tb', 'c']]), '"a\tb"\tc');
});

test('serialize quotes fields containing newlines', () => {
  assert.equal(serializeTsv([['a\nb', 'c']]), '"a\nb"\tc');
});

test('serialize escapes literal quotes by doubling them', () => {
  assert.equal(serializeTsv([['a"b']]), '"a""b"');
});

test('round-trips through embedded tabs and newlines', () => {
  roundTrip([['a\tb\nc', 'plain'], ['x', 'y"z']]);
});

test('serialize rejects non-string cells', () => {
  assert.throws(
    () => serializeTsv([['a', 42]]),
    (err) => {
      assert.ok(err instanceof TsvError);
      return true;
    }
  );
});

test('serialize rejects non-array rows', () => {
  assert.throws(
    () => serializeTsv([['a'], 'not-an-array']),
    (err) => {
      assert.ok(err instanceof TsvError);
      return true;
    }
  );
});

test('round-trips a row whose final field is genuinely empty', () => {
  // The final tab indicates a trailing empty field that must survive.
  assert.deepEqual(parseTsv('a\t'), [['a', '']]);
  assert.equal(serializeTsv([['a', '']]), 'a\t');
});

test('TsvError carries a position when available', () => {
  try {
    parseTsv('"abc');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof TsvError);
    assert.ok(err.position >= 0);
  }
});
