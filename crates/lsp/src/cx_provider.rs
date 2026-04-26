// cx_provider — CX language hover, completion, and diagnostics
//
// Implements LSP-like provider functions for the CX compute language.
// The CX language currently supports: let bindings, arithmetic (+, -, *, /, %),
// equality (==), and parenthesized expressions.  The Monarch grammar in
// monarch_cx.ts extends this with aspirational keywords/types for syntax
// highlighting; those appear here as completion items so the editor surfaces
// them as forward-looking scaffolding without requiring the lexer/parser to
// understand them yet.

use pccx_cx::{CxError, Lexer, Token};

use crate::{Completion, CompletionSource, Diagnostic, DiagnosticSeverity, Hover, SourcePos, SourceRange};

// ─── Keyword and type tables ────────────────────────────────────────────────
//
// Mirrored from monarch_cx.ts so hover descriptions and completion docs stay
// consistent with the syntax-highlighting token classes.

/// CX language keywords with descriptions.
static CX_KEYWORDS: &[(&str, &str, &str)] = &[
    ("let",     "keyword", "Bind a name to a value: `let name = expr`"),
    ("fn",      "keyword", "Function definition (planned)"),
    ("return",  "keyword", "Return value from a function (planned)"),
    ("if",      "keyword", "Conditional branch (planned)"),
    ("else",    "keyword", "Else branch (planned)"),
    ("for",     "keyword", "For loop (planned)"),
    ("while",   "keyword", "While loop (planned)"),
    ("core",    "keyword", "Hardware core identifier (planned)"),
    ("in",      "keyword", "Input port qualifier (planned)"),
    ("out",     "keyword", "Output port qualifier (planned)"),
    ("isa",     "keyword", "Instruction-set reference (planned)"),
    ("compute", "keyword", "Compute block declaration (planned)"),
    ("matrix",  "keyword", "Matrix literal / type (planned)"),
    ("pipe",    "keyword", "Pipeline stage chain declaration (planned)"),
    ("stage",   "keyword", "Single pipeline stage (planned)"),
    ("import",  "keyword", "Module import (planned)"),
    ("from",    "keyword", "Import source path qualifier (planned)"),
    ("as",      "keyword", "Alias in import (planned)"),
    ("pub",     "keyword", "Public visibility qualifier (planned)"),
    ("struct",  "keyword", "Struct type definition (planned)"),
    ("enum",    "keyword", "Enum type definition (planned)"),
    ("type",    "keyword", "Type alias (planned)"),
    ("const",   "keyword", "Compile-time constant (planned)"),
    ("mut",     "keyword", "Mutable binding (planned)"),
];

/// CX built-in types with descriptions.
static CX_TYPES: &[(&str, &str)] = &[
    ("i4",   "4-bit signed integer (NPU INT4 quantized)"),
    ("i8",   "8-bit signed integer"),
    ("i16",  "16-bit signed integer"),
    ("i32",  "32-bit signed integer"),
    ("i64",  "64-bit signed integer"),
    ("f16",  "16-bit floating-point (half precision)"),
    ("f32",  "32-bit floating-point (single precision)"),
    ("f64",  "64-bit floating-point (double precision)"),
    ("bool", "Boolean true/false"),
    ("void", "No value"),
    ("unit", "Unit type — equivalent to ()"),
];

/// Snippet templates for common CX patterns.
static CX_SNIPPETS: &[(&str, &str, &str)] = &[
    (
        "let_binding",
        "let binding",
        "let ${1:name} = ${2:value}",
    ),
    (
        "pipe_stage",
        "pipe/stage block (planned)",
        "pipe ${1:name} {\n    stage ${2:s0} {\n        $0\n    }\n}",
    ),
    (
        "compute_block",
        "compute block (planned)",
        "compute ${1:name}(${2:inputs}) -> ${3:output} {\n    $0\n}",
    ),
    (
        "fn_decl",
        "function declaration (planned)",
        "fn ${1:name}(${2:args}) -> ${3:type} {\n    $0\n}",
    ),
];

// ─── Word extraction ─────────────────────────────────────────────────────────

struct WordAtPos {
    text: String,
    range: SourceRange,
}

