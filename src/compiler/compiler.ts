/**
 * TinyC Compiler - A minimal C-like language that compiles to our ISA
 *
 * Supports:
 * - Variables (int only, 32-bit)
 * - Functions with parameters
 * - if/else, while, for loops
 * - Basic expressions (+, -, *, /, %, &, |, ^, <<, >>)
 * - Comparison operators (==, !=, <, >, <=, >=)
 * - Syscalls via __syscall(n, arg0, arg1, ...)
 * - Pointers and dereferencing (* and &)
 * - Array indexing
 * - String literals
 * - Comments (// and /* *​/)
 *
 * Example:
 *   int main() {
 *     int x = 42;
 *     __syscall(1, x);  // print int
 *     return 0;
 *   }
 */

import { Assembler, type AssemblerResult } from '../assembler/assembler.ts';

// ── Token Types ──────────────────────────────────────────────────

enum TokenType {
  // Literals
  NUMBER, STRING, CHAR,
  // Identifiers
  IDENT,
  // Keywords
  INT, VOID, IF, ELSE, WHILE, FOR, RETURN, BREAK, CONTINUE,
  // Operators
  PLUS, MINUS, STAR, SLASH, PERCENT,
  AMP, PIPE, CARET, TILDE, LSHIFT, RSHIFT,
  EQ, NEQ, LT, GT, LTE, GTE,
  AND, OR, NOT,
  ASSIGN, PLUS_ASSIGN, MINUS_ASSIGN,
  INC, DEC,
  // Delimiters
  LPAREN, RPAREN, LBRACE, RBRACE, LBRACKET, RBRACKET,
  SEMICOLON, COMMA,
  // Special
  SYSCALL,
  ERROR,
  EOF,
}

interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

// ── AST Node Types ───────────────────────────────────────────────

type ASTNode =
  | { type: 'program'; functions: FunctionNode[] }
  | FunctionNode
  | StatementNode
  | ExprNode;

interface FunctionNode {
  type: 'function';
  name: string;
  params: { name: string; type: string }[];
  returnType: string;
  body: StatementNode[];
  line: number;
}

type StatementNode =
  | { type: 'vardecl'; name: string; init: ExprNode | null; line: number }
  | { type: 'assign'; target: ExprNode; value: ExprNode; line: number }
  | { type: 'if'; condition: ExprNode; then: StatementNode[]; else_: StatementNode[]; line: number }
  | { type: 'while'; condition: ExprNode; body: StatementNode[]; line: number }
  | { type: 'for'; init: StatementNode | null; condition: ExprNode | null; update: StatementNode | null; body: StatementNode[]; line: number }
  | { type: 'return'; value: ExprNode | null; line: number }
  | { type: 'break'; line: number }
  | { type: 'continue'; line: number }
  | { type: 'expr_stmt'; expr: ExprNode; line: number };

type ExprNode =
  | { type: 'number'; value: number; line: number }
  | { type: 'string'; value: string; line: number }
  | { type: 'ident'; name: string; line: number }
  | { type: 'binary'; op: string; left: ExprNode; right: ExprNode; line: number }
  | { type: 'unary'; op: string; operand: ExprNode; line: number }
  | { type: 'call'; name: string; args: ExprNode[]; line: number }
  | { type: 'syscall'; number: ExprNode; args: ExprNode[]; line: number }
  | { type: 'index'; array: ExprNode; index: ExprNode; line: number }
  | { type: 'deref'; operand: ExprNode; line: number }
  | { type: 'addrof'; operand: ExprNode; line: number };

// ── Lexer ────────────────────────────────────────────────────────

