// Token type constants — mirrored from Neos\Fusion\Core\ObjectTreeParser\Token

export const T = {
  EOF: 'EOF',

  SLASH_COMMENT: 'SLASH_COMMENT',   // // ...
  HASH_COMMENT: 'HASH_COMMENT',     // # ...
  MULTILINE_COMMENT: 'MULTILINE_COMMENT', // /* ... */

  SPACE: 'SPACE',     // [ \t]+
  NEWLINE: 'NEWLINE', // [\n\r]+

  INCLUDE: 'INCLUDE', // include\s*:

  META_PATH_START: 'META_PATH_START',   // @
  OBJECT_PATH_PART: 'OBJECT_PATH_PART', // [a-zA-Z0-9_:-]+
  PROTOTYPE_START: 'PROTOTYPE_START',   // prototype(

  ASSIGNMENT: 'ASSIGNMENT', // =
  COPY: 'COPY',             // <
  UNSET: 'UNSET',           // >

  FUSION_OBJECT_NAME: 'FUSION_OBJECT_NAME', // Vendor.Package:Something

  TRUE_VALUE: 'TRUE_VALUE',   // true | TRUE
  FALSE_VALUE: 'FALSE_VALUE', // false | FALSE
  NULL_VALUE: 'NULL_VALUE',   // null | NULL

  INTEGER: 'INTEGER', // -?[0-9]+
  FLOAT: 'FLOAT',     // -?[0-9]+\.[0-9]+

  STRING_DOUBLE_QUOTED: 'STRING_DOUBLE_QUOTED', // "..."
  STRING_SINGLE_QUOTED: 'STRING_SINGLE_QUOTED', // '...'

  EEL_EXPRESSION: 'EEL_EXPRESSION',         // ${...}
  DSL_EXPRESSION_START: 'DSL_EXPRESSION_START', // afx (identifier before backtick)
  DSL_EXPRESSION_CONTENT: 'DSL_EXPRESSION_CONTENT', // `...`

  FILE_PATTERN: 'FILE_PATTERN', // [a-zA-Z0-9.*:/_-]+

  DOT: 'DOT',     // .
  COLON: 'COLON', // :
  RPAREN: 'RPAREN', // )
  LBRACE: 'LBRACE', // {
  RBRACE: 'RBRACE', // }
};

// Ordered token rules — order matters: first match wins (as in the PHP lexer)
export const TOKEN_RULES = [
  // Comments (must come before SLASH which could be confused)
  [T.SLASH_COMMENT,   /^\/\/.*/],
  [T.HASH_COMMENT,    /^#.*/],
  [T.MULTILINE_COMMENT, /^\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//],

  // Whitespace
  [T.NEWLINE, /^[\n\r]/],
  [T.SPACE,   /^[ \t]+/],

  // Keywords (before OBJECT_PATH_PART so they win)
  [T.TRUE_VALUE,  /^(?:true|TRUE)\b/],
  [T.FALSE_VALUE, /^(?:false|FALSE)\b/],
  [T.NULL_VALUE,  /^(?:null|NULL)\b/],

  // Numbers (FLOAT before INTEGER so longer match wins)
  [T.FLOAT,   /^-?[0-9]+\.[0-9]+/],
  [T.INTEGER, /^-?[0-9]+/],

  // DSL (identifier immediately followed by backtick — must precede FUSION_OBJECT_NAME)
  [T.DSL_EXPRESSION_START, /^[a-zA-Z0-9.]+(?=`)/],
  [T.DSL_EXPRESSION_CONTENT, /^`[^`]*`/],

  // EEL expression ${...} — handles nested braces and quoted strings
  [T.EEL_EXPRESSION, /^\$\{(?:[^{}"']|\{(?:[^{}"']|\{[^}]*\})*\}|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*\}/],

  // Fusion object type (Vendor.Package:Type — must precede INCLUDE and OBJECT_PATH_PART)
  [T.FUSION_OBJECT_NAME, /^[0-9a-zA-Z.]+:[0-9a-zA-Z.]+/],

  // Include keyword
  [T.INCLUDE, /^include\s*:/],

  // Path segments
  [T.PROTOTYPE_START, /^prototype\(/],
  [T.META_PATH_START, /^@/],
  [T.OBJECT_PATH_PART, /^[a-zA-Z0-9_:-]+/],

  // Operators
  [T.ASSIGNMENT, /^=/],
  [T.COPY,       /^</],
  [T.UNSET,      /^>/],

  // Symbols
  [T.DOT,    /^\./],
  [T.COLON,  /^:/],
  [T.RPAREN, /^\)/],
  [T.LBRACE, /^\{/],
  [T.RBRACE, /^\}/],

  // Strings
  [T.STRING_DOUBLE_QUOTED, /^"[^"\\]*(?:\\.[^"\\]*)*"/],
  [T.STRING_SINGLE_QUOTED, /^'[^'\\]*(?:\\.[^'\\]*)*'/],

  // File patterns (for include statements)
  [T.FILE_PATTERN, /^[a-zA-Z0-9.*:/_-]+/],
];