/// Extracts the identifier under the cursor on `pos.line`, `pos.character`.
/// Returns `None` when the cursor is on whitespace or out of range.
fn extract_word_at(source: &str, pos: SourcePos) -> Option<WordAtPos> {
    let line_str = source.lines().nth(pos.line as usize)?;
    let col = pos.character as usize;

    if col >= line_str.len() {
        return None;
    }

    let bytes = line_str.as_bytes();
    if !is_ident_byte(bytes[col]) {
        return None;
    }

    let mut start = col;
    while start > 0 && is_ident_byte(bytes[start - 1]) {
        start -= 1;
    }

    let mut end = col;
    while end < bytes.len() && is_ident_byte(bytes[end]) {
        end += 1;
    }

    let text = line_str[start..end].to_string();
    if text.is_empty() {
        return None;
    }

    Some(WordAtPos {
        text,
        range: SourceRange {
            start: SourcePos { line: pos.line, character: start as u32 },
            end:   SourcePos { line: pos.line, character: end   as u32 },
        },
    })
}

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

// ─── Scope analysis ──────────────────────────────────────────────────────────

/// Collects every `let`-bound name from `source` that appears before
/// the given line, using the CX lexer.  Returns a deduplicated list.
/// Silently drops any lexer error — partial source must not crash the IDE.
fn collect_let_bindings(source: &str, before_line: usize) -> Vec<String> {
    // Only lex up to the cursor line so we do not complete names defined below.
    let truncated: String = source
        .lines()
        .take(before_line + 1)
        .collect::<Vec<_>>()
        .join("\n");

    let mut lexer = Lexer::new(&truncated);
    let tokens = match lexer.tokenize() {
        Ok(t) => t,
        Err(_) => return Vec::new(),
    };

    let mut names = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut i = 0;
    while i < tokens.len() {
        if tokens[i] == Token::Let {
            // Next non-newline token should be the bound identifier.
            if let Some(Token::Ident(name)) = tokens.get(i + 1) {
                if seen.insert(name.clone()) {
                    names.push(name.clone());
                }
            }
        }
        i += 1;
    }
    names
}

// ─── Public API ──────────────────────────────────────────────────────────────

/// Returns hover information for the token under the cursor.
///
/// Priority:
/// 1. Built-in types (i4, i8, f16, …)
/// 2. CX keywords (let, fn, pipe, …)
/// 3. User-defined `let`-bound identifiers visible at this line
pub fn cx_hover(source: &str, line: usize, col: usize) -> Option<Hover> {
    let pos = SourcePos { line: line as u32, character: col as u32 };
    let word = extract_word_at(source, pos)?;

    // Check built-in types first.
    for &(name, desc) in CX_TYPES {
        if word.text == name {
            return Some(Hover {
                contents: format!("**`{}`** — {}", name, desc),
                range: Some(word.range),
            });
        }
    }

    // Check keywords.
    for &(kw, _, desc) in CX_KEYWORDS {
        if word.text == kw {
            return Some(Hover {
                contents: format!("**`{}`** — {}", kw, desc),
                range: Some(word.range),
            });
        }
    }

    // Check user-defined let bindings visible at this position.
    let bindings = collect_let_bindings(source, line);
    if bindings.contains(&word.text) {
        // Try to find the bound value by scanning for `let name = <value>`.
        let value_hint = find_binding_value(source, &word.text);
        let contents = match value_hint {
            Some(v) => format!("`let {} = {}`", word.text, v),
            None    => format!("`{}` — let binding", word.text),
        };
        return Some(Hover { contents, range: Some(word.range) });
    }

    None
}

