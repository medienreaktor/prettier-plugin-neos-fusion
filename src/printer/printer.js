/**
 * Prettier printer for Fusion AST nodes.
 *
 * Uses Prettier's doc builders to produce formatted output.
 * Reference: https://prettier.io/docs/en/plugins.html#print
 */

import { doc } from 'prettier';
const { hardline, indent, join, group } = doc.builders;

/**
 * Embed handler: format AFX content using Prettier's babel (JSX) parser.
 * Multi-root AFX is wrapped in a JSX fragment for formatting, then unwrapped.
 * Single-line AFX and non-afx DSL fall back to the regular print function.
 */
export function embed(path, options) {
  const node = path.node;
  if (node.type !== 'DslExpressionValue' || node.identifier !== 'afx') {
    return undefined;
  }

  return async () => {
    // Single-line AFX stays as-is (handled by regular print)
    if (!node.value.includes('\n')) return undefined;

    try {
      const { format } = await import('prettier');

      // Build a placeholder map for all JSX-invalid constructs, with a shared counter
      // so the prefixes NeosCmp/neosAt never collide.
      const replacements = new Map(); // original → placeholder
      let ctr = 0;

      const sanitized = node.value
        // 1. Tag names: Vendor.Package:Type → NeosCmp0
        .replace(/(<\/?)([A-Za-z][A-Za-z0-9.]*:[A-Za-z0-9.]+)/g, (_, prefix, name) => {
          if (!replacements.has(name)) replacements.set(name, `NeosCmp${ctr++}`);
          return prefix + replacements.get(name);
        })
        // 2. @meta attributes: @if, @apply, @class → neosAt0
        //    Match only at attribute-name position (preceded by whitespace or <)
        .replace(/(?<=[\s<])@([a-zA-Z][a-zA-Z0-9]*)(?=[\s=\/>{])/g, (_, name) => {
          const key = `@${name}`;
          if (!replacements.has(key)) replacements.set(key, `neosAt${ctr++}`);
          return replacements.get(key);
        })
        // 3. Namespaced attributes: attributes.class, attributes.href → neosAt
        //    Require single = (not ==) so JS comparisons like props.layout == '...' are skipped
        .replace(/(?<=[\s<])([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z][a-zA-Z0-9]*)(?=\s*=(?![=>]))/g, (match) => {
          if (!replacements.has(match)) replacements.set(match, `neosAt${ctr++}`);
          return replacements.get(match);
        })
        // 4. Colon-prefixed bindings (Vue/Alpine): :class, :href → neosAt
        //    Must be followed by = to avoid matching inside string values
        .replace(/(?<=[\s<]):([a-zA-Z][a-zA-Z0-9-]*)(?=\s*=)/g, (_, name) => {
          const key = `:${name}`;
          if (!replacements.has(key)) replacements.set(key, `neosAt${ctr++}`);
          return replacements.get(key);
        })
        // 5. Colon-in-name attributes (Alpine x-on:click, HTMX hx-on:htmx:before) → neosAt
        //    Must be followed by = (not ==) to avoid matching Tailwind classes inside strings
        .replace(/(?<=[\s<])([a-zA-Z][a-zA-Z0-9-]*:[a-zA-Z][a-zA-Z0-9-]*)(?=\s*=(?![=>]))/g, (match) => {
          if (!replacements.has(match)) replacements.set(match, `neosAt${ctr++}`);
          return replacements.get(match);
        });

      const reverseMap = new Map([...replacements].map(([k, v]) => [v, k]));

      // Wrap in a JSX fragment so multi-root content is valid babel/JSX input
      const formatted = await format(`<>\n${sanitized}\n</>`, {
        parser: 'babel',
        printWidth: options.printWidth,
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
      });

      // Strip the outer fragment wrapper (<> ... </>;)
      const rawInner = formatted
        .replace(/^<>\s*\n/, '')
        .replace(/\n\s*<\/>\s*;?\s*\n?$/, '');

      if (!rawInner.trim()) return undefined;

      // Restore all original Neos constructs
      const inner = rawInner.replace(/(?:NeosCmp|neosAt)\d+/g, (m) => reverseMap.get(m) ?? m);

      // Strip the common minimum indentation so content starts at column 0,
      // then let indent() place it one level deeper than the surrounding context.
      const lines = inner.split('\n');
      const nonEmpty = lines.filter((l) => l.trim() !== '');
      const minIndent = nonEmpty.length > 0
        ? Math.min(...nonEmpty.map((l) => l.match(/^(\s*)/)[1].length))
        : 0;
      const stripped = lines.map((l) => l.slice(minIndent));

      return [
        'afx`',
        indent([hardline, join(hardline, stripped)]),
        hardline,
        '`',
      ];
    } catch {
      return undefined; // fall back to regular print
    }
  };
}

export function print(path, options, printFn) {
  const node = path.node;

  switch (node.type) {
    case 'FusionFile':
      return printFusionFile(path, printFn);

    case 'StatementList':
      return printStatementList(path, printFn);

    case 'CommentStatement':
      return node.value;

    case 'IncludeStatement':
      return printIncludeStatement(node);

    case 'ObjectStatement':
      return printObjectStatement(path, printFn);

    case 'ObjectPath':
      return printObjectPath(path, printFn);

    case 'PrototypePathSegment':
      return `prototype(${node.name})`;

    case 'MetaPathSegment':
      return `@${node.key}`;

    case 'PathSegment':
      return node.quoted ? `'${node.key}'` : node.key;

    case 'ValueAssignment':
      return printValueAssignment(path, printFn);

    case 'ValueCopy':
      return printValueCopy(node);

    case 'ValueUnset':
      return '>';

    case 'Block':
      return printBlock(path, printFn);

    // Values
    case 'StringValue':
      return printStringValue(node);

    case 'FusionObjectValue':
      return node.value;

    case 'DslExpressionValue':
      return printDslExpressionValue(node, options.tabWidth ?? 2);

    case 'EelExpressionValue':
      return `\${${node.value}}`;

    case 'FloatValue':
      return String(node.value);

    case 'IntValue':
      return String(node.value);

    case 'BoolValue':
      return node.value ? 'true' : 'false';

    case 'NullValue':
      return 'null';

    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

// -------------------------------------------------------------------------
// Node printers
// -------------------------------------------------------------------------

function printFusionFile(path, printFn) {
  const node = path.node;
  if (!node.body.statements.length) return '';
  return [path.call(printFn, 'body'), hardline];
}

function printStatementList(path, printFn) {
  const node = path.node;
  if (!node.statements.length) return '';

  const parts = [];
  node.statements.forEach((stmt, i) => {
    if (i > 0 && stmt.hasLeadingBlankLine) {
      parts.push(hardline);
    }
    parts.push(path.call(printFn, 'statements', i));
    if (i < node.statements.length - 1) parts.push(hardline);
  });

  return parts;
}

function printIncludeStatement(node) {
  const base = `include: ${node.filePattern}`;
  return node.trailingComment ? `${base} ${node.trailingComment}` : base;
}

function printObjectStatement(path, printFn) {
  const node = path.node;
  const parts = [path.call(printFn, 'path')];

  if (node.operation) {
    parts.push(' ', path.call(printFn, 'operation'));
  }

  if (node.block) {
    parts.push(' ', path.call(printFn, 'block'));
  }

  if (node.trailingComment) {
    parts.push(' ', node.trailingComment);
  }

  return parts;
}

function printObjectPath(path, printFn) {
  return join('.', path.map(printFn, 'segments'));
}

function printValueAssignment(path, printFn) {
  return ['= ', path.call(printFn, 'value')];
}

function printValueCopy(node) {
  const parts = ['< '];
  if (node.isRelative) parts.push('.');
  parts.push(printObjectPathNode(node.path));
  return parts;
}

function printObjectPathNode(pathNode) {
  return pathNode.segments.map(printSegmentNode).join('.');
}

function printSegmentNode(seg) {
  if (seg.type === 'PrototypePathSegment') return `prototype(${seg.name})`;
  if (seg.type === 'MetaPathSegment') return `@${seg.key}`;
  return seg.quoted ? `'${seg.key}'` : seg.key;
}

function printBlock(path, printFn) {
  const node = path.node;
  if (!node.body.statements.length) return '{}';

  return group([
    '{',
    indent([hardline, path.call(printFn, 'body')]),
    hardline,
    '}',
  ]);
}

function printStringValue(node) {
  const escaped = node.value.replace(/'/g, "\\'");
  return `'${escaped}'`;
}

function printDslExpressionValue(node, tabWidth) {
  const lines = node.value.split('\n');

  // The first line (after opening backtick) and last line (before closing backtick)
  // are typically just whitespace — remove them to get the actual content lines.
  const firstEmpty = lines[0].trim() === '';
  const lastEmpty = lines[lines.length - 1].trim() === '';
  const contentLines = lines.slice(firstEmpty ? 1 : 0, lastEmpty ? -1 : undefined);

  // Inline DSL with no newlines — keep on one line
  if (contentLines.length === 0 || (contentLines.length === 1 && !firstEmpty && !lastEmpty)) {
    return `${node.identifier}\`${node.value}\``;
  }

  // Find minimum indentation of non-empty lines to strip the original base indent
  const nonEmpty = contentLines.filter((l) => l.trim() !== '');
  const minIndent = nonEmpty.length > 0
    ? Math.min(...nonEmpty.map((l) => l.match(/^([ \t]*)/)[1].length))
    : 0;

  // Strip the common base indent; relative indentation within lines is preserved as literals.
  // Then prepend exactly one tabWidth of spaces so depth is always: current level + 1,
  // regardless of Prettier's indent stack (avoids doubling when tabWidth differs).
  const pad = ' '.repeat(tabWidth);
  const normalized = contentLines.map((l) => {
    const stripped = l.length >= minIndent ? l.slice(minIndent) : l.trimStart();
    return stripped ? pad + stripped : '';
  });

  // Use hardline (not indent()) so Prettier's indent stack doesn't add extra depth.
  // The current indentation level is handled by the surrounding block's indent().
  return [
    `${node.identifier}\``,
    hardline,
    join(hardline, normalized),
    hardline,
    '`',
  ];
}
