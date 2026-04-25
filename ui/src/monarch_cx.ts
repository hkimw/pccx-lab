// ─── Monarch CX tokenizer ────────────────────────────────────────────────────
// Minimal Monarch grammar for the CX hardware-bound compute language (.cx).
// Registered via monaco.languages.setMonarchTokensProvider in CodeEditor.tsx.
//
// Reference:
//   https://microsoft.github.io/monaco-editor/monarch.html

import type { languages } from "monaco-editor";

export const monarchCx: languages.IMonarchLanguage = {
    defaultToken: "",
    tokenPostfix: ".cx",

    keywords: [
        "let", "fn", "return", "if", "else", "for", "while",
        "core", "in", "out", "isa", "compute", "matrix",
        "pipe", "stage", "import", "from", "as", "pub",
        "struct", "enum", "type", "const", "mut",
    ],

    typeKeywords: [
        "i4", "i8", "i16", "i32", "i64",
        "f16", "f32", "f64",
        "bool", "void", "unit",
    ],

    operators: [
        "=", ">", "<", "!", "==", "<=", ">=", "!=",
        "+", "-", "*", "/", "%", "@",
        "&&", "||", "->", "=>",
    ],

    symbols: /[=><!~?:&|+\-*\/\^%@]+/,

    tokenizer: {
        root: [
            [/\/\/.*$/, "comment"],
            [/[a-zA-Z_]\w*/, {
                cases: {
                    "@keywords": "keyword",
                    "@typeKeywords": "type",
                    "@default": "identifier",
                },
            }],
            [/\d+\.\d*/, "number.float"],
            [/\d+/, "number"],
            [/"[^"]*"/, "string"],
            [/[{}()\[\]]/, "@brackets"],
            [/@symbols/, {
                cases: {
                    "@operators": "operator",
                    "@default": "",
                },
            }],
        ],
    },
};

export const cxLanguageConfig: languages.LanguageConfiguration = {
    comments: { lineComment: "//" },
    brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
    ],
    autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
    ],
    surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
    ],
};