const KEYWORDS: Record<string, TokenType> = {
  'int': TokenType.INT, 'void': TokenType.VOID,
  'if': TokenType.IF, 'else': TokenType.ELSE,
  'while': TokenType.WHILE, 'for': TokenType.FOR,
  'return': TokenType.RETURN, 'break': TokenType.BREAK,
  'continue': TokenType.CONTINUE,
  '__syscall': TokenType.SYSCALL,
};

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  while (pos < source.length) {
    // Skip whitespace
    if (/\s/.test(source[pos])) {
      if (source[pos] === '\n') { line++; col = 1; } else { col++; }
      pos++;
      continue;
    }

    // Skip line comments
    if (source[pos] === '/' && source[pos + 1] === '/') {
      while (pos < source.length && source[pos] !== '\n') pos++;
      continue;
    }

    // Skip block comments
    if (source[pos] === '/' && source[pos + 1] === '*') {
      pos += 2; col += 2;
      while (pos < source.length - 1 && !(source[pos] === '*' && source[pos + 1] === '/')) {
        if (source[pos] === '\n') { line++; col = 1; } else { col++; }
        pos++;
      }
      pos += 2; col += 2;
      continue;
    }

    const startCol = col;

    // Numbers
    if (/[0-9]/.test(source[pos])) {
      let num = '';
      if (source[pos] === '0' && source[pos + 1] === 'x') {
        num = '0x'; pos += 2; col += 2;
        while (pos < source.length && /[0-9a-fA-F]/.test(source[pos])) {
          num += source[pos++]; col++;
        }
      } else {
        while (pos < source.length && /[0-9]/.test(source[pos])) {
          num += source[pos++]; col++;
        }
      }
      tokens.push({ type: TokenType.NUMBER, value: num, line, col: startCol });
      continue;
    }

    // Identifiers / keywords
    if (/[a-zA-Z_]/.test(source[pos])) {
      let id = '';
      while (pos < source.length && /[a-zA-Z0-9_]/.test(source[pos])) {
        id += source[pos++]; col++;
      }
      const type = KEYWORDS[id] ?? TokenType.IDENT;
      tokens.push({ type, value: id, line, col: startCol });
      continue;
    }

    // String literals
    if (source[pos] === '"') {
      let str = '';
      pos++; col++;
      while (pos < source.length && source[pos] !== '"') {
        if (source[pos] === '\\') {
          pos++; col++;
          switch (source[pos]) {
            case 'n': str += '\n'; break;
            case 't': str += '\t'; break;
            case '\\': str += '\\'; break;
            case '"': str += '"'; break;
            case '0': str += '\0'; break;
            default: str += source[pos];
          }
        } else {
          str += source[pos];
        }
        pos++; col++;
      }
      pos++; col++; // closing quote
      tokens.push({ type: TokenType.STRING, value: str, line, col: startCol });
      continue;
    }

    // Char literals
    if (source[pos] === "'") {
      pos++; col++;
      let ch = source[pos];
      if (ch === '\\') {
        pos++; col++;
        switch (source[pos]) {
          case 'n': ch = '\n'; break;
          case 't': ch = '\t'; break;
          case 'r': ch = '\r'; break;
          case '\\': ch = '\\'; break;
          case '0': ch = '\0'; break;
          case "'": ch = "'"; break;
          default: ch = source[pos];
        }
      }
      pos++; col++;
      pos++; col++; // closing quote
      tokens.push({ type: TokenType.CHAR, value: ch, line, col: startCol });
      continue;
    }

    // Two-character operators
    const two = source.substring(pos, pos + 2);
    const twoCharOps: Record<string, TokenType> = {
      '==': TokenType.EQ, '!=': TokenType.NEQ,
      '<=': TokenType.LTE, '>=': TokenType.GTE,
      '<<': TokenType.LSHIFT, '>>': TokenType.RSHIFT,
      '&&': TokenType.AND, '||': TokenType.OR,
      '++': TokenType.INC, '--': TokenType.DEC,
      '+=': TokenType.PLUS_ASSIGN, '-=': TokenType.MINUS_ASSIGN,
    };
    if (twoCharOps[two]) {
      tokens.push({ type: twoCharOps[two], value: two, line, col: startCol });
      pos += 2; col += 2;
      continue;
    }

    // Single-character operators
    const oneCharOps: Record<string, TokenType> = {
      '+': TokenType.PLUS, '-': TokenType.MINUS,
      '*': TokenType.STAR, '/': TokenType.SLASH, '%': TokenType.PERCENT,
      '&': TokenType.AMP, '|': TokenType.PIPE, '^': TokenType.CARET,
      '~': TokenType.TILDE, '!': TokenType.NOT,
      '<': TokenType.LT, '>': TokenType.GT,
      '=': TokenType.ASSIGN,
      '(': TokenType.LPAREN, ')': TokenType.RPAREN,
      '{': TokenType.LBRACE, '}': TokenType.RBRACE,
      '[': TokenType.LBRACKET, ']': TokenType.RBRACKET,
      ';': TokenType.SEMICOLON, ',': TokenType.COMMA,
    };
    if (oneCharOps[source[pos]]) {
      tokens.push({ type: oneCharOps[source[pos]], value: source[pos], line, col: startCol });
      pos++; col++;
      continue;
    }

    // Unknown character — emit an error token
    tokens.push({ type: TokenType.ERROR, value: source[pos], line, col: startCol });
    pos++; col++;
  }

  tokens.push({ type: TokenType.EOF, value: '', line, col });
  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;
  errors: string[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }
  private expect(type: TokenType, msg?: string): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      this.errors.push(`Line ${tok.line}:${tok.col}: Expected ${msg || TokenType[type]}, got '${tok.value}'`);
      // Advance past the unexpected token to avoid infinite loops
      if (tok.type !== TokenType.EOF) this.advance();
      return tok;
    }
    return this.advance();
  }
  private match(type: TokenType): boolean {
    if (this.peek().type === type) { this.advance(); return true; }
    return false;
  }

  parse(): { type: 'program'; functions: FunctionNode[] } {
    const functions: FunctionNode[] = [];
    while (this.peek().type !== TokenType.EOF) {
      functions.push(this.parseFunction());
    }
    return { type: 'program', functions };
  }

  private parseFunction(): FunctionNode {
    const line = this.peek().line;
    // Return type
    const retType = this.advance().value; // int or void
    const name = this.expect(TokenType.IDENT, 'function name').value;
    this.expect(TokenType.LPAREN);

    const params: { name: string; type: string }[] = [];
    while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
      const pType = this.advance().value;
      // Handle pointer: int *name → consume STAR token before IDENT
      let isPointer = false;
      if (this.peek().type === TokenType.STAR) {
        this.advance();
        isPointer = true;
      }
      const pName = this.expect(TokenType.IDENT, 'parameter name').value;
      params.push({ name: pName, type: isPointer ? pType + '*' : pType });
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RPAREN);

    if (params.length > 4) {
      this.errors.push(`Line ${line}: Function '${name}' has ${params.length} parameters (max 4 supported)`);
    }

    const body = this.parseBlock();
    return { type: 'function', name, params, returnType: retType, body, line };
  }

  private parseBlock(): StatementNode[] {
    this.expect(TokenType.LBRACE);
    const stmts: StatementNode[] = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      stmts.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE);
    return stmts;
  }

  private parseStatement(): StatementNode {
    const tok = this.peek();

    if (tok.type === TokenType.INT) {
      return this.parseVarDecl();
    }
    if (tok.type === TokenType.IF) {
      return this.parseIf();
    }
    if (tok.type === TokenType.WHILE) {
      return this.parseWhile();
    }
    if (tok.type === TokenType.FOR) {
      return this.parseFor();
    }
    if (tok.type === TokenType.RETURN) {
      return this.parseReturn();
    }
    if (tok.type === TokenType.BREAK) {
      this.advance();
      this.expect(TokenType.SEMICOLON);
      return { type: 'break', line: tok.line };
    }
    if (tok.type === TokenType.CONTINUE) {
      this.advance();
      this.expect(TokenType.SEMICOLON);
      return { type: 'continue', line: tok.line };
    }

    // Expression statement or assignment
    const expr = this.parseExpression();

    // Check for assignment
    if (this.peek().type === TokenType.ASSIGN) {
      this.advance();
      const value = this.parseExpression();
      this.expect(TokenType.SEMICOLON);
      return { type: 'assign', target: expr, value, line: tok.line };
    }
    if (this.peek().type === TokenType.PLUS_ASSIGN) {
      this.advance();
      const value = this.parseExpression();
      this.expect(TokenType.SEMICOLON);
      return {
        type: 'assign', target: expr,
        value: { type: 'binary', op: '+', left: expr, right: value, line: tok.line },
        line: tok.line,
      };
    }
    if (this.peek().type === TokenType.MINUS_ASSIGN) {
      this.advance();
      const value = this.parseExpression();
      this.expect(TokenType.SEMICOLON);
      return {
        type: 'assign', target: expr,
        value: { type: 'binary', op: '-', left: expr, right: value, line: tok.line },
        line: tok.line,
      };
    }

    this.expect(TokenType.SEMICOLON);
    return { type: 'expr_stmt', expr, line: tok.line };
  }

  private parseVarDecl(): StatementNode {
    const line = this.peek().line;
    this.advance(); // int
    // Handle pointer declarations: int *name
    if (this.peek().type === TokenType.STAR) {
      this.advance();
    }
    const name = this.expect(TokenType.IDENT, 'variable name').value;
    let init: ExprNode | null = null;
    if (this.match(TokenType.ASSIGN)) {
      init = this.parseExpression();
    }
    this.expect(TokenType.SEMICOLON);
    return { type: 'vardecl', name, init, line };
  }

  private parseIf(): StatementNode {
    const line = this.peek().line;
    this.advance(); // if
    this.expect(TokenType.LPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RPAREN);
    const then = this.parseBlock();
    let else_: StatementNode[] = [];
    if (this.match(TokenType.ELSE)) {
      if (this.peek().type === TokenType.IF) {
        else_ = [this.parseIf()];
      } else {
        else_ = this.parseBlock();
      }
    }
    return { type: 'if', condition, then, else_, line };
  }

  private parseWhile(): StatementNode {
    const line = this.peek().line;
    this.advance(); // while
    this.expect(TokenType.LPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RPAREN);
    const body = this.parseBlock();
    return { type: 'while', condition, body, line };
  }

  private parseFor(): StatementNode {
    const line = this.peek().line;
    this.advance(); // for
    this.expect(TokenType.LPAREN);

    let init: StatementNode | null = null;
    if (this.peek().type === TokenType.INT) {
      init = this.parseVarDecl();
    } else if (this.peek().type !== TokenType.SEMICOLON) {
      const expr = this.parseExpression();
      if (this.match(TokenType.ASSIGN)) {
        const value = this.parseExpression();
        this.expect(TokenType.SEMICOLON);
        init = { type: 'assign', target: expr, value, line };
      } else {
        this.expect(TokenType.SEMICOLON);
        init = { type: 'expr_stmt', expr, line };
      }
    } else {
      this.advance(); // ;
    }

    let condition: ExprNode | null = null;
    if (this.peek().type !== TokenType.SEMICOLON) {
      condition = this.parseExpression();
    }
    this.expect(TokenType.SEMICOLON);

    let update: StatementNode | null = null;
    if (this.peek().type !== TokenType.RPAREN) {
      const expr = this.parseExpression();
      if (this.peek().type === TokenType.ASSIGN) {
        this.advance();
        const value = this.parseExpression();
        update = { type: 'assign', target: expr, value, line };
      } else if (this.peek().type === TokenType.PLUS_ASSIGN) {
        this.advance();
        const value = this.parseExpression();
        update = {
          type: 'assign', target: expr,
          value: { type: 'binary', op: '+', left: expr, right: value, line },
          line,
        };
      } else if (this.peek().type === TokenType.MINUS_ASSIGN) {
        this.advance();
        const value = this.parseExpression();
        update = {
          type: 'assign', target: expr,
          value: { type: 'binary', op: '-', left: expr, right: value, line },
          line,
        };
      } else {
        update = { type: 'expr_stmt', expr, line };
      }
    }
    this.expect(TokenType.RPAREN);
    const body = this.parseBlock();
    return { type: 'for', init, condition, update, body, line };
  }

  private parseReturn(): StatementNode {
    const line = this.peek().line;
    this.advance(); // return
    let value: ExprNode | null = null;
    if (this.peek().type !== TokenType.SEMICOLON) {
      value = this.parseExpression();
    }
    this.expect(TokenType.SEMICOLON);
    return { type: 'return', value, line };
  }

  // ── Expression parsing (precedence climbing) ──────────────────

  private parseExpression(): ExprNode {
    return this.parseOr();
  }

  private parseOr(): ExprNode {
    let left = this.parseAnd();
    while (this.peek().type === TokenType.OR) {
      this.advance();
      const right = this.parseAnd();
      left = { type: 'binary', op: '||', left, right, line: left.line };
    }
    return left;
  }

  private parseAnd(): ExprNode {
    let left = this.parseBitOr();
    while (this.peek().type === TokenType.AND) {
      this.advance();
      const right = this.parseBitOr();
      left = { type: 'binary', op: '&&', left, right, line: left.line };
    }
    return left;
  }

  private parseBitOr(): ExprNode {
    let left = this.parseBitXor();
    while (this.peek().type === TokenType.PIPE) {
      this.advance();
      const right = this.parseBitXor();
      left = { type: 'binary', op: '|', left, right, line: left.line };
    }
    return left;
  }

  private parseBitXor(): ExprNode {
    let left = this.parseBitAnd();
    while (this.peek().type === TokenType.CARET) {
      this.advance();
      const right = this.parseBitAnd();
      left = { type: 'binary', op: '^', left, right, line: left.line };
    }
    return left;
  }

  private parseBitAnd(): ExprNode {
    let left = this.parseEquality();
    while (this.peek().type === TokenType.AMP) {
      this.advance();
      const right = this.parseEquality();
      left = { type: 'binary', op: '&', left, right, line: left.line };
    }
    return left;
  }

  private parseEquality(): ExprNode {
    let left = this.parseComparison();
    while (this.peek().type === TokenType.EQ || this.peek().type === TokenType.NEQ) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = { type: 'binary', op, left, right, line: left.line };
    }
    return left;
  }

  private parseComparison(): ExprNode {
    let left = this.parseShift();
    while ([TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE].includes(this.peek().type)) {
      const op = this.advance().value;
      const right = this.parseShift();
      left = { type: 'binary', op, left, right, line: left.line };
    }
    return left;
  }

  private parseShift(): ExprNode {
    let left = this.parseAddSub();
    while (this.peek().type === TokenType.LSHIFT || this.peek().type === TokenType.RSHIFT) {
      const op = this.advance().value;
      const right = this.parseAddSub();
      left = { type: 'binary', op, left, right, line: left.line };
    }
    return left;
  }

  private parseAddSub(): ExprNode {
    let left = this.parseMulDiv();
    while (this.peek().type === TokenType.PLUS || this.peek().type === TokenType.MINUS) {
      const op = this.advance().value;
      const right = this.parseMulDiv();
      left = { type: 'binary', op, left, right, line: left.line };
    }
    return left;
  }

  private parseMulDiv(): ExprNode {
    let left = this.parseUnary();
    while ([TokenType.STAR, TokenType.SLASH, TokenType.PERCENT].includes(this.peek().type)) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { type: 'binary', op, left, right, line: left.line };
    }
    return left;
  }

  private parseUnary(): ExprNode {
    const tok = this.peek();
    if (tok.type === TokenType.MINUS) {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'unary', op: '-', operand, line: tok.line };
    }
    if (tok.type === TokenType.NOT) {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'unary', op: '!', operand, line: tok.line };
    }
    if (tok.type === TokenType.TILDE) {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'unary', op: '~', operand, line: tok.line };
    }
    if (tok.type === TokenType.STAR) {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'deref', operand, line: tok.line };
    }
    if (tok.type === TokenType.AMP) {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'addrof', operand, line: tok.line };
    }
    if (tok.type === TokenType.INC) {
      this.advance();
      const operand = this.parsePrimary();
      return {
        type: 'unary', op: 'pre++', operand,
        line: tok.line,
      };
    }
    if (tok.type === TokenType.DEC) {
      this.advance();
      const operand = this.parsePrimary();
      return {
        type: 'unary', op: 'pre--', operand,
        line: tok.line,
      };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ExprNode {
    let expr = this.parsePrimary();
    while (true) {
      if (this.peek().type === TokenType.LBRACKET) {
        this.advance();
        const index = this.parseExpression();
        this.expect(TokenType.RBRACKET);
        expr = { type: 'index', array: expr, index, line: expr.line };
      } else if (this.peek().type === TokenType.INC) {
        this.advance();
        // Post-increment: evaluate to current value, then increment
        expr = {
          type: 'unary', op: 'post++', operand: expr,
          line: expr.line,
        };
      } else if (this.peek().type === TokenType.DEC) {
        this.advance();
        expr = {
          type: 'unary', op: 'post--', operand: expr,
          line: expr.line,
        };
      } else {
        break;
      }
    }
    return expr;
  }

  private parsePrimary(): ExprNode {
    const tok = this.peek();

    if (tok.type === TokenType.NUMBER) {
      this.advance();
      return { type: 'number', value: parseInt(tok.value), line: tok.line };
    }

    if (tok.type === TokenType.STRING) {
      this.advance();
      return { type: 'string', value: tok.value, line: tok.line };
    }

    if (tok.type === TokenType.CHAR) {
      this.advance();
      return { type: 'number', value: tok.value.charCodeAt(0), line: tok.line };
    }

    if (tok.type === TokenType.SYSCALL) {
      this.advance();
      this.expect(TokenType.LPAREN);
      const num = this.parseExpression();
      const args: ExprNode[] = [];
      while (this.match(TokenType.COMMA)) {
        args.push(this.parseExpression());
      }
      this.expect(TokenType.RPAREN);
      return { type: 'syscall', number: num, args, line: tok.line };
    }

    if (tok.type === TokenType.IDENT) {
      this.advance();
      // Function call
      if (this.peek().type === TokenType.LPAREN) {
        this.advance();
        const args: ExprNode[] = [];
        while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
          args.push(this.parseExpression());
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RPAREN);
        return { type: 'call', name: tok.value, args, line: tok.line };
      }
      return { type: 'ident', name: tok.value, line: tok.line };
    }

    if (tok.type === TokenType.LPAREN) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN);
      return expr;
    }

    this.errors.push(`Line ${tok.line}:${tok.col}: Unexpected token '${tok.value}'`);
    this.advance();
    return { type: 'number', value: 0, line: tok.line };
  }
}

