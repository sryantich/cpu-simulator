/**
 * TinyC Compiler - A minimal C-like language that compiles to our ISA
 *
 * Supports:
 * - Variables (int, char — both 32-bit)
 * - Global and local variables
 * - Functions with parameters (max 4)
 * - if/else, while, do-while, for, switch/case/default
 * - break, continue, return
 * - Basic expressions (+, -, *, /, %, &, |, ^, <<, >>)
 * - Comparison operators (==, !=, <, >, <=, >=)
 * - Logical operators (&&, ||, !)
 * - Ternary operator (? :)
 * - Unary operators (-, ~, !, ++, --, *, &)
 * - Compound assignments (+=, -=, *=, /=, %=, &=, |=, ^=, <<=, >>=)
 * - Pointers, dereferencing (* and &), address-of array elements
 * - Array indexing and local array declarations
 * - Syscalls via __syscall(n, arg0, arg1, ...)
 * - String and char literals
 * - Comments (// and /* *​/)
 *
 * Example:
 *   int counter = 0;
 *   int main() {
 *     int arr[5];
 *     for (int i = 0; i < 5; i++) {
 *       arr[i] = i * i;
 *     }
 *     counter = arr[3];
 *     __syscall(1, counter);
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
  INT, CHAR_KW, VOID, IF, ELSE, WHILE, DO, FOR, RETURN, BREAK, CONTINUE,
  SWITCH, CASE, DEFAULT,
  // Operators
  PLUS, MINUS, STAR, SLASH, PERCENT,
  AMP, PIPE, CARET, TILDE, LSHIFT, RSHIFT,
  EQ, NEQ, LT, GT, LTE, GTE,
  AND, OR, NOT,
  ASSIGN, PLUS_ASSIGN, MINUS_ASSIGN,
  STAR_ASSIGN, SLASH_ASSIGN, PERCENT_ASSIGN,
  AMP_ASSIGN, PIPE_ASSIGN, CARET_ASSIGN,
  LSHIFT_ASSIGN, RSHIFT_ASSIGN,
  INC, DEC,
  QUESTION, COLON,
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
  | ProgramNode
  | FunctionNode
  | StatementNode
  | ExprNode;

interface ProgramNode {
  type: 'program';
  globals: GlobalVarNode[];
  functions: FunctionNode[];
}

interface GlobalVarNode {
  type: 'globalvar';
  name: string;
  init: number | null; // only constant expressions for globals
  line: number;
}

interface FunctionNode {
  type: 'function';
  name: string;
  params: { name: string; ptrType: boolean }[];
  returnType: string;
  body: StatementNode[];
  line: number;
}

type StatementNode =
  | { type: 'vardecl'; name: string; init: ExprNode | null; arraySize: number | null; line: number }
  | { type: 'assign'; target: ExprNode; op: string; value: ExprNode; line: number }
  | { type: 'if'; condition: ExprNode; then: StatementNode[]; else_: StatementNode[]; line: number }
  | { type: 'while'; condition: ExprNode; body: StatementNode[]; line: number }
  | { type: 'dowhile'; condition: ExprNode; body: StatementNode[]; line: number }
  | { type: 'for'; init: StatementNode | null; condition: ExprNode | null; update: StatementNode | null; body: StatementNode[]; line: number }
  | { type: 'switch'; expr: ExprNode; cases: SwitchCase[]; line: number }
  | { type: 'return'; value: ExprNode | null; line: number }
  | { type: 'break'; line: number }
  | { type: 'continue'; line: number }
  | { type: 'expr_stmt'; expr: ExprNode; line: number };

interface SwitchCase {
  value: number | null;  // null = default
  body: StatementNode[];
  line: number;
}

type ExprNode =
  | { type: 'number'; value: number; line: number }
  | { type: 'string'; value: string; line: number }
  | { type: 'ident'; name: string; line: number }
  | { type: 'binary'; op: string; left: ExprNode; right: ExprNode; line: number }
  | { type: 'unary'; op: string; operand: ExprNode; line: number }
  | { type: 'ternary'; condition: ExprNode; then: ExprNode; else_: ExprNode; line: number }
  | { type: 'call'; name: string; args: ExprNode[]; line: number }
  | { type: 'syscall'; number: ExprNode; args: ExprNode[]; line: number }
  | { type: 'index'; array: ExprNode; index: ExprNode; line: number }
  | { type: 'deref'; operand: ExprNode; line: number }
  | { type: 'addrof'; operand: ExprNode; line: number };

// ── Lexer ────────────────────────────────────────────────────────

const KEYWORDS: Record<string, TokenType> = {
  'int': TokenType.INT, 'char': TokenType.CHAR_KW, 'void': TokenType.VOID,
  'if': TokenType.IF, 'else': TokenType.ELSE,
  'while': TokenType.WHILE, 'do': TokenType.DO, 'for': TokenType.FOR,
  'return': TokenType.RETURN, 'break': TokenType.BREAK,
  'continue': TokenType.CONTINUE,
  'switch': TokenType.SWITCH, 'case': TokenType.CASE, 'default': TokenType.DEFAULT,
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

    // Three-character operators
    const three = source.substring(pos, pos + 3);
    const threeCharOps: Record<string, TokenType> = {
      '<<=': TokenType.LSHIFT_ASSIGN, '>>=': TokenType.RSHIFT_ASSIGN,
    };
    if (threeCharOps[three]) {
      tokens.push({ type: threeCharOps[three], value: three, line, col: startCol });
      pos += 3; col += 3;
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
      '*=': TokenType.STAR_ASSIGN, '/=': TokenType.SLASH_ASSIGN,
      '%=': TokenType.PERCENT_ASSIGN, '&=': TokenType.AMP_ASSIGN,
      '|=': TokenType.PIPE_ASSIGN, '^=': TokenType.CARET_ASSIGN,
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
      '=': TokenType.ASSIGN, '?': TokenType.QUESTION, ':': TokenType.COLON,
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
      if (tok.type !== TokenType.EOF) this.advance();
      return tok;
    }
    return this.advance();
  }
  private match(type: TokenType): boolean {
    if (this.peek().type === type) { this.advance(); return true; }
    return false;
  }

  private isTypeKeyword(): boolean {
    return this.peek().type === TokenType.INT || this.peek().type === TokenType.CHAR_KW || this.peek().type === TokenType.VOID;
  }

  parse(): ProgramNode {
    const globals: GlobalVarNode[] = [];
    const functions: FunctionNode[] = [];

    while (this.peek().type !== TokenType.EOF) {
      // Look ahead to distinguish global var from function:
      // type [*] name ( → function
      // type [*] name [= ...] ; → global var
      // type [*] name [ → global array (not supported yet, skip)
      const saved = this.pos;
      if (this.isTypeKeyword()) {
        this.advance(); // type
        if (this.peek().type === TokenType.STAR) this.advance(); // optional *
        if (this.peek().type === TokenType.IDENT) {
          this.advance(); // name
          if (this.peek().type === TokenType.LPAREN) {
            // It's a function
            this.pos = saved;
            functions.push(this.parseFunction());
          } else {
            // It's a global variable
            this.pos = saved;
            globals.push(this.parseGlobalVar());
          }
        } else {
          this.pos = saved;
          // Try function anyway
          functions.push(this.parseFunction());
        }
      } else {
        this.errors.push(`Line ${this.peek().line}:${this.peek().col}: Expected type keyword at top level, got '${this.peek().value}'`);
        this.advance();
      }
    }
    return { type: 'program', globals, functions };
  }

  private parseGlobalVar(): GlobalVarNode {
    const line = this.peek().line;
    this.advance(); // type keyword (int/char)
    if (this.peek().type === TokenType.STAR) this.advance(); // optional *
    const name = this.expect(TokenType.IDENT, 'variable name').value;
    let init: number | null = null;
    if (this.match(TokenType.ASSIGN)) {
      // Only constant expressions for globals
      const tok = this.peek();
      if (tok.type === TokenType.NUMBER) {
        init = parseInt(this.advance().value);
      } else if (tok.type === TokenType.MINUS && this.tokens[this.pos + 1]?.type === TokenType.NUMBER) {
        this.advance(); // -
        init = -parseInt(this.advance().value);
      } else if (tok.type === TokenType.CHAR) {
        init = this.advance().value.charCodeAt(0);
      } else {
        this.errors.push(`Line ${tok.line}: Global variable initializer must be a constant`);
        this.advance();
      }
    }
    this.expect(TokenType.SEMICOLON);
    return { type: 'globalvar', name, init, line };
  }

  private parseFunction(): FunctionNode {
    const line = this.peek().line;
    const retType = this.advance().value; // int, char, or void
    // Handle pointer return type
    if (this.peek().type === TokenType.STAR) this.advance();
    const name = this.expect(TokenType.IDENT, 'function name').value;
    this.expect(TokenType.LPAREN);

    const params: { name: string; ptrType: boolean }[] = [];
    while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
      this.advance(); // type keyword
      let isPointer = false;
      if (this.peek().type === TokenType.STAR) {
        this.advance();
        isPointer = true;
      }
      const pName = this.expect(TokenType.IDENT, 'parameter name').value;
      params.push({ name: pName, ptrType: isPointer });
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

  /** Parse either a braced block or a single statement (for braceless if/while/for) */
  private parseBlockOrStatement(): StatementNode[] {
    if (this.peek().type === TokenType.LBRACE) {
      return this.parseBlock();
    }
    // Single statement (braceless body)
    return [this.parseStatement()];
  }

  private parseStatement(): StatementNode {
    const tok = this.peek();

    if (tok.type === TokenType.INT || tok.type === TokenType.CHAR_KW) {
      return this.parseVarDecl();
    }
    if (tok.type === TokenType.IF) {
      return this.parseIf();
    }
    if (tok.type === TokenType.WHILE) {
      return this.parseWhile();
    }
    if (tok.type === TokenType.DO) {
      return this.parseDoWhile();
    }
    if (tok.type === TokenType.FOR) {
      return this.parseFor();
    }
    if (tok.type === TokenType.SWITCH) {
      return this.parseSwitch();
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

    // Check for assignment operators
    const assignOps: Record<number, string> = {
      [TokenType.ASSIGN]: '=',
      [TokenType.PLUS_ASSIGN]: '+=',
      [TokenType.MINUS_ASSIGN]: '-=',
      [TokenType.STAR_ASSIGN]: '*=',
      [TokenType.SLASH_ASSIGN]: '/=',
      [TokenType.PERCENT_ASSIGN]: '%=',
      [TokenType.AMP_ASSIGN]: '&=',
      [TokenType.PIPE_ASSIGN]: '|=',
      [TokenType.CARET_ASSIGN]: '^=',
      [TokenType.LSHIFT_ASSIGN]: '<<=',
      [TokenType.RSHIFT_ASSIGN]: '>>=',
    };

    const op = assignOps[this.peek().type];
    if (op) {
      this.advance();
      const value = this.parseExpression();
      this.expect(TokenType.SEMICOLON);
      return { type: 'assign', target: expr, op, value, line: tok.line };
    }

    this.expect(TokenType.SEMICOLON);
    return { type: 'expr_stmt', expr, line: tok.line };
  }

  private parseVarDecl(): StatementNode {
    const line = this.peek().line;
    this.advance(); // int or char
    // Handle pointer declarations: int *name
    if (this.peek().type === TokenType.STAR) {
      this.advance();
    }
    const name = this.expect(TokenType.IDENT, 'variable name').value;

    // Check for array declaration: int name[size]
    if (this.match(TokenType.LBRACKET)) {
      const sizeTok = this.expect(TokenType.NUMBER, 'array size');
      const arraySize = parseInt(sizeTok.value);
      this.expect(TokenType.RBRACKET);
      this.expect(TokenType.SEMICOLON);
      return { type: 'vardecl', name, init: null, arraySize, line };
    }

    let init: ExprNode | null = null;
    if (this.match(TokenType.ASSIGN)) {
      init = this.parseExpression();
    }
    this.expect(TokenType.SEMICOLON);
    return { type: 'vardecl', name, init, arraySize: null, line };
  }

  private parseIf(): StatementNode {
    const line = this.peek().line;
    this.advance(); // if
    this.expect(TokenType.LPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RPAREN);
    const then = this.parseBlockOrStatement();
    let else_: StatementNode[] = [];
    if (this.match(TokenType.ELSE)) {
      if (this.peek().type === TokenType.IF) {
        else_ = [this.parseIf()];
      } else {
        else_ = this.parseBlockOrStatement();
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
    const body = this.parseBlockOrStatement();
    return { type: 'while', condition, body, line };
  }

  private parseDoWhile(): StatementNode {
    const line = this.peek().line;
    this.advance(); // do
    const body = this.parseBlock();
    this.expect(TokenType.WHILE, "'while'");
    this.expect(TokenType.LPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RPAREN);
    this.expect(TokenType.SEMICOLON);
    return { type: 'dowhile', condition, body, line };
  }

  private parseFor(): StatementNode {
    const line = this.peek().line;
    this.advance(); // for
    this.expect(TokenType.LPAREN);

    let init: StatementNode | null = null;
    if (this.peek().type === TokenType.INT || this.peek().type === TokenType.CHAR_KW) {
      init = this.parseVarDecl();
    } else if (this.peek().type !== TokenType.SEMICOLON) {
      const expr = this.parseExpression();
      // Check for assignment
      const assignOps: Record<number, string> = {
        [TokenType.ASSIGN]: '=',
        [TokenType.PLUS_ASSIGN]: '+=',
        [TokenType.MINUS_ASSIGN]: '-=',
        [TokenType.STAR_ASSIGN]: '*=',
        [TokenType.SLASH_ASSIGN]: '/=',
        [TokenType.PERCENT_ASSIGN]: '%=',
        [TokenType.AMP_ASSIGN]: '&=',
        [TokenType.PIPE_ASSIGN]: '|=',
        [TokenType.CARET_ASSIGN]: '^=',
        [TokenType.LSHIFT_ASSIGN]: '<<=',
        [TokenType.RSHIFT_ASSIGN]: '>>=',
      };
      const op = assignOps[this.peek().type];
      if (op) {
        this.advance();
        const value = this.parseExpression();
        this.expect(TokenType.SEMICOLON);
        init = { type: 'assign', target: expr, op, value, line };
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
      const assignOps: Record<number, string> = {
        [TokenType.ASSIGN]: '=',
        [TokenType.PLUS_ASSIGN]: '+=',
        [TokenType.MINUS_ASSIGN]: '-=',
        [TokenType.STAR_ASSIGN]: '*=',
        [TokenType.SLASH_ASSIGN]: '/=',
        [TokenType.PERCENT_ASSIGN]: '%=',
        [TokenType.AMP_ASSIGN]: '&=',
        [TokenType.PIPE_ASSIGN]: '|=',
        [TokenType.CARET_ASSIGN]: '^=',
        [TokenType.LSHIFT_ASSIGN]: '<<=',
        [TokenType.RSHIFT_ASSIGN]: '>>=',
      };
      const op = assignOps[this.peek().type];
      if (op) {
        this.advance();
        const value = this.parseExpression();
        update = { type: 'assign', target: expr, op, value, line };
      } else {
        update = { type: 'expr_stmt', expr, line };
      }
    }
    this.expect(TokenType.RPAREN);
    const body = this.parseBlockOrStatement();
    return { type: 'for', init, condition, update, body, line };
  }

  private parseSwitch(): StatementNode {
    const line = this.peek().line;
    this.advance(); // switch
    this.expect(TokenType.LPAREN);
    const expr = this.parseExpression();
    this.expect(TokenType.RPAREN);
    this.expect(TokenType.LBRACE);

    const cases: SwitchCase[] = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      if (this.peek().type === TokenType.CASE) {
        const caseLine = this.peek().line;
        this.advance(); // case
        let value: number;
        if (this.peek().type === TokenType.MINUS && this.tokens[this.pos + 1]?.type === TokenType.NUMBER) {
          this.advance();
          value = -parseInt(this.advance().value);
        } else if (this.peek().type === TokenType.NUMBER) {
          value = parseInt(this.advance().value);
        } else if (this.peek().type === TokenType.CHAR) {
          value = this.advance().value.charCodeAt(0);
        } else {
          this.errors.push(`Line ${this.peek().line}: Expected constant in case label`);
          value = 0;
          this.advance();
        }
        this.expect(TokenType.COLON);
        const body: StatementNode[] = [];
        while (this.peek().type !== TokenType.CASE && this.peek().type !== TokenType.DEFAULT &&
               this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
          body.push(this.parseStatement());
        }
        cases.push({ value, body, line: caseLine });
      } else if (this.peek().type === TokenType.DEFAULT) {
        const caseLine = this.peek().line;
        this.advance(); // default
        this.expect(TokenType.COLON);
        const body: StatementNode[] = [];
        while (this.peek().type !== TokenType.CASE && this.peek().type !== TokenType.DEFAULT &&
               this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
          body.push(this.parseStatement());
        }
        cases.push({ value: null, body, line: caseLine });
      } else {
        this.errors.push(`Line ${this.peek().line}: Expected 'case' or 'default' in switch`);
        this.advance();
      }
    }
    this.expect(TokenType.RBRACE);
    return { type: 'switch', expr, cases, line };
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
    return this.parseTernary();
  }

  private parseTernary(): ExprNode {
    let expr = this.parseOr();
    if (this.peek().type === TokenType.QUESTION) {
      this.advance();
      const then = this.parseExpression();
      this.expect(TokenType.COLON, "':'");
      const else_ = this.parseTernary();
      expr = { type: 'ternary', condition: expr, then, else_, line: expr.line };
    }
    return expr;
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
      return { type: 'unary', op: 'pre++', operand, line: tok.line };
    }
    if (tok.type === TokenType.DEC) {
      this.advance();
      const operand = this.parsePrimary();
      return { type: 'unary', op: 'pre--', operand, line: tok.line };
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
        expr = { type: 'unary', op: 'post++', operand: expr, line: expr.line };
      } else if (this.peek().type === TokenType.DEC) {
        this.advance();
        expr = { type: 'unary', op: 'post--', operand: expr, line: expr.line };
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

interface LoopContext {
  breakLabel: string;
  continueLabel: string;
  // SP value saved on stack at loop entry — we PUSH the current SP value
  // so nested loops don't clobber each other (unlike the old R10 approach).
  // The SP save is at a known stack offset relative to R11.
  spSaveOffset: number;
}

class CodeGen {
  private output: string[] = [];
  private stringLiterals: { label: string; value: string }[] = [];
  private localVars = new Map<string, number>(); // name -> stack offset from R11
  private globalVars = new Map<string, string>(); // name -> label
  private stackOffset = 0;
  private labelCounter = 0;
  private loopStack: LoopContext[] = [];
  private currentFunction = '';
  private calledFunctions = new Set<string>(); // track function calls for runtime stubs
  errors: string[] = [];

  // Source mapping: for each emitted ASM line index, which C source line generated it
  // -1 means "compiler infrastructure" (prologue/epilogue/runtime), not tied to a specific C line
  private currentSourceLine = -1;
  /** Maps ASM output line index → C source line number (1-based). -1 = no mapping. */
  sourceMap: number[] = [];

  generate(ast: ProgramNode): string {
    this.output = [];
    this.sourceMap = [];
    this.currentSourceLine = -1;

    // Header
    this.emit('; Generated by TinyC compiler');
    this.emit('; Target: CPU-Sim ARM-like ISA');
    this.emit('');

    // C runtime: call main, then halt
    this.emit('  BL main');
    this.emit('  HALT');
    this.emit('');

    // Register global variables
    for (const g of ast.globals) {
      const label = `_g_${g.name}`;
      this.globalVars.set(g.name, label);
    }

    // Generate each function
    for (const fn of ast.functions) {
      this.generateFunction(fn);
    }

    // Emit runtime stubs for built-in functions that were called but not defined
    const userDefinedFunctions = new Set(ast.functions.map(f => f.name));
    this.currentSourceLine = -1; // stubs/data are not tied to user source
    this.emitRuntimeStubs(userDefinedFunctions);

    // Global variable data section
    if (ast.globals.length > 0) {
      this.emit('');
      this.emit('; Global variables');
      for (const g of ast.globals) {
        const label = this.globalVars.get(g.name)!;
        this.emit(`${label}:`);
        this.emit(`  .word ${g.init ?? 0}`);
      }
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

  /** Emit assembly stubs for built-in functions (putchar, getchar, exit, print_num)
   *  that were called but not defined by the user program. */
  private emitRuntimeStubs(userDefined: Set<string>): void {
    const builtins: Record<string, () => void> = {
      // putchar(ch) — print character via SWI #11
      putchar: () => {
        this.emit('; Built-in: putchar(ch)');
        this.emit('putchar:');
        this.emit('  SWI #11');        // R0 already has the char
        this.emit('  BX LR');
      },
      // getchar() — read character via SWI #12, returns in R0
      getchar: () => {
        this.emit('; Built-in: getchar()');
        this.emit('getchar:');
        this.emit('  SWI #12');
        this.emit('  BX LR');
      },
      // exit(code) — halt the CPU
      exit: () => {
        this.emit('; Built-in: exit(code)');
        this.emit('exit:');
        this.emit('  HALT');
      },
      // print_num(n) — print a signed integer as decimal string
      print_num: () => {
        this.emit('; Built-in: print_num(n) — print signed integer');
        this.emit('print_num:');
        this.emit('  PUSH {R4, R5, R6, LR}');
        this.emit('  MOV R4, R0');           // R4 = n
        this.emit('  MOV R5, #0');           // R5 = digit count
        // Handle negative
        this.emit('  CMP R4, #0');
        const skipNeg = this.newLabel('pn_pos');
        this.emit(`  BGE ${skipNeg}`);
        this.emit('  MOV R0, #45');          // '-'
        this.emit('  SWI #11');
        this.emit('  MOV R6, #0');
        this.emit('  SUB R4, R6, R4');       // R4 = -R4
        this.emit(`${skipNeg}:`);
        // Handle zero
        this.emit('  CMP R4, #0');
        const notZero = this.newLabel('pn_nz');
        this.emit(`  BNE ${notZero}`);
        this.emit('  MOV R0, #48');          // '0'
        this.emit('  SWI #11');
        const done = this.newLabel('pn_done');
        this.emit(`  B ${done}`);
        this.emit(`${notZero}:`);
        // Push digits onto stack (reversed)
        const pushLoop = this.newLabel('pn_push');
        this.emit(`${pushLoop}:`);
        this.emit('  CMP R4, #0');
        const printPhase = this.newLabel('pn_print');
        this.emit(`  BEQ ${printPhase}`);
        this.emit('  MOD R6, R4, #10');
        this.emit('  ADD R6, R6, #48');      // ASCII digit
        this.emit('  PUSH {R6}');
        this.emit('  ADD R5, R5, #1');       // count++
        this.emit('  DIV R4, R4, #10');
        this.emit(`  B ${pushLoop}`);
        // Pop and print digits
        this.emit(`${printPhase}:`);
        const popLoop = this.newLabel('pn_pop');
        this.emit(`${popLoop}:`);
        this.emit('  CMP R5, #0');
        this.emit(`  BEQ ${done}`);
        this.emit('  POP {R0}');
        this.emit('  SWI #11');
        this.emit('  SUB R5, R5, #1');
        this.emit(`  B ${popLoop}`);
        this.emit(`${done}:`);
        this.emit('  POP {R4, R5, R6, LR}');
        this.emit('  BX LR');
      },
    };

    for (const name of this.calledFunctions) {
      if (!userDefined.has(name) && builtins[name]) {
        this.emit('');
        builtins[name]();
      }
    }
  }

  private emit(line: string): void {
    this.sourceMap.push(this.currentSourceLine);
    this.output.push(line);
  }

  private newLabel(prefix: string = 'L'): string {
    return `${prefix}${this.labelCounter++}`;
  }

  private generateFunction(fn: FunctionNode): void {
    this.currentFunction = fn.name;
    this.currentSourceLine = fn.line;  // function declaration line
    this.emit(`; Function: ${fn.name}`);
    this.emit(`${fn.name}:`);

    // Prologue: save LR and FP, set up frame
    this.emit('  PUSH {R11}');
    this.emit('  PUSH {LR}');
    this.emit(`  MOV R11, SP`);  // R11 = frame pointer

    // Reset local scope
    this.localVars.clear();
    this.stackOffset = 0;

    // Parameters are passed in R0-R3, push them onto the stack
    for (let i = 0; i < fn.params.length && i < 4; i++) {
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

  /**
   * Emit code to restore SP from the loop context's saved value.
   * The saved SP is at [R11, #-spSaveOffset].
   */
  private emitLoopSpRestore(ctx: LoopContext): void {
    this.emit(`  LDR SP, [R11, #-${ctx.spSaveOffset}]`);
  }

  private generateStatement(stmt: StatementNode): void {
    // Track which C source line we're generating code for
    this.currentSourceLine = stmt.line;

    switch (stmt.type) {
      case 'vardecl': {
        if (stmt.arraySize !== null) {
          // Local array: allocate arraySize * 4 bytes on stack
          // The variable holds the address of the first element
          const totalBytes = stmt.arraySize * 4;
          this.emit(`  SUB SP, SP, #${totalBytes}`);
          this.stackOffset += totalBytes;
          // Save the base address of the array as a local variable
          this.emit('  MOV R0, SP');  // R0 = address of arr[0]
          this.emit('  PUSH {R0}');   // Push the array base address as the var
          this.stackOffset += 4;
          this.localVars.set(stmt.name, this.stackOffset);
        } else {
          this.stackOffset += 4;
          this.localVars.set(stmt.name, this.stackOffset);
          if (stmt.init) {
            this.generateExpr(stmt.init, 0); // result in R0
            this.emit('  PUSH {R0}');
          } else {
            this.emit('  MOV R0, #0');
            this.emit('  PUSH {R0}');
          }
        }
        break;
      }

      case 'assign': {
        // For compound assignments, load current value, apply op, then store
        if (stmt.op === '=') {
          this.generateExpr(stmt.value, 0);
          this.emitStore(stmt.target, 0);
        } else {
          // Compound assignment: target op= value
          // e.g., x += 5 means x = x + 5
          // Load current value of target
          this.generateExpr(stmt.target, 0);
          this.emit('  PUSH {R0}');
          this.generateExpr(stmt.value, 1);
          this.emit('  POP {R0}');
          const opMap: Record<string, string> = {
            '+=': 'ADD', '-=': 'SUB', '*=': 'MUL', '/=': 'DIV', '%=': 'MOD',
            '&=': 'AND', '|=': 'ORR', '^=': 'EOR', '<<=': 'LSL', '>>=': 'ASR',
          };
          const asmOp = opMap[stmt.op];
          if (asmOp) {
            this.emit(`  ${asmOp} R0, R0, R1`);
          }
          this.emitStore(stmt.target, 0);
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

        // Save scope state
        const savedOffset = this.stackOffset;
        const savedVars = new Map(this.localVars);

        // Reserve a stack slot for the loop SP save.
        // We push a placeholder first, then store SP into that slot.
        // This way the saved SP value *includes* the save slot itself,
        // so restoring SP won't let subsequent pushes clobber the slot.
        this.stackOffset += 4;
        const spSaveOffset = this.stackOffset;
        this.emit('  PUSH {R0}');            // reserve slot (value doesn't matter)
        this.emit(`  STR SP, [R11, #-${spSaveOffset}]`); // save SP (pointing at the slot)

        const ctx: LoopContext = { breakLabel: endLabel, continueLabel: startLabel, spSaveOffset };
        this.loopStack.push(ctx);

        this.emit(`${startLabel}:`);
        // Restore SP to loop entry (reclaim body locals from previous iteration)
        this.emitLoopSpRestore(ctx);

        this.generateExpr(stmt.condition, 0);
        this.emit('  CMP R0, #0');
        this.emit(`  BEQ ${endLabel}`);

        for (const s of stmt.body) this.generateStatement(s);

        this.emit(`  B ${startLabel}`);
        this.emit(`${endLabel}:`);
        // Restore SP one final time (for break or condition-false exit)
        this.emitLoopSpRestore(ctx);

        // Restore scope
        this.stackOffset = savedOffset;
        this.localVars = savedVars;
        this.loopStack.pop();
        break;
      }

      case 'dowhile': {
        const startLabel = this.newLabel('dowhile');
        const condLabel = this.newLabel('dowhile_cond');
        const endLabel = this.newLabel('enddowhile');

        // Save scope state
        const savedOffset = this.stackOffset;
        const savedVars = new Map(this.localVars);

        // Reserve a stack slot for the loop SP save.
        this.stackOffset += 4;
        const spSaveOffset = this.stackOffset;
        this.emit('  PUSH {R0}');            // reserve slot
        this.emit(`  STR SP, [R11, #-${spSaveOffset}]`); // save SP (including slot)

        const ctx: LoopContext = { breakLabel: endLabel, continueLabel: condLabel, spSaveOffset };
        this.loopStack.push(ctx);

        this.emit(`${startLabel}:`);
        // Restore SP to loop entry (reclaim body locals from previous iteration)
        this.emitLoopSpRestore(ctx);

        for (const s of stmt.body) this.generateStatement(s);

        this.emit(`${condLabel}:`);
        // Restore SP before condition eval (body may have pushed locals)
        this.emitLoopSpRestore(ctx);
        this.generateExpr(stmt.condition, 0);
        this.emit('  CMP R0, #0');
        this.emit(`  BNE ${startLabel}`);

        this.emit(`${endLabel}:`);
        this.emitLoopSpRestore(ctx);

        // Restore scope
        this.stackOffset = savedOffset;
        this.localVars = savedVars;
        this.loopStack.pop();
        break;
      }

      case 'for': {
        const startLabel = this.newLabel('for');
        const updateLabel = this.newLabel('forupdate');
        const endLabel = this.newLabel('endfor');

        // Save outer scope (init var like `int i = 0` is scoped to for)
        const savedOffsetOuter = this.stackOffset;
        const savedVarsOuter = new Map(this.localVars);

        // Generate init (may declare a variable)
        if (stmt.init) this.generateStatement(stmt.init);

        // Reserve a stack slot for the loop SP save.
        this.stackOffset += 4;
        const spSaveOffset = this.stackOffset;
        this.emit('  PUSH {R0}');            // reserve slot
        this.emit(`  STR SP, [R11, #-${spSaveOffset}]`); // save SP (including slot)

        // continue jumps to updateLabel, which restores SP then runs update
        const ctx: LoopContext = { breakLabel: endLabel, continueLabel: updateLabel, spSaveOffset };
        this.loopStack.push(ctx);

        this.emit(`${startLabel}:`);
        // Restore SP to reclaim body locals from previous iteration
        this.emitLoopSpRestore(ctx);

        if (stmt.condition) {
          this.generateExpr(stmt.condition, 0);
          this.emit('  CMP R0, #0');
          this.emit(`  BEQ ${endLabel}`);
        }

        for (const s of stmt.body) this.generateStatement(s);

        this.emit(`${updateLabel}:`);
        // Restore SP before update (body may have pushed locals)
        this.emitLoopSpRestore(ctx);
        if (stmt.update) this.generateStatement(stmt.update);
        this.emit(`  B ${startLabel}`);

        this.emit(`${endLabel}:`);
        // Restore SP on exit
        this.emitLoopSpRestore(ctx);

        // Restore outer scope (reclaims init var + SP save slot)
        this.stackOffset = savedOffsetOuter;
        this.localVars = savedVarsOuter;
        this.loopStack.pop();
        break;
      }

      case 'switch': {
        const endLabel = this.newLabel('endswitch');

        // Evaluate switch expression into R0
        this.generateExpr(stmt.expr, 0);

        // Generate labels for each case
        const caseLabels: { value: number | null; label: string }[] = [];
        let defaultLabel: string | null = null;
        for (const c of stmt.cases) {
          const label = this.newLabel('case');
          caseLabels.push({ value: c.value, label });
          if (c.value === null) defaultLabel = label;
        }

        // Compare and branch to each case (R0 holds switch value throughout)
        for (const cl of caseLabels) {
          if (cl.value !== null) {
            this.emitLoadImm(1, cl.value);
            this.emit('  CMP R0, R1');
            this.emit(`  BEQ ${cl.label}`);
          }
        }
        // Jump to default or end (no stack cleanup needed — nothing was pushed)
        this.emit(`  B ${defaultLabel || endLabel}`);

        // Push break label (switch supports break)
        const ctx: LoopContext = { breakLabel: endLabel, continueLabel: '', spSaveOffset: 0 };
        this.loopStack.push(ctx);

        // Generate case bodies (fall-through works naturally since no POP)
        for (let i = 0; i < stmt.cases.length; i++) {
          this.emit(`${caseLabels[i].label}:`);
          for (const s of stmt.cases[i].body) {
            this.generateStatement(s);
          }
        }

        this.emit(`${endLabel}:`);
        this.loopStack.pop();
        break;
      }

      case 'return': {
        if (stmt.value) {
          this.generateExpr(stmt.value, 0); // Return value in R0
        }
        this.emit('  MOV SP, R11');
        this.emit('  POP {LR}');
        this.emit('  POP {R11}');
        this.emit('  BX LR');
        break;
      }

      case 'break': {
        const ctx = this.loopStack[this.loopStack.length - 1];
        if (ctx) {
          // Restore SP to loop entry before breaking
          if (ctx.spSaveOffset > 0) {
            this.emitLoopSpRestore(ctx);
          }
          this.emit(`  B ${ctx.breakLabel}`);
        } else {
          this.errors.push(`Line ${stmt.line}: 'break' used outside of a loop or switch`);
        }
        break;
      }

      case 'continue': {
        const ctx = this.loopStack[this.loopStack.length - 1];
        if (ctx && ctx.continueLabel) {
          // Restore SP to loop entry before continuing
          if (ctx.spSaveOffset > 0) {
            this.emitLoopSpRestore(ctx);
          }
          this.emit(`  B ${ctx.continueLabel}`);
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

  /**
   * Emit code to store R{reg} into the given target expression.
   * Handles ident, deref, and index targets. Reports error for unsupported targets.
   */
  private emitStore(target: ExprNode, reg: number): void {
    if (target.type === 'ident') {
      const offset = this.localVars.get(target.name);
      if (offset !== undefined) {
        this.emit(`  STR R${reg}, [R11, #-${offset}]`);
      } else {
        const globalLabel = this.globalVars.get(target.name);
        if (globalLabel) {
          const tmpReg = reg === 1 ? 2 : 1;
          this.emit(`  MOVW R${tmpReg}, #${globalLabel}`);
          this.emit(`  STR R${reg}, [R${tmpReg}]`);
        } else {
          this.errors.push(`Line ${target.line}: Cannot assign to undefined variable '${target.name}'`);
        }
      }
    } else if (target.type === 'deref') {
      // *ptr = value — save value, compute address, store
      this.emit(`  PUSH {R${reg}}`);
      const addrReg = reg === 1 ? 2 : 1;
      this.generateExpr(target.operand, addrReg);
      this.emit(`  POP {R${reg}}`);
      this.emit(`  STR R${reg}, [R${addrReg}]`);
    } else if (target.type === 'index') {
      // arr[i] = value — save value, compute address, store
      this.emit(`  PUSH {R${reg}}`);
      this.generateExpr(target.array, 1);
      this.emit('  PUSH {R1}');
      this.generateExpr(target.index, 2);
      this.emit('  LSL R2, R2, #2');   // * 4 for word size
      this.emit('  POP {R1}');
      this.emit('  ADD R1, R1, R2');
      this.emit(`  POP {R${reg}}`);
      this.emit(`  STR R${reg}, [R1]`);
    } else {
      this.errors.push(`Line ${target.line}: Invalid assignment target`);
    }
  }

  /**
   * Emit code to load an immediate value into a register.
   * Handles values of any size using MOVW/MOVT.
   */
  private emitLoadImm(reg: number, val: number): void {
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
  }

  /** Generate expression, result in register `reg` */
  private generateExpr(expr: ExprNode, reg: number): void {
    switch (expr.type) {
      case 'number': {
        this.emitLoadImm(reg, expr.value);
        break;
      }

      case 'string': {
        const label = this.newLabel('str');
        this.stringLiterals.push({ label, value: expr.value });
        // Load string address — MOVW loads lower 16 bits, which is sufficient
        // for our 32KB address space. The assembler resolves the label.
        this.emit(`  MOVW R${reg}, #${label}`);
        break;
      }

      case 'ident': {
        const offset = this.localVars.get(expr.name);
        if (offset !== undefined) {
          this.emit(`  LDR R${reg}, [R11, #-${offset}]`);
        } else {
          const globalLabel = this.globalVars.get(expr.name);
          if (globalLabel) {
            this.emit(`  MOVW R${reg}, #${globalLabel}`);
            this.emit(`  LDR R${reg}, [R${reg}]`);
          } else {
            this.errors.push(`Line ${expr.line}: Undefined variable '${expr.name}'`);
          }
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
        this.emit(`  PUSH {R${reg}}`);
        const tmpReg = reg === 0 ? 1 : 0;
        this.generateExpr(expr.right, tmpReg);
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
        if (expr.op === 'pre++' || expr.op === 'pre--') {
          // Pre-increment/decrement: load, modify, store back, result is new value
          this.generateExpr(expr.operand, reg);
          const addOp = expr.op === 'pre++' ? 'ADD' : 'SUB';
          this.emit(`  ${addOp} R${reg}, R${reg}, #1`);
          this.emitStore(expr.operand, reg);
          break;
        }
        if (expr.op === 'post++' || expr.op === 'post--') {
          // Post-increment/decrement: load, save old value, modify, store back
          this.generateExpr(expr.operand, reg);
          const tmpReg = reg === 0 ? 1 : 0;
          this.emit(`  MOV R${tmpReg}, R${reg}`);
          const addOp = expr.op === 'post++' ? 'ADD' : 'SUB';
          this.emit(`  ${addOp} R${tmpReg}, R${tmpReg}, #1`);
          this.emitStore(expr.operand, tmpReg);
          // R{reg} still holds the original value
          break;
        }

        this.generateExpr(expr.operand, reg);
        if (expr.op === '-') {
          this.emit(`  RSB R${reg}, R${reg}, #0`);
        } else if (expr.op === '~') {
          this.emit(`  MVN R${reg}, R${reg}`);
        } else if (expr.op === '!') {
          this.emit(`  CMP R${reg}, #0`);
          this.emit(`  MOV R${reg}, #0`);
          this.emit(`  MOVEQ R${reg}, #1`);
        }
        break;
      }

      case 'ternary': {
        const elseLabel = this.newLabel('tern_else');
        const endLabel = this.newLabel('tern_end');
        this.generateExpr(expr.condition, reg);
        this.emit(`  CMP R${reg}, #0`);
        this.emit(`  BEQ ${elseLabel}`);
        this.generateExpr(expr.then, reg);
        this.emit(`  B ${endLabel}`);
        this.emit(`${elseLabel}:`);
        this.generateExpr(expr.else_, reg);
        this.emit(`${endLabel}:`);
        break;
      }

      case 'call': {
        if (expr.args.length > 4) {
          this.errors.push(`Line ${expr.line}: Function call '${expr.name}' has ${expr.args.length} arguments (max 4 supported)`);
        }
        this.calledFunctions.add(expr.name);
        const argCount = Math.min(expr.args.length, 4);
        for (let i = 0; i < argCount; i++) {
          this.generateExpr(expr.args[i], 0);
          this.emit('  PUSH {R0}');
        }
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
        const sArgCount = Math.min(expr.args.length, 4);
        for (let i = 0; i < sArgCount; i++) {
          this.generateExpr(expr.args[i], 0);
          this.emit('  PUSH {R0}');
        }
        for (let i = sArgCount - 1; i >= 0; i--) {
          this.emit(`  POP {R${i}}`);
        }
        if (expr.number.type === 'number') {
          this.emit(`  SWI #${expr.number.value}`);
        } else {
          // Dynamic syscall numbers are not supported — the SWI instruction
          // encodes the number directly, so it must be a compile-time constant.
          this.errors.push(`Line ${expr.line}: Syscall number must be a constant (SWI encodes it in the instruction)`);
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
          } else {
            const globalLabel = this.globalVars.get(expr.operand.name);
            if (globalLabel) {
              this.emit(`  MOVW R${reg}, #${globalLabel}`);
            } else {
              this.errors.push(`Line ${expr.line}: Cannot take address of undefined variable '${expr.operand.name}'`);
            }
          }
        } else if (expr.operand.type === 'index') {
          // &arr[i] — compute address without loading the value
          this.generateExpr(expr.operand.array, reg);
          this.emit(`  PUSH {R${reg}}`);
          const tmpReg = reg === 0 ? 1 : 0;
          this.generateExpr(expr.operand.index, tmpReg);
          this.emit(`  LSL R${tmpReg}, R${tmpReg}, #2`); // * 4
          this.emit(`  POP {R${reg}}`);
          this.emit(`  ADD R${reg}, R${reg}, R${tmpReg}`);
        } else if (expr.operand.type === 'deref') {
          // &(*ptr) == ptr — just evaluate the pointer
          this.generateExpr(expr.operand.operand, reg);
        } else {
          this.errors.push(`Line ${expr.line}: Cannot take address of this expression`);
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

/** Maps ASM line index (0-based) → C source line (1-based). -1 = infrastructure/no mapping. */
export type SourceMap = number[];

export interface CompilerResult {
  success: boolean;
  assembly: string;
  assemblerResult: AssemblerResult | null;
  errors: string[];
  /** Maps each generated ASM line (0-based index) to its originating C source line (1-based). -1 = no mapping. */
  sourceMap: SourceMap;
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
      sourceMap: [],
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
      sourceMap: [],
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
      sourceMap: codegen.sourceMap,
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
    sourceMap: codegen.sourceMap,
  };
}
