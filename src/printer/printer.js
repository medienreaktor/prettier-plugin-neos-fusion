/**
 * Prettier printer for Fusion AST nodes.
 *
 * Uses Prettier's doc builders to produce formatted output.
 * Reference: https://prettier.io/docs/en/plugins.html#print
 */

import { doc } from 'prettier';
const { hardline, indent, join, group } = doc.builders;

export function print(path, options, printFn) {
  const node = path.node;

  switch (node.type) {
    case 'FusionFile':
      return printFusionFile(path, printFn);

    case 'StatementList':
      return printStatementList(path, printFn);

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
  return `include: ${node.filePattern}`;
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
