// A fast drop-in for csv-reader 1.0.0: the same answers for the same inputs,
// read the same way, but by jumping from delimiter to delimiter instead of
// one character at a time. The bulk of a CSV text is ordinary field content,
// so each field is taken with one native scan and one slice; only the broken
// bits (stray carriage returns, quotes that never close, junk after a
// closing quote) fall back to small, careful steps. Field results travel in
// three scratch slots instead of a fresh array per field, because a set of
// cases holds hundreds of thousands of fields.
//
// The reading policy, kept exactly as csv-reader 1.0.0 defines it:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote, and each CRLF or lone CR inside it is
//     read as LF; what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field ends);
//     a quote that never closes is a literal character, and the text after
//     it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record
//     starts on (every LF, CRLF and lone CR inside a quoted field counted),
//     row its record's index in rows (null for the header), in the order met,
//     a field's quote_junk when the field ends and a record's short_row or
//     long_row when the record ends.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next.

const END_COMMA = 0;
const END_BREAK = 1;
const END_TEXT = 2;

// The three characters that can end an unquoted field. One shared pattern,
// its lastIndex set before every use; the reads below never overlap.
const DELIM = /[,\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const wantHeader = input.header === true;
  const errors = [];
  const rows = [];
  const len = text.length;
  let columns = null;
  let width = -1;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  // The last field read: its value, how it ended, and how many characters
  // were kept into it (a dropped stray CR counts for nothing).
  let fValue = '';
  let fEnded = END_TEXT;
  let fAdded = 0;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // How many times `ch` occurs in text[from..to). A native scan per hit.
  function countChar(ch, from, to) {
    let n = 0;
    let i = from;
    for (;;) {
      i = text.indexOf(ch, i);
      if (i === -1 || i >= to) return n;
      n += 1;
      i += 1;
    }
  }

  // Appends the quoted content text[from..to) to value, turning each CRLF
  // and each lone CR into one LF, and advances the line count by the line
  // breaks inside it.
  function appendQuoted(value, from, to) {
    const crAt = text.indexOf('\r', from);
    if (crAt === -1 || crAt >= to) {
      line += countChar('\n', from, to);
      return value + text.slice(from, to);
    }
    const breaks =
      countChar('\r', from, to) +
      countChar('\n', from, to) -
      countChar('\r\n', from, to);
    line += breaks;
    return value + text.slice(from, to).replace(/\r\n?/g, '\n');
  }

  // Reads an unquoted field from pos, starting from `value` already built,
  // and leaves the result in the scratch slots.
  function readPlain(value) {
    let added = 0;
    for (;;) {
      DELIM.lastIndex = pos;
      const hit = DELIM.exec(text);
      if (hit === null) {
        if (pos < len) {
          value += text.slice(pos);
          added += len - pos;
        }
        pos = len;
        fValue = value;
        fEnded = END_TEXT;
        fAdded = added;
        return;
      }
      const at = hit.index;
      if (at > pos) {
        value += text.slice(pos, at);
        added += at - pos;
      }
      const ch = hit[0];
      if (ch === ',') {
        pos = at + 1;
        fValue = value;
        fEnded = END_COMMA;
        fAdded = added;
        return;
      }
      if (ch === '\n') {
        pos = at + 1;
        line += 1;
        fValue = value;
        fEnded = END_BREAK;
        fAdded = added;
        return;
      }
      // A carriage return: with a line feed it ends the record, alone it is
      // dropped and the field goes on.
      if (text[at + 1] === '\n') {
        pos = at + 2;
        line += 1;
        fValue = value;
        fEnded = END_BREAK;
        fAdded = added;
        return;
      }
      pushError('stray_cr');
      pos = at + 1;
    }
  }

  // Reads a quoted field whose opening quote sits at pos, leaving the
  // result in the scratch slots.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as an unquoted field.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        readPlain('"');
        return;
      }
      if (q > pos) value = appendQuoted(value, pos, q);
      if (text[q + 1] === '"') {
        value += '"';
        pos = q + 2;
        continue;
      }
      pos = q + 1;
      break;
    }
    if (pos >= len) {
      fValue = value;
      fEnded = END_TEXT;
      fAdded = 0;
      return;
    }
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      fValue = value;
      fEnded = END_COMMA;
      fAdded = 0;
      return;
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      fValue = value;
      fEnded = END_BREAK;
      fAdded = 0;
      return;
    }
    if (c === '\r' && text[pos + 1] === '\n') {
      pos += 2;
      line += 1;
      fValue = value;
      fEnded = END_BREAK;
      fAdded = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    readPlain(value);
    if (fAdded > 0) pushError('quote_junk');
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = wantHeader && columns === null ? null : rows.length;
    const fields = [];
    let wasQuoted;
    do {
      wasQuoted = text[pos] === '"';
      if (wasQuoted) readQuoted();
      else readPlain('');
      fields.push(fValue);
    } while (fEnded === END_COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !wasQuoted) continue;

    if (width < 0) width = fields.length;
    if (wantHeader && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({
        code: 'short_row',
        line: recordLine,
        row: recordRow,
        fields: fields.length,
      });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({
        code: 'long_row',
        line: recordLine,
        row: recordRow,
        extra: fields.splice(width),
      });
    }
    rows.push(fields);
  }
  return { columns: wantHeader ? (columns ?? []) : null, rows, errors };
}