// ── Code Generator (AST -> Assembly) ─────────────────────────────

class CodeGen {
  private output: string[] = [];
  private stringLiterals: { label: string; value: string }[] = [];
  private localVars = new Map<string, number>(); // name -> stack offset
  private stackOffset = 0;
  private labelCounter = 0;
  private breakLabels: string[] = [];
  private continueLabels: string[] = [];
  errors: string[] = [];

  generate(ast: { type: 'program'; functions: FunctionNode[] }): string {
    this.output = [];

    // Header
    this.emit('; Generated by TinyC compiler');
    this.emit('; Target: CPU-Sim ARM-like ISA');
    this.emit('');

    // Jump to main
    this.emit('  B main');
    this.emit('');

    // Generate each function
    for (const fn of ast.functions) {
      this.generateFunction(fn);
    }

    // String literals section
    if (this.stringLiterals.length > 0) {
      this.emit('');
      this.emit('; String literals');
      for (const { label, value } of this.stringLiterals) {
        this.emit(`${label}:`);
        this.emit(`  .asciz "${this.escapeString(value)}"`);
      }
    }

    return this.output.join('\n');
  }

  private emit(line: string): void {
    this.output.push(line);
  }

  private newLabel(prefix: string = 'L'): string {
    return `${prefix}${this.labelCounter++}`;
  }

