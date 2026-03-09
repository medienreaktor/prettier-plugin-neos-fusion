import { Lexer } from './lexer.js';
import { T } from './tokens.js';

/**
 * Recursive-descent parser for Fusion files.
 * Grammar mirrors Neos\Fusion\Core\ObjectTreeParser\ObjectTreeParser.
 *
 * Produces a plain AST (no separate CST step needed for a formatter).
 */
class Parser {
  constructor(code) {
    this.lexer = new Lexer(code);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  accept(type) {
    return this.lexer.accept(type);
  }

  expect(type) {
    return this.lexer.expect(type);
  }

  peek(type) {
    return this.lexer.peek(type);
  }

  lazyExpect(type) {
    return !!this.lexer.accept(type);
  }

  /**
   * Skip spaces + comments (no newlines).
   * Collects and returns any comments encountered so they can be attached to AST nodes.
   */
  smallGap() {
    const comments = [];
    while (true) {
      let matched = false;
      this.lexer.accept(T.SPACE);
      for (const type of [T.SLASH_COMMENT, T.HASH_COMMENT, T.MULTILINE_COMMENT]) {
        const t = this.lexer.accept(type);
        if (t) { comments.push(t); matched = true; break; }
      }
      if (!matched) break;
    }
    return comments;
  }

  /**
   * Skip spaces, newlines, and comments.
   * Returns { comments, hasBlankLine } where hasBlankLine is true if any
   * newline was consumed (used by parseStatementList to preserve blank lines).
   */
  bigGap() {
    const comments = [];
    let hasBlankLine = false;
    while (true) {
      let matched = false;
      this.lexer.accept(T.SPACE);
      const nl = this.lexer.accept(T.NEWLINE);
      if (nl) hasBlankLine = true;
      for (const type of [T.SLASH_COMMENT, T.HASH_COMMENT, T.MULTILINE_COMMENT]) {
        const t = this.lexer.accept(type);
        if (t) { comments.push(t); matched = true; break; }
      }
      if (!matched && !nl) break;
    }
    return { comments, hasBlankLine };
  }

  // -------------------------------------------------------------------------
  // Grammar rules
  // -------------------------------------------------------------------------

  /**
   * FusionFile = StatementList
   */
  parseFusionFile() {
    const body = this.parseStatementList();
    return { type: 'FusionFile', body };
  }

  /**
   * StatementList = ( BigGap Statement )* BigGap
   */
  parseStatementList(stopToken = null) {
    const statements = [];

    this.bigGap(); // leading gap before first statement — blank lines here don't matter

    let nextHasBlankLine = false;

    while (!this.peek(T.EOF) && (stopToken === null || !this.peek(stopToken))) {
      const stmt = this.parseStatement();
      if (nextHasBlankLine) stmt.hasLeadingBlankLine = true;
      statements.push(stmt);

      const { hasBlankLine } = this.bigGap();
      nextHasBlankLine = hasBlankLine;
    }

    return { type: 'StatementList', statements };
  }

  /**
   * Statement = IncludeStatement / ObjectStatement
   */
  parseStatement() {
    if (this.peek(T.INCLUDE)) return this.parseIncludeStatement();

    if (
      this.peek(T.PROTOTYPE_START) ||
      this.peek(T.OBJECT_PATH_PART) ||
      this.peek(T.META_PATH_START) ||
      this.peek(T.STRING_SINGLE_QUOTED) ||
      this.peek(T.STRING_DOUBLE_QUOTED)
    ) {
      return this.parseObjectStatement();
    }

    const got = this.lexer.remaining.slice(0, 30).replace(/\n/g, '\\n');
    throw new SyntaxError(`Unexpected token at: "${got}"`);
  }

  /**
   * IncludeStatement = INCLUDE ( STRING / FILE_PATTERN ) EndOfStatement
   */
  parseIncludeStatement() {
    const token = this.expect(T.INCLUDE); // consumes "include:"
    this.lexer.accept(T.SPACE);

    let filePattern;
    const dq = this.lexer.accept(T.STRING_DOUBLE_QUOTED);
    const sq = !dq && this.lexer.accept(T.STRING_SINGLE_QUOTED);
    const fp = !dq && !sq && this.lexer.accept(T.FILE_PATTERN);

    if (dq) filePattern = dq.value.slice(1, -1);
    else if (sq) filePattern = sq.value.slice(1, -1);
    else if (fp) filePattern = fp.value;
    else throw new SyntaxError('Expected file pattern after include:');

    this.parseEndOfStatement();

    return { type: 'IncludeStatement', filePattern, start: token.start };
  }

  /**
   * ObjectStatement = ObjectPath ( ValueAssignment / ValueUnset / ValueCopy )? ( Block / EndOfStatement )
   */
  parseObjectStatement() {
    const path = this.parseObjectPath();
    this.lexer.accept(T.SPACE);

    let operation = null;
    if (this.peek(T.ASSIGNMENT)) operation = this.parseValueAssignment();
    else if (this.peek(T.UNSET))  operation = this.parseValueUnset();
    else if (this.peek(T.COPY))   operation = this.parseValueCopy();

    this.lexer.accept(T.SPACE);

    let block = null;
    if (this.peek(T.LBRACE)) {
      block = this.parseBlock();
    } else {
      if (!operation) {
        const got = this.lexer.remaining.slice(0, 30).replace(/\n/g, '\\n');
        throw new SyntaxError(`Expected operator or block after path, got: "${got}"`);
      }
      this.parseEndOfStatement();
    }

    return { type: 'ObjectStatement', path, operation, block };
  }

  /**
   * ObjectPath = PathSegment ( '.' PathSegment )*
   */
  parseObjectPath() {
    const segments = [this.parsePathSegment()];
    while (this.lexer.accept(T.DOT)) {
      segments.push(this.parsePathSegment());
    }
    return { type: 'ObjectPath', segments };
  }

  /**
   * PathSegment = prototype(FusionObjectName) / @metaKey / pathKey / "quoted"
   */
  parsePathSegment() {
    if (this.peek(T.PROTOTYPE_START)) {
      this.expect(T.PROTOTYPE_START);
      const name = this.expect(T.FUSION_OBJECT_NAME).value;
      this.expect(T.RPAREN);
      return { type: 'PrototypePathSegment', name };
    }

    if (this.peek(T.META_PATH_START)) {
      this.expect(T.META_PATH_START);
      const key = this.expect(T.OBJECT_PATH_PART).value;
      return { type: 'MetaPathSegment', key };
    }

    if (this.peek(T.OBJECT_PATH_PART)) {
      const key = this.expect(T.OBJECT_PATH_PART).value;
      return { type: 'PathSegment', key };
    }

    const dq = this.lexer.accept(T.STRING_DOUBLE_QUOTED);
    if (dq) return { type: 'PathSegment', key: dq.value.slice(1, -1), quoted: true };

    const sq = this.lexer.accept(T.STRING_SINGLE_QUOTED);
    if (sq) return { type: 'PathSegment', key: sq.value.slice(1, -1), quoted: true };

    const got = this.lexer.remaining.slice(0, 20).replace(/\n/g, '\\n');
    throw new SyntaxError(`Expected path segment, got: "${got}"`);
  }

  /**
   * ValueAssignment = '=' PathValue
   */
  parseValueAssignment() {
    this.expect(T.ASSIGNMENT);
    this.lexer.accept(T.SPACE);
    const value = this.parsePathValue();
    return { type: 'ValueAssignment', value };
  }

  /**
   * PathValue = STRING / FusionObjectName / DslExpression / EelExpression / number / bool / null
   */
  parsePathValue() {
    const sq = this.lexer.accept(T.STRING_SINGLE_QUOTED);
    if (sq) return { type: 'StringValue', value: sq.value.slice(1, -1), quote: 'single', raw: sq.value };

    const dq = this.lexer.accept(T.STRING_DOUBLE_QUOTED);
    if (dq) return { type: 'StringValue', value: dq.value.slice(1, -1), quote: 'double', raw: dq.value };

    const obj = this.lexer.accept(T.FUSION_OBJECT_NAME);
    if (obj) return { type: 'FusionObjectValue', value: obj.value };

    if (this.peek(T.DSL_EXPRESSION_START)) return this.parseDslExpression();

    const eel = this.lexer.accept(T.EEL_EXPRESSION);
    if (eel) return { type: 'EelExpressionValue', value: eel.value.slice(2, -1), raw: eel.value };

    const float = this.lexer.accept(T.FLOAT);
    if (float) return { type: 'FloatValue', value: parseFloat(float.value) };

    const int = this.lexer.accept(T.INTEGER);
    if (int) return { type: 'IntValue', value: parseInt(int.value, 10) };

    if (this.lexer.accept(T.TRUE_VALUE))  return { type: 'BoolValue', value: true };
    if (this.lexer.accept(T.FALSE_VALUE)) return { type: 'BoolValue', value: false };
    if (this.lexer.accept(T.NULL_VALUE))  return { type: 'NullValue' };

    const got = this.lexer.remaining.slice(0, 30).replace(/\n/g, '\\n');
    throw new SyntaxError(`Expected a value, got: "${got}"`);
  }

  /**
   * DslExpression = DSL_EXPRESSION_START DSL_EXPRESSION_CONTENT
   */
  parseDslExpression() {
    const identifier = this.expect(T.DSL_EXPRESSION_START).value;
    const content = this.expect(T.DSL_EXPRESSION_CONTENT).value; // includes backticks
    return { type: 'DslExpressionValue', identifier, value: content.slice(1, -1), raw: content };
  }

  /**
   * ValueUnset = '>'
   */
  parseValueUnset() {
    this.expect(T.UNSET);
    return { type: 'ValueUnset' };
  }

  /**
   * ValueCopy = '<' '.'? ObjectPath
   */
  parseValueCopy() {
    this.expect(T.COPY);
    this.lexer.accept(T.SPACE);
    const isRelative = this.lazyExpect(T.DOT);
    const path = this.parseObjectPath();
    return { type: 'ValueCopy', path, isRelative };
  }

  /**
   * Block = '{' StatementList '}'
   */
  parseBlock() {
    this.expect(T.LBRACE);
    this.parseEndOfStatement();
    const body = this.parseStatementList(T.RBRACE);
    this.expect(T.RBRACE);
    return { type: 'Block', body };
  }

  /**
   * EndOfStatement = SmallGap ( EOF / NEWLINE )
   */
  parseEndOfStatement() {
    this.smallGap();
    if (this.peek(T.EOF)) return;
    if (this.peek(T.NEWLINE)) { this.lexer.accept(T.NEWLINE); return; }
    if (this.peek(T.RBRACE)) return; // allow end of block without trailing newline

    const got = this.lexer.remaining.slice(0, 20).replace(/\n/g, '\\n');
    throw new SyntaxError(`Expected end of statement (newline or EOF), got: "${got}"`);
  }
}

// -------------------------------------------------------------------------
// Public parse function (Prettier entry point)
// -------------------------------------------------------------------------

export function parse(text) {
  const parser = new Parser(text);
  const ast = parser.parseFusionFile();
  return ast;
}
