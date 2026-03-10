import { T, TOKEN_RULES } from './tokens.js';

export class Lexer {
  constructor(code) {
    // Normalize line endings
    this.code = code.replace(/\r\n|\r/g, '\n');
    this.cursor = 0;
    this.lookahead = null;
  }

  get remaining() {
    return this.code.slice(this.cursor);
  }

  /**
   * Try to match a specific token type at the current cursor position.
   * Returns the cached lookahead if one exists (the PHP lexer works the same way).
   */
  peek(tokenType) {
    if (this.lookahead !== null) {
      return this.lookahead.type === tokenType ? this.lookahead : null;
    }

    if (this.cursor >= this.code.length) {
      this.lookahead = { type: T.EOF, value: '', start: this.cursor, end: this.cursor };
      return tokenType === T.EOF ? this.lookahead : null;
    }

    if (tokenType === T.EOF) {
      return null;
    }

    const rule = TOKEN_RULES.find(([type]) => type === tokenType);
    if (!rule) return null;

    const match = this.remaining.match(rule[1]);
    if (!match) return null;

    const start = this.cursor;
    this.cursor += match[0].length;
    this.lookahead = { type: tokenType, value: match[0], start, end: this.cursor };
    return this.lookahead;
  }

  /**
   * Consume and return the cached lookahead token.
   */
  consume() {
    const token = this.lookahead;
    this.lookahead = null;
    if (!token) throw new Error('No lookahead to consume');
    return token;
  }

  /**
   * Try to accept a token: peek it and if matched, consume and return it.
   * Returns null if not matched.
   */
  accept(tokenType) {
    return this.peek(tokenType) ? this.consume() : null;
  }

  /**
   * Expect a token of given type — throws if not found.
   */
  expect(tokenType) {
    const token = this.peek(tokenType);
    if (!token) {
      const got = this.remaining.slice(0, 20).replace(/\n/g, '\\n');
      throw new SyntaxError(`Expected ${tokenType} at position ${this.cursor}, got: "${got}"`);
    }
    return this.consume();
  }

  /**
   * Consume any combination of spaces, newlines, and comments.
   * Returns the consumed tokens (so the printer can preserve or reformat comments).
   */
  skipBigGap() {
    const skipped = [];
    while (true) {
      for (const type of [T.SPACE, T.NEWLINE, T.SLASH_COMMENT, T.HASH_COMMENT, T.MULTILINE_COMMENT]) {
        const t = this.accept(type);
        if (t) { skipped.push(t); break; }
      }
      // If none matched in inner loop, break outer
      const last = skipped[skipped.length - 1];
      if (!last || last._checked) break;
      last._checked = true;
    }
    return skipped;
  }

  /**
   * Scan a DSL expression content token (backtick-delimited).
   * Correctly handles backticks inside JS expressions ({...}) within the content
   * by tracking brace depth and treating backticks inside braces as template literals.
   * Returns a token or null if the cursor is not at a backtick.
   */
  acceptDslContent() {
    if (this.lookahead !== null) {
      return this.lookahead.type === T.DSL_EXPRESSION_CONTENT ? this.consume() : null;
    }

    const code = this.code;
    let i = this.cursor;

    if (i >= code.length || code[i] !== '`') return null;
    const start = i;
    i++; // skip opening backtick

    let braceDepth = 0; // depth of { } within AFX/JS expressions

    while (i < code.length) {
      const ch = code[i];

      if (ch === '\\') {
        i += 2; // skip escape sequence
      } else if (ch === '`') {
        if (braceDepth === 0) {
          i++; // closing backtick of the DSL block
          break;
        }
        // Template literal inside a JS expression — scan to its closing backtick
        i++;
        while (i < code.length) {
          if (code[i] === '\\') { i += 2; }
          else if (code[i] === '`') { i++; break; } // end inner template
          else if (code[i] === '$' && code[i + 1] === '{') {
            i += 2; // skip ${
            let d = 1;
            while (i < code.length && d > 0) {
              if (code[i] === '{') d++;
              else if (code[i] === '}') d--;
              else if (code[i] === '\\') i++;
              i++;
            }
          } else { i++; }
        }
      } else if (ch === '{') {
        braceDepth++;
        i++;
      } else if (ch === '}' && braceDepth > 0) {
        braceDepth--;
        i++;
      } else if (braceDepth > 0 && (ch === '"' || ch === "'")) {
        // String literal inside a JS expression — scan to closing quote
        const q = ch; i++;
        while (i < code.length && code[i] !== q) {
          if (code[i] === '\\') i++;
          i++;
        }
        i++; // closing quote
      } else {
        i++;
      }
    }

    const value = code.slice(start, i);
    this.cursor = i;
    this.lookahead = { type: T.DSL_EXPRESSION_CONTENT, value, start, end: i };
    return this.consume();
  }

  /**
   * Consume spaces and comments (no newlines).
   */
  skipSmallGap() {
    while (true) {
      let matched = false;
      for (const type of [T.SPACE, T.SLASH_COMMENT, T.HASH_COMMENT, T.MULTILINE_COMMENT]) {
        if (this.accept(type)) { matched = true; break; }
      }
      if (!matched) break;
    }
  }
}