/// Scans source for `let name = <expr>` and returns the raw expression text
/// as a display hint.  Returns the first match; undefined names return None.
fn find_binding_value(source: &str, name: &str) -> Option<String> {
    for line in source.lines() {
        let trimmed = line.trim();
        // Simple prefix match: `let <name> = ...`
        if let Some(rest) = trimmed.strip_prefix("let ") {
            if let Some(expr_part) = rest.strip_prefix(name) {
                if let Some(val) = expr_part.trim_start().strip_prefix('=') {
                    let v = val.trim();
                    if !v.is_empty() {
                        // Strip trailing comment if any.
                        let v = v.split("//").next().unwrap_or(v).trim();
                        return Some(v.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Returns completion items for the cursor position.
///
/// Always includes:
/// - All CX keywords
/// - All built-in types
/// - Snippet templates
/// - User-defined let bindings visible before the cursor
pub fn cx_completions(source: &str, line: usize, _col: usize) -> Vec<Completion> {
    let mut items = Vec::new();

    // Keywords.
    for &(kw, _, desc) in CX_KEYWORDS {
        items.push(Completion {
            label:         kw.to_string(),
            detail:        Some(desc.to_string()),
            documentation: None,
            insert_text:   kw.to_string(),
            source:        CompletionSource::Lsp,
        });
    }

    // Built-in types.
    for &(ty, desc) in CX_TYPES {
        items.push(Completion {
            label:         ty.to_string(),
            detail:        Some(desc.to_string()),
            documentation: None,
            insert_text:   ty.to_string(),
            source:        CompletionSource::Lsp,
        });
    }

    // Snippets.
    for &(label, detail, insert) in CX_SNIPPETS {
        items.push(Completion {
            label:         label.to_string(),
            detail:        Some(detail.to_string()),
            documentation: None,
            insert_text:   insert.to_string(),
            source:        CompletionSource::Lsp,
        });
    }

    // User-defined let bindings visible at this line.
    for name in collect_let_bindings(source, line) {
        items.push(Completion {
            label:         name.clone(),
            detail:        Some("let binding".to_string()),
            documentation: None,
            insert_text:   name,
            source:        CompletionSource::Lsp,
        });
    }

    items
}

/// Runs the CX lexer and parser over `source` and returns LSP diagnostics.
///
/// Position accuracy: the CX lexer/parser do not currently track line/column,
/// so all diagnostics use a fallback range of (0,0)..(0, last_line_len).
/// This gives visible squiggles on line 1 until position tracking is added.
pub fn cx_diagnostics(source: &str) -> Vec<Diagnostic> {
    // Determine the length of the first non-empty line for the fallback range.
    let first_line_len = source
        .lines()
        .next()
        .map(|l| l.len() as u32)
        .unwrap_or(0);

    let fallback_range = SourceRange {
        start: SourcePos { line: 0, character: 0 },
        end:   SourcePos { line: 0, character: first_line_len },
    };

    // Lex first.
    let mut lexer = Lexer::new(source);
    let tokens = match lexer.tokenize() {
        Ok(t) => t,
        Err(CxError::Parse(msg)) => {
            return vec![Diagnostic {
                range:    fallback_range,
                severity: DiagnosticSeverity::Error,
                message:  msg,
                source:   Some("pccx-cx".to_string()),
            }];
        }
        Err(CxError::Runtime(msg)) => {
            return vec![Diagnostic {
                range:    fallback_range,
                severity: DiagnosticSeverity::Error,
                message:  msg,
                source:   Some("pccx-cx".to_string()),
            }];
        }
    };

    // Parse.
    let mut parser = pccx_cx::Parser::new(tokens);
    match parser.parse() {
        Ok(_) => Vec::new(),
        Err(CxError::Parse(msg)) => vec![Diagnostic {
            range:    fallback_range,
            severity: DiagnosticSeverity::Error,
            message:  msg,
            source:   Some("pccx-cx".to_string()),
        }],
        Err(CxError::Runtime(msg)) => vec![Diagnostic {
            range:    fallback_range,
            severity: DiagnosticSeverity::Error,
            message:  msg,
            source:   Some("pccx-cx".to_string()),
        }],
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── cx_hover ────────────────────────────────────────────────────────────

    #[test]
    fn hover_on_let_keyword() {
        let src = "let x = 5";
        let h = cx_hover(src, 0, 0).expect("hover on let");
        assert!(h.contents.contains("let"), "must mention 'let'");
    }

    #[test]
    fn hover_on_builtin_type_i4() {
        let src = "i4";
        let h = cx_hover(src, 0, 0).expect("hover on i4");
        assert!(h.contents.contains("i4"), "must mention i4");
        assert!(h.contents.to_lowercase().contains("int") || h.contents.contains("4-bit"),
            "must describe type");
    }

    #[test]
    fn hover_on_user_binding_shows_value() {
        let src = "let speed = 42\nspeed";
        let h = cx_hover(src, 1, 0).expect("hover on binding");
        assert!(h.contents.contains("speed"));
    }

    #[test]
    fn hover_on_whitespace_returns_none() {
        let src = "let x = 5";
        assert!(cx_hover(src, 0, 3).is_none(), "space should return None");
    }

    #[test]
    fn hover_on_unknown_ident_returns_none() {
        let src = "unknown_var";
        assert!(cx_hover(src, 0, 0).is_none());
    }

    #[test]
    fn hover_on_pipe_keyword() {
        let src = "pipe";
        let h = cx_hover(src, 0, 0).expect("hover on pipe");
        assert!(h.contents.contains("pipe"));
    }

    #[test]
    fn hover_on_f16_type() {
        let src = "f16";
        let h = cx_hover(src, 0, 0).expect("hover on f16");
        assert!(h.contents.contains("f16"));
        assert!(h.contents.contains("16") || h.contents.to_lowercase().contains("float"));
    }

    #[test]
    fn hover_range_covers_word() {
        let src = "let x = 5";
        let h = cx_hover(src, 0, 0).expect("hover returns Some");
        let r = h.range.expect("range must be set");
        // "let" starts at char 0, ends at char 3
        assert_eq!(r.start.character, 0);
        assert_eq!(r.end.character, 3);
    }

    // ─── cx_completions ──────────────────────────────────────────────────────

    #[test]
    fn completions_include_let_keyword() {
        let items = cx_completions("", 0, 0);
        let labels: Vec<&str> = items.iter().map(|c| c.label.as_str()).collect();
        assert!(labels.contains(&"let"), "must contain 'let'");
    }

    #[test]
    fn completions_include_builtin_types() {
        let items = cx_completions("", 0, 0);
        let labels: Vec<&str> = items.iter().map(|c| c.label.as_str()).collect();
        assert!(labels.contains(&"i4"),  "must contain i4");
        assert!(labels.contains(&"f16"), "must contain f16");
        assert!(labels.contains(&"bool"), "must contain bool");
    }

    #[test]
    fn completions_include_snippets() {
        let items = cx_completions("", 0, 0);
        let labels: Vec<&str> = items.iter().map(|c| c.label.as_str()).collect();
        assert!(labels.contains(&"let_binding"), "must contain let_binding snippet");
    }

    #[test]
    fn completions_include_user_bindings() {
        let src = "let speed = 42\nlet power = 100\n";
        let items = cx_completions(src, 2, 0);
        let labels: Vec<&str> = items.iter().map(|c| c.label.as_str()).collect();
        assert!(labels.contains(&"speed"), "must contain user binding 'speed'");
        assert!(labels.contains(&"power"), "must contain user binding 'power'");
    }

    #[test]
    fn completions_do_not_include_bindings_defined_after_cursor() {
        let src = "let x = 1\nlet y = 2\nlet z = 3\n";
        // Cursor at line 1 — only x and y are in scope (line 2 is the cursor line).
        let items = cx_completions(src, 1, 0);
        let labels: Vec<&str> = items.iter().map(|c| c.label.as_str()).collect();
        assert!(labels.contains(&"x"));
        assert!(labels.contains(&"y"));
        // z is defined on line 2, beyond the cursor line 1.
        assert!(!labels.contains(&"z"), "z defined after cursor must not appear");
    }

    #[test]
    fn all_completions_have_detail() {
        let items = cx_completions("", 0, 0);
        for item in &items {
            assert!(
                item.detail.is_some(),
                "completion '{}' must have detail",
                item.label
            );
        }
    }

    // ─── cx_diagnostics ──────────────────────────────────────────────────────

    #[test]
    fn valid_program_produces_no_diagnostics() {
        let src = "let x = 5\nlet y = x + 3\ny";
        let diags = cx_diagnostics(src);
        assert!(diags.is_empty(), "valid CX must have no diagnostics");
    }

    #[test]
    fn empty_source_produces_no_diagnostics() {
        assert!(cx_diagnostics("").is_empty());
    }

    #[test]
    fn invalid_program_produces_error_diagnostic() {
        // Unclosed paren triggers a parse error.
        let diags = cx_diagnostics("let x = (1 + 2");
        assert!(!diags.is_empty(), "invalid CX must produce at least one diagnostic");
        assert_eq!(diags[0].severity, DiagnosticSeverity::Error);
        assert!(diags[0].source.as_deref() == Some("pccx-cx"));
    }

    #[test]
    fn diagnostic_range_falls_back_to_line_zero() {
        let diags = cx_diagnostics("let x = (missing");
        assert!(!diags.is_empty());
        assert_eq!(diags[0].range.start.line, 0);
    }

    // ─── collect_let_bindings ─────────────────────────────────────────────────

    #[test]
    fn collect_bindings_finds_multiple_lets() {
        let src = "let a = 1\nlet b = 2\nlet c = 3\n";
        let bindings = collect_let_bindings(src, 3);
        assert!(bindings.contains(&"a".to_string()));
        assert!(bindings.contains(&"b".to_string()));
        assert!(bindings.contains(&"c".to_string()));
    }

    #[test]
    fn collect_bindings_deduplicates() {
        let src = "let x = 1\nlet x = 2\n";
        let bindings = collect_let_bindings(src, 2);
        assert_eq!(bindings.iter().filter(|n| n.as_str() == "x").count(), 1);
    }
}