  private generateFunction(fn: FunctionNode): void {
    this.emit(`; Function: ${fn.name}`);
    this.emit(`${fn.name}:`);

    // Prologue: save LR and FP, set up frame
    this.emit('  PUSH {R11}');
    this.emit('  PUSH {LR}');
    this.emit(`  MOV R11, SP`);  // R11 = frame pointer

    // Allocate space for local variables
    this.localVars.clear();
    this.stackOffset = 0;

    // Parameters are passed in R0-R3
    for (let i = 0; i < fn.params.length && i < 4; i++) {
      // Push parameter to stack
      this.stackOffset += 4;
      this.localVars.set(fn.params[i].name, this.stackOffset);
      this.emit(`  PUSH {R${i}}`);
    }

    // Generate body
    for (const stmt of fn.body) {
      this.generateStatement(stmt);
    }

    // Epilogue (in case no return statement)
    this.emit(`${fn.name}_epilogue:`);
    this.emit(`  MOV SP, R11`);
    this.emit('  POP {LR}');
    this.emit('  POP {R11}');
    this.emit('  BX LR');
    this.emit('');
  }

  private generateStatement(stmt: StatementNode): void {
    switch (stmt.type) {
      case 'vardecl': {
        this.stackOffset += 4;
        this.localVars.set(stmt.name, this.stackOffset);
        if (stmt.init) {
          this.generateExpr(stmt.init, 0); // result in R0
          this.emit('  PUSH {R0}');
        } else {
          this.emit('  MOV R0, #0');
          this.emit('  PUSH {R0}');
        }
        break;
      }

      case 'assign': {
        this.generateExpr(stmt.value, 0); // value in R0
        if (stmt.target.type === 'ident') {
          const offset = this.localVars.get(stmt.target.name);
          if (offset !== undefined) {
            this.emit(`  STR R0, [R11, #-${offset}]`);
          }
        } else if (stmt.target.type === 'deref') {
          // *ptr = value
          this.emit('  PUSH {R0}'); // save value
          this.generateExpr(stmt.target.operand, 1); // address in R1
          this.emit('  POP {R0}');
          this.emit('  STR R0, [R1]');
        } else if (stmt.target.type === 'index') {
          // arr[i] = value
          // R0 has the value to store. Evaluate array address first, save it,
          // then evaluate index (which may clobber R1).
          this.emit('  PUSH {R0}');        // save value
          this.generateExpr(stmt.target.array, 1);
          this.emit('  PUSH {R1}');        // save array address
          this.generateExpr(stmt.target.index, 2);
          this.emit('  LSL R2, R2, #2');   // * 4 for word size
          this.emit('  POP {R1}');         // restore array address
          this.emit('  ADD R1, R1, R2');
          this.emit('  POP {R0}');         // restore value
          this.emit('  STR R0, [R1]');
        }
        break;
      }

      case 'if': {
        const elseLabel = this.newLabel('else');
        const endLabel = this.newLabel('endif');

        this.generateExpr(stmt.condition, 0);
        this.emit('  CMP R0, #0');
        this.emit(`  BEQ ${stmt.else_.length > 0 ? elseLabel : endLabel}`);

        for (const s of stmt.then) this.generateStatement(s);

        if (stmt.else_.length > 0) {
          this.emit(`  B ${endLabel}`);
          this.emit(`${elseLabel}:`);
          for (const s of stmt.else_) this.generateStatement(s);
        }
        this.emit(`${endLabel}:`);
        break;
      }

      case 'while': {
        const startLabel = this.newLabel('while');
        const endLabel = this.newLabel('endwhile');

        this.breakLabels.push(endLabel);
        this.continueLabels.push(startLabel);

        // Save stack state before loop body for cleanup of loop-scoped vars
        const savedOffset = this.stackOffset;
        const savedVars = new Map(this.localVars);

        this.emit(`${startLabel}:`);
        // Save SP at loop entry to reclaim loop-body locals each iteration
        this.emit('  MOV R10, SP');
        this.generateExpr(stmt.condition, 0);
        this.emit('  CMP R0, #0');
        this.emit(`  BEQ ${endLabel}`);

        for (const s of stmt.body) this.generateStatement(s);

        // Restore SP to reclaim any locals declared in loop body
        this.emit('  MOV SP, R10');
        this.emit(`  B ${startLabel}`);
        this.emit(`${endLabel}:`);
        // Also restore SP when exiting loop via condition
        this.emit('  MOV SP, R10');

        // Restore scope
        this.stackOffset = savedOffset;
        this.localVars = savedVars;

        this.breakLabels.pop();
        this.continueLabels.pop();
        break;
      }

      case 'for': {
        const startLabel = this.newLabel('for');
        const updateLabel = this.newLabel('forupdate');
        const endLabel = this.newLabel('endfor');

        this.breakLabels.push(endLabel);
        this.continueLabels.push(updateLabel);

        // Init runs once (may declare loop variable like `int i = 0`)
        const savedOffsetOuter = this.stackOffset;
        const savedVarsOuter = new Map(this.localVars);

        if (stmt.init) this.generateStatement(stmt.init);

        this.emit(`${startLabel}:`);
        // Save SP at loop entry to reclaim loop-body locals each iteration
        this.emit('  MOV R10, SP');
        if (stmt.condition) {
          this.generateExpr(stmt.condition, 0);
          this.emit('  CMP R0, #0');
          this.emit(`  BEQ ${endLabel}`);
        }

        // Save scope for body-only vars (not the init var)
        const savedOffsetBody = this.stackOffset;
        const savedVarsBody = new Map(this.localVars);

        for (const s of stmt.body) this.generateStatement(s);

        // Restore SP to reclaim body-scoped locals before update
        this.emit('  MOV SP, R10');
        this.stackOffset = savedOffsetBody;
        this.localVars = savedVarsBody;

        this.emit(`${updateLabel}:`);
        if (stmt.update) this.generateStatement(stmt.update);
        this.emit(`  B ${startLabel}`);
        this.emit(`${endLabel}:`);
        // Restore SP when exiting loop
        this.emit('  MOV SP, R10');

        // Restore outer scope (reclaims init var too)
        this.stackOffset = savedOffsetOuter;
        this.localVars = savedVarsOuter;

        this.breakLabels.pop();
        this.continueLabels.pop();
        break;
      }

      case 'return': {
        if (stmt.value) {
          this.generateExpr(stmt.value, 0); // Return value in R0
        }
        // Restore frame and return
        this.emit('  MOV SP, R11');
        this.emit('  POP {LR}');
        this.emit('  POP {R11}');
        this.emit('  BX LR');
        break;
      }

      case 'break': {
        const label = this.breakLabels[this.breakLabels.length - 1];
        if (label) {
          this.emit(`  B ${label}`);
        } else {
          this.errors.push(`Line ${stmt.line}: 'break' used outside of a loop`);
        }
        break;
      }

      case 'continue': {
        const label = this.continueLabels[this.continueLabels.length - 1];
        if (label) {
          this.emit(`  B ${label}`);
        } else {
          this.errors.push(`Line ${stmt.line}: 'continue' used outside of a loop`);
        }
        break;
      }

      case 'expr_stmt':
        this.generateExpr(stmt.expr, 0);
        break;
    }
  }

