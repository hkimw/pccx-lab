// CX language core — lexer, parser, evaluator
// Compute eXtensions: a hardware-bound language for NPU/accelerator design.

use std::collections::HashMap;

// ─── Error ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub enum CxError {
    Parse(String),
    Runtime(String),
}

impl std::fmt::Display for CxError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            CxError::Parse(s) => write!(f, "parse error: {}", s),
            CxError::Runtime(s) => write!(f, "runtime error: {}", s),
        }
    }
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    // Literals
    Int(i64),
    Float(f64),
    Ident(String),
    // Keywords
    Let,
    // Operators
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    Eq,   // =
    EqEq, // ==
    LParen,
    RParen,
    // Structure
    Newline,
    Eof,
}

// ─── Lexer ───────────────────────────────────────────────────────────────────

pub struct Lexer<'a> {
    src: &'a str,
    pos: usize,
}

impl<'a> Lexer<'a> {
    pub fn new(src: &'a str) -> Self {
        Self { src, pos: 0 }
    }

    pub fn tokenize(&mut self) -> Result<Vec<Token>, CxError> {
        let mut tokens = Vec::new();
        while self.pos < self.src.len() {
            self.skip_whitespace_inline();
            if self.pos >= self.src.len() {
                break;
            }

            let ch = self.current();
            match ch {
                '\n' => {
                    tokens.push(Token::Newline);
                    self.pos += 1;
                }
                '/' if self.peek() == Some('/') => {
                    self.skip_line_comment();
                }
                '+' => {
                    tokens.push(Token::Plus);
                    self.pos += 1;
                }
                '-' => {
                    tokens.push(Token::Minus);
                    self.pos += 1;
                }
                '*' => {
                    tokens.push(Token::Star);
                    self.pos += 1;
                }
                '/' => {
                    tokens.push(Token::Slash);
                    self.pos += 1;
                }
                '%' => {
                    tokens.push(Token::Percent);
                    self.pos += 1;
                }
                '=' if self.peek() == Some('=') => {
                    tokens.push(Token::EqEq);
                    self.pos += 2;
                }
                '=' => {
                    tokens.push(Token::Eq);
                    self.pos += 1;
                }
                '(' => {
                    tokens.push(Token::LParen);
                    self.pos += 1;
                }
                ')' => {
                    tokens.push(Token::RParen);
                    self.pos += 1;
                }
                '0'..='9' => {
                    tokens.push(self.read_number()?);
                }
                'a'..='z' | 'A'..='Z' | '_' => {
                    tokens.push(self.read_ident());
                }
                _ => {
                    self.pos += 1; // skip unknown
                }
            }
        }
        tokens.push(Token::Eof);
        Ok(tokens)
    }

    fn current(&self) -> char {
        self.src.as_bytes()[self.pos] as char
    }

    fn peek(&self) -> Option<char> {
        self.src.as_bytes().get(self.pos + 1).map(|&b| b as char)
    }

    fn skip_whitespace_inline(&mut self) {
        while self.pos < self.src.len() && matches!(self.current(), ' ' | '\t' | '\r') {
            self.pos += 1;
        }
    }

    fn skip_line_comment(&mut self) {
        while self.pos < self.src.len() && self.current() != '\n' {
            self.pos += 1;
        }
    }

    fn read_number(&mut self) -> Result<Token, CxError> {
        let start = self.pos;
        let mut has_dot = false;
        while self.pos < self.src.len()
            && (self.current().is_ascii_digit() || self.current() == '.')
        {
            if self.current() == '.' {
                has_dot = true;
            }
            self.pos += 1;
        }
        let s = &self.src[start..self.pos];
        if has_dot {
            Ok(Token::Float(
                s.parse()
                    .map_err(|_| CxError::Parse(format!("invalid float: {}", s)))?,
            ))
        } else {
            Ok(Token::Int(
                s.parse()
                    .map_err(|_| CxError::Parse(format!("invalid int: {}", s)))?,
            ))
        }
    }

