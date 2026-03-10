import { parse } from "./parser/parser.js";
import { print, embed } from "./printer/printer.js";

export const languages = [
  {
    name: "Fusion",
    parsers: ["fusion"],
    extensions: [".fusion"],
    vscodeLanguageIds: ["fusion"],
  },
];

export const parsers = {
  fusion: {
    parse,
    astFormat: "fusion-ast",
    locStart: (node) => node.start ?? 0,
    locEnd: (node) => node.end ?? 0,
  },
};

export const printers = {
  "fusion-ast": {
    print,
    embed,
  },
};