  /** Generate expression, result in register `reg` */
  private generateExpr(expr: ExprNode, reg: number): void {
    switch (expr.type) {
      case 'number': {
        const val = expr.value;
        if (val >= 0 && val < 1024) {
          this.emit(`  MOV R${reg}, #${val}`);
        } else if (val >= -1024 && val < 0) {
          this.emit(`  MOV R${reg}, #${val}`);
        } else {
          this.emit(`  MOVW R${reg}, #${val & 0xFFFF}`);
          if (val > 0xFFFF || val < 0) {
            this.emit(`  MOVT R${reg}, #${(val >>> 16) & 0xFFFF}`);
          }
        }
        break;
      }

      case 'string': {
        const label = this.newLabel('str');
        this.stringLiterals.push({ label, value: expr.value });
        this.emit(`  MOVW R${reg}, #${label}`);
        break;
      }

      case 'ident': {
        const offset = this.localVars.get(expr.name);
        if (offset !== undefined) {
          this.emit(`  LDR R${reg}, [R11, #-${offset}]`);
        } else {
          this.emit(`  ; WARNING: undefined variable '${expr.name}'`);
          this.emit(`  MOV R${reg}, #0`);
        }
        break;
      }

      case 'binary': {
        // Handle short-circuit logical operators separately
        if (expr.op === '&&') {
          const falseLabel = this.newLabel('and_false');
          const endLabel = this.newLabel('and_end');
          this.generateExpr(expr.left, reg);
          this.emit(`  CMP R${reg}, #0`);
          this.emit(`  BEQ ${falseLabel}`);
          this.generateExpr(expr.right, reg);
          this.emit(`  CMP R${reg}, #0`);
          this.emit(`  BEQ ${falseLabel}`);
          this.emit(`  MOV R${reg}, #1`);
          this.emit(`  B ${endLabel}`);
          this.emit(`${falseLabel}:`);
          this.emit(`  MOV R${reg}, #0`);
          this.emit(`${endLabel}:`);
          break;
        }
        if (expr.op === '||') {
          const trueLabel = this.newLabel('or_true');
          const endLabel = this.newLabel('or_end');
          this.generateExpr(expr.left, reg);
          this.emit(`  CMP R${reg}, #0`);
          this.emit(`  BNE ${trueLabel}`);
          this.generateExpr(expr.right, reg);
          this.emit(`  CMP R${reg}, #0`);
          this.emit(`  BNE ${trueLabel}`);
          this.emit(`  MOV R${reg}, #0`);
          this.emit(`  B ${endLabel}`);
          this.emit(`${trueLabel}:`);
          this.emit(`  MOV R${reg}, #1`);
          this.emit(`${endLabel}:`);
          break;
        }

        this.generateExpr(expr.left, reg);
        // Save left result
        this.emit(`  PUSH {R${reg}}`);
        // Generate right into a temp register
        const tmpReg = reg === 0 ? 1 : 0;
        this.generateExpr(expr.right, tmpReg);
        // Restore left
        this.emit(`  POP {R${reg}}`);

        const opMap: Record<string, string> = {
          '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD',
          '&': 'AND', '|': 'ORR', '^': 'EOR', '<<': 'LSL', '>>': 'ASR',
        };

        if (opMap[expr.op]) {
          this.emit(`  ${opMap[expr.op]} R${reg}, R${reg}, R${tmpReg}`);
        } else {
          // Comparison operators
          this.emit(`  CMP R${reg}, R${tmpReg}`);
          const cmpMap: Record<string, string> = {
            '==': 'EQ', '!=': 'NE', '<': 'LT', '>': 'GT', '<=': 'LE', '>=': 'GE',
          };
          const cond = cmpMap[expr.op] || 'EQ';
          this.emit(`  MOV R${reg}, #0`);
          this.emit(`  MOV${cond} R${reg}, #1`);
        }
        break;
      }

      case 'unary': {
        this.generateExpr(expr.operand, reg);
        if (expr.op === '-') {
          this.emit(`  RSB R${reg}, R${reg}, #0`);
        } else if (expr.op === '~') {
          this.emit(`  MVN R${reg}, R${reg}`);
        } else if (expr.op === '!') {
          this.emit(`  CMP R${reg}, #0`);
          this.emit(`  MOV R${reg}, #0`);
          this.emit(`  MOVEQ R${reg}, #1`);
        } else if (expr.op === 'pre++' || expr.op === 'pre--') {
          // Pre-increment/decrement: modify variable, result is new value
          const addOp = expr.op === 'pre++' ? 'ADD' : 'SUB';
          this.emit(`  ${addOp} R${reg}, R${reg}, #1`);
          // Store back
          if (expr.operand.type === 'ident') {
            const offset = this.localVars.get(expr.operand.name);
            if (offset !== undefined) {
              this.emit(`  STR R${reg}, [R11, #-${offset}]`);
            }
          }
        } else if (expr.op === 'post++' || expr.op === 'post--') {
          // Post-increment/decrement: result is old value, then modify variable
          const tmpReg = reg === 0 ? 1 : 0;
          this.emit(`  MOV R${tmpReg}, R${reg}`);
          const addOp = expr.op === 'post++' ? 'ADD' : 'SUB';
          this.emit(`  ${addOp} R${tmpReg}, R${tmpReg}, #1`);
          // Store incremented value back
          if (expr.operand.type === 'ident') {
            const offset = this.localVars.get(expr.operand.name);
            if (offset !== undefined) {
              this.emit(`  STR R${tmpReg}, [R11, #-${offset}]`);
            }
          }
          // R${reg} still holds the original value
        }
        break;
      }

      case 'call': {
        if (expr.args.length > 4) {
          this.errors.push(`Line ${expr.line}: Function call '${expr.name}' has ${expr.args.length} arguments (max 4 supported)`);
        }
        // Evaluate all arguments into R0, pushing each onto the stack
        // This avoids register clobber issues with complex argument expressions
        const argCount = Math.min(expr.args.length, 4);
        for (let i = 0; i < argCount; i++) {
          this.generateExpr(expr.args[i], 0);
          this.emit('  PUSH {R0}');
        }
        // Pop arguments into R0-R3 in reverse order
        for (let i = argCount - 1; i >= 0; i--) {
          this.emit(`  POP {R${i}}`);
        }
        this.emit(`  BL ${expr.name}`);
        if (reg !== 0) {
          this.emit(`  MOV R${reg}, R0`);
        }
        break;
      }

      case 'syscall': {
        // Evaluate all arguments into R0, pushing each onto the stack
        const sArgCount = Math.min(expr.args.length, 4);
        for (let i = 0; i < sArgCount; i++) {
          this.generateExpr(expr.args[i], 0);
          this.emit('  PUSH {R0}');
        }
        // Pop arguments into R0-R3 in reverse order
        for (let i = sArgCount - 1; i >= 0; i--) {
          this.emit(`  POP {R${i}}`);
        }
        if (expr.number.type === 'number') {
          this.emit(`  SWI #${expr.number.value}`);
        } else {
          this.generateExpr(expr.number, 7);
          this.emit(`  SWI #0`); // Number from R7
        }
        if (reg !== 0) {
          this.emit(`  MOV R${reg}, R0`);
        }
        break;
      }

      case 'deref': {
        this.generateExpr(expr.operand, reg);
        this.emit(`  LDR R${reg}, [R${reg}]`);
        break;
      }

      case 'addrof': {
        if (expr.operand.type === 'ident') {
          const offset = this.localVars.get(expr.operand.name);
          if (offset !== undefined) {
            this.emit(`  SUB R${reg}, R11, #${offset}`);
          }
        }
        break;
      }

      case 'index': {
        this.generateExpr(expr.array, reg);
        this.emit(`  PUSH {R${reg}}`);
        const tmpReg = reg === 0 ? 1 : 0;
        this.generateExpr(expr.index, tmpReg);
        this.emit(`  LSL R${tmpReg}, R${tmpReg}, #2`); // * 4
        this.emit(`  POP {R${reg}}`);
        this.emit(`  ADD R${reg}, R${reg}, R${tmpReg}`);
        this.emit(`  LDR R${reg}, [R${reg}]`);
        break;
      }
    }
  }