    fn read_ident(&mut self) -> Token {
        let start = self.pos;
        while self.pos < self.src.len()
            && (self.current().is_alphanumeric() || self.current() == '_')
        {
            self.pos += 1;
        }
        let s = &self.src[start..self.pos];
        match s {
            "let" => Token::Let,
            _ => Token::Ident(s.to_string()),
        }
    }
}

// ─── AST ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub enum Expr {
    Int(i64),
    Float(f64),
    Ident(String),
    BinOp {
        op: BinOp,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    UnaryMinus(Box<Expr>),
}

#[derive(Debug, Clone, serde::Serialize)]
pub enum Stmt {
    Let { name: String, value: Expr },
    Expr(Expr),
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Eq,
}

// ─── Parser ──────────────────────────────────────────────────────────────────

pub struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    pub fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, pos: 0 }
    }

    pub fn parse(&mut self) -> Result<Vec<Stmt>, CxError> {
        let mut stmts = Vec::new();
        while !self.at_eof() {
            self.skip_newlines();
            if self.at_eof() {
                break;
            }
            stmts.push(self.parse_stmt()?);
        }
        Ok(stmts)
    }

    fn parse_stmt(&mut self) -> Result<Stmt, CxError> {
        if self.check(&Token::Let) {
            self.advance(); // consume 'let'
            let name = match self.advance() {
                Token::Ident(n) => n,
                t => {
                    return Err(CxError::Parse(format!(
                        "expected identifier after let, got {:?}",
                        t
                    )))
                }
            };
            self.expect(&Token::Eq)?;
            let value = self.parse_expr()?;
            Ok(Stmt::Let { name, value })
        } else {
            Ok(Stmt::Expr(self.parse_expr()?))
        }
    }

    fn parse_expr(&mut self) -> Result<Expr, CxError> {
        self.parse_equality()
    }

    fn parse_equality(&mut self) -> Result<Expr, CxError> {
        let mut left = self.parse_additive()?;
        while self.check(&Token::EqEq) {
            self.advance();
            let right = self.parse_additive()?;
            left = Expr::BinOp {
                op: BinOp::Eq,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_additive(&mut self) -> Result<Expr, CxError> {
        let mut left = self.parse_multiplicative()?;
        while self.check(&Token::Plus) || self.check(&Token::Minus) {
            let op = if self.check(&Token::Plus) {
                BinOp::Add
            } else {
                BinOp::Sub
            };
            self.advance();
            let right = self.parse_multiplicative()?;
            left = Expr::BinOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_multiplicative(&mut self) -> Result<Expr, CxError> {
        let mut left = self.parse_unary()?;
        while self.check(&Token::Star) || self.check(&Token::Slash) || self.check(&Token::Percent)
        {
            let op = if self.check(&Token::Star) {
                BinOp::Mul
            } else if self.check(&Token::Slash) {
                BinOp::Div
            } else {
                BinOp::Mod
            };
            self.advance();
            let right = self.parse_unary()?;
            left = Expr::BinOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Expr, CxError> {
        if self.check(&Token::Minus) {
            self.advance();
            Ok(Expr::UnaryMinus(Box::new(self.parse_primary()?)))
        } else {
            self.parse_primary()
        }
    }

    fn parse_primary(&mut self) -> Result<Expr, CxError> {
        match self.advance() {
            Token::Int(n) => Ok(Expr::Int(n)),
            Token::Float(n) => Ok(Expr::Float(n)),
            Token::Ident(s) => Ok(Expr::Ident(s)),
            Token::LParen => {
                let expr = self.parse_expr()?;
                self.expect(&Token::RParen)?;
                Ok(expr)
            }
            t => Err(CxError::Parse(format!("unexpected token: {:?}", t))),
        }
    }

    // Helpers
    fn at_eof(&self) -> bool {
        self.pos >= self.tokens.len() || self.tokens[self.pos] == Token::Eof
    }

    fn check(&self, t: &Token) -> bool {
        !self.at_eof()
            && std::mem::discriminant(&self.tokens[self.pos]) == std::mem::discriminant(t)
    }

    fn advance(&mut self) -> Token {
        let t = self.tokens[self.pos].clone();
        self.pos += 1;
        t
    }

    fn expect(&mut self, expected: &Token) -> Result<(), CxError> {
        if self.check(expected) {
            self.advance();
            Ok(())
        } else {
            Err(CxError::Parse(format!(
                "expected {:?}, got {:?}",
                expected,
                self.tokens.get(self.pos)
            )))
        }
    }

    fn skip_newlines(&mut self) {
        while !self.at_eof() && self.tokens[self.pos] == Token::Newline {
            self.pos += 1;
        }
    }
}

// ─── Values / Runtime ────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub enum Value {
    Int(i64),
    Float(f64),
    Unit,
}

impl std::fmt::Display for Value {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Value::Int(n) => write!(f, "{}", n),
            Value::Float(n) => write!(f, "{}", n),
            Value::Unit => write!(f, "()"),
        }
    }
}

fn to_f64(v: &Value) -> Option<f64> {
    match v {
        Value::Int(n) => Some(*n as f64),
        Value::Float(f) => Some(*f),
        _ => None,
    }
}

pub struct CxRuntime {
    pub vars: HashMap<String, Value>,
}

impl CxRuntime {
    pub fn new() -> Self {
        Self {
            vars: HashMap::new(),
        }
    }

    pub fn eval_program(&mut self, stmts: &[Stmt]) -> Result<Value, CxError> {
        let mut last = Value::Unit;
        for stmt in stmts {
            last = self.eval_stmt(stmt)?;
        }
        Ok(last)
    }

    fn eval_stmt(&mut self, stmt: &Stmt) -> Result<Value, CxError> {
        match stmt {
            Stmt::Let { name, value } => {
                let v = self.eval_expr(value)?;
                self.vars.insert(name.clone(), v.clone());
                Ok(v)
            }
            Stmt::Expr(e) => self.eval_expr(e),
        }
    }

    fn eval_expr(&self, expr: &Expr) -> Result<Value, CxError> {
        match expr {
            Expr::Int(n) => Ok(Value::Int(*n)),
            Expr::Float(n) => Ok(Value::Float(*n)),
            Expr::Ident(name) => self
                .vars
                .get(name)
                .cloned()
                .ok_or_else(|| CxError::Runtime(format!("undefined variable: {}", name))),
            Expr::UnaryMinus(e) => match self.eval_expr(e)? {
                Value::Int(n) => Ok(Value::Int(-n)),
                Value::Float(n) => Ok(Value::Float(-n)),
                _ => Err(CxError::Runtime("cannot negate non-numeric".into())),
            },
            Expr::BinOp { op, left, right } => {
                let l = self.eval_expr(left)?;
                let r = self.eval_expr(right)?;
                self.apply_binop(*op, l, r)
            }
        }
    }

    fn apply_binop(&self, op: BinOp, l: Value, r: Value) -> Result<Value, CxError> {
        match (&l, &r) {
            (Value::Int(a), Value::Int(b)) => match op {
                BinOp::Add => Ok(Value::Int(a + b)),
                BinOp::Sub => Ok(Value::Int(a - b)),
                BinOp::Mul => Ok(Value::Int(a * b)),
                BinOp::Div => {
                    if *b == 0 {
                        return Err(CxError::Runtime("division by zero".into()));
                    }
                    Ok(Value::Int(a / b))
                }
                BinOp::Mod => {
                    if *b == 0 {
                        return Err(CxError::Runtime("modulo by zero".into()));
                    }
                    Ok(Value::Int(a % b))
                }
                BinOp::Eq => Ok(Value::Int(if a == b { 1 } else { 0 })),
            },
            _ => {
                let a = to_f64(&l)
                    .ok_or_else(|| CxError::Runtime("non-numeric in binop".into()))?;
                let b = to_f64(&r)
                    .ok_or_else(|| CxError::Runtime("non-numeric in binop".into()))?;
                match op {
                    BinOp::Add => Ok(Value::Float(a + b)),
                    BinOp::Sub => Ok(Value::Float(a - b)),
                    BinOp::Mul => Ok(Value::Float(a * b)),
                    BinOp::Div => {
                        if b == 0.0 {
                            return Err(CxError::Runtime("division by zero".into()));
                        }
                        Ok(Value::Float(a / b))
                    }
                    BinOp::Mod => Ok(Value::Float(a % b)),
                    BinOp::Eq => Ok(Value::Int(if (a - b).abs() < f64::EPSILON {
                        1
                    } else {
                        0
                    })),
                }
            }
        }
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/// Runs a CX source string and returns the final value.
pub fn run(source: &str) -> Result<Value, CxError> {
    let mut lexer = Lexer::new(source);
    let tokens = lexer.tokenize()?;
    let mut parser = Parser::new(tokens);
    let stmts = parser.parse()?;
    let mut runtime = CxRuntime::new();
    runtime.eval_program(&stmts)
}

#[derive(serde::Serialize)]
pub struct CxResult {
    pub value: String,
    pub ast: Vec<Stmt>,
    pub variables: HashMap<String, String>,
}

/// Runs a CX source string and returns the final value, AST, and variable bindings.
pub fn run_detailed(source: &str) -> Result<CxResult, CxError> {
    let mut lexer = Lexer::new(source);
    let tokens = lexer.tokenize()?;
    let mut parser = Parser::new(tokens);
    let stmts = parser.parse()?;
    let mut runtime = CxRuntime::new();
    let value = runtime.eval_program(&stmts)?;
    Ok(CxResult {
        value: value.to_string(),
        ast: stmts,
        variables: runtime
            .vars
            .iter()
            .map(|(k, v)| (k.clone(), v.to_string()))
            .collect(),
    })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_arithmetic() {
        assert_eq!(run("1 + 2").unwrap().to_string(), "3");
        assert_eq!(run("10 - 3").unwrap().to_string(), "7");
        assert_eq!(run("4 * 5").unwrap().to_string(), "20");
        assert_eq!(run("20 / 4").unwrap().to_string(), "5");
        assert_eq!(run("7 % 3").unwrap().to_string(), "1");
    }

    #[test]
    fn test_operator_precedence() {
        assert_eq!(run("2 + 3 * 4").unwrap().to_string(), "14");
        assert_eq!(run("(2 + 3) * 4").unwrap().to_string(), "20");
    }

    #[test]
    fn test_let_bindings() {
        let result = run("let x = 42\nlet y = x + 8\ny").unwrap();
        assert_eq!(result.to_string(), "50");
    }

    #[test]
    fn test_complex_expression() {
        let result = run("let a = 10\nlet b = 20\nlet c = (a + b) * 2 - a\nc").unwrap();
        assert_eq!(result.to_string(), "50");
    }

    #[test]
    fn test_negative() {
        assert_eq!(run("-5 + 10").unwrap().to_string(), "5");
    }

    #[test]
    fn test_division_by_zero() {
        assert!(run("1 / 0").is_err());
    }

    #[test]
    fn test_undefined_variable() {
        assert!(run("x + 1").is_err());
    }

    #[test]
    fn test_comments() {
        assert_eq!(run("// this is a comment\n42").unwrap().to_string(), "42");
    }

    #[test]
    fn test_detailed() {
        let r = run_detailed("let x = 5\nlet y = x * 2\ny + 1").unwrap();
        assert_eq!(r.value, "11");
        assert_eq!(r.variables.get("x").unwrap(), "5");
        assert_eq!(r.variables.get("y").unwrap(), "10");
    }
}