  private escapeString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      .replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\0/g, '\\0');
  }
}

// ── Public API ───────────────────────────────────────────────────

export interface CompilerResult {
  success: boolean;
  assembly: string;
  assemblerResult: AssemblerResult | null;
  errors: string[];
}

export function compile(source: string, baseAddress: number = 0): CompilerResult {
  const errors: string[] = [];

  // Tokenize
  const tokens = tokenize(source);

  // Check for lexer errors (unknown characters)
  const errorTokens = tokens.filter(t => t.type === TokenType.ERROR);
  if (errorTokens.length > 0) {
    return {
      success: false,
      assembly: '',
      assemblerResult: null,
      errors: errorTokens.map(t => `Line ${t.line}:${t.col}: Unknown character '${t.value}'`),
    };
  }

  // Parse
  const parser = new Parser(tokens);
  const ast = parser.parse();
  if (parser.errors.length > 0) {
    return {
      success: false,
      assembly: '',
      assemblerResult: null,
      errors: parser.errors,
    };
  }

  // Generate assembly
  const codegen = new CodeGen();
  const assembly = codegen.generate(ast);

  // Check for codegen errors
  if (codegen.errors.length > 0) {
    return {
      success: false,
      assembly,
      assemblerResult: null,
      errors: codegen.errors,
    };
  }

  // Assemble
  const assembler = new Assembler(baseAddress);
  const asmResult = assembler.assemble(assembly);

  if (!asmResult.success) {
    for (const err of asmResult.errors) {
      errors.push(`Assembler error at line ${err.line}: ${err.message}`);
    }
  }

  return {
    success: asmResult.success && errors.length === 0,
    assembly,
    assemblerResult: asmResult,
    errors,
  };
}
