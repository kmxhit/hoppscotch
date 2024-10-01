/**
 *  Copyright (c) 2019 GraphQL Contributors
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

/**
 * This JSON parser simply walks the input, generating an AST. Use this in lieu
 * of JSON.parse if you need character offset parse errors and an AST parse tree
 * with location information.
 *
 * If an error is encountered, a SyntaxError will be thrown, with properties:
 *
 *   - message: string
 *   - start: int - the start inclusive offset of the syntax error
 *   - end: int - the end exclusive offset of the syntax error
 *
 */
type JSONEOFValue = {
  kind: "EOF"
  start: number
  end: number
}

type JSONNullValue = {
  kind: "Null"
  start: number
  end: number
}

type JSONNumberValue = {
  kind: "Number"
  start: number
  end: number
  value: number
}

type JSONStringValue = {
  kind: "String"
  start: number
  end: number
  value: string
}

type JSONBooleanValue = {
  kind: "Boolean"
  start: number
  end: number
  value: boolean
}

type JSONPrimitiveValue =
  | JSONNullValue
  | JSONEOFValue
  | JSONStringValue
  | JSONNumberValue
  | JSONBooleanValue

export type JSONObjectValue = {
  kind: "Object"
  start: number
  end: number
  // eslint-disable-next-line no-use-before-define
  members: JSONObjectMember[]
}

export type JSONArrayValue = {
  kind: "Array"
  start: number
  end: number
  // eslint-disable-next-line no-use-before-define
  values: JSONValue[]
}

export type JSONValue = JSONObjectValue | JSONArrayValue | JSONPrimitiveValue

export type JSONObjectMember = {
  kind: "Member"
  start: number
  end: number
  key: JSONStringValue
  value: JSONValue
}

export default function jsonParse(
  str: string
): JSONObjectValue | JSONArrayValue {
  string = str
  strLen = str.length
  start = end = lastEnd = -1
  ch()
  lex() // Pass the allowComments flag to lex()
  try {
    const ast = parseObj()
    expect("EOF")
    return ast
  } catch (e) {
    // Try parsing expecting a root array
    const ast = parseArr()
    expect("EOF")
    return ast
  }
}

let string: string
let strLen: number
let start: number
let end: number
let lastEnd: number
let code: number
let kind: string

function parseObj(): JSONObjectValue {
  const nodeStart = start
  const members = []
  expect("{")
  while (!skip("}")) {
    members.push(parseMember())
    if (!skip(",")) {
      expect("}")
      break
    }
  }
  return {
    kind: "Object",
    start: nodeStart,
    end: lastEnd,
    members,
  }
}

function parseMember(): JSONObjectMember {
  const nodeStart = start
  const key = kind === "String" ? (curToken() as JSONStringValue) : null
  expect("String")
  expect(":")
  const value = parseVal()
  return {
    kind: "Member",
    start: nodeStart,
    end: lastEnd,
    key: key!,
    value,
  }
}

function parseArr(): JSONArrayValue {
  const nodeStart = start
  const values: JSONValue[] = []
  expect("[")
  while (!skip("]")) {
    values.push(parseVal())
    if (!skip(",")) {
      expect("]")
      break
    }
  }
  return {
    kind: "Array",
    start: nodeStart,
    end: lastEnd,
    values,
  }
}

function parseVal(): JSONValue {
  switch (kind) {
    case "[":
      return parseArr()
    case "{":
      return parseObj()
    case "String":
    case "Number":
    case "Boolean":
    case "Null":
      // eslint-disable-next-line no-case-declarations
      const token = curToken()
      lex()
      return token
  }
  return expect("Value") as never
}

function curToken(): JSONPrimitiveValue {
  return {
    kind: kind as any,
    start,
    end,
    value: JSON.parse(string.slice(start, end)),
  }
}

function expect(str: string) {
  if (kind === str) {
    lex()
    return
  }

  let found
  if (kind === "EOF") {
    found = "[end of file]"
  } else if (end - start > 1) {
    found = `\`${string.slice(start, end)}\``
  } else {
    const match = string.slice(start).match(/^.+?\b/)
    found = `\`${match ? match[0] : string[start]}\``
  }

  throw syntaxError(`Expected ${str} but found ${found}.`)
}

type SyntaxError = {
  message: string
  start: number
  end: number
}

function syntaxError(message: string): SyntaxError {
  return { message, start, end }
}

function skip(k: string) {
  if (kind === k) {
    lex()
    return true
  }
}

function ch() {
  if (end < strLen) {
    end++
    code = end === strLen ? 0 : string.charCodeAt(end)
  }
}

function lex() {
  lastEnd = end

  // Skip whitespace and comments
  while (true) {
    // Skip whitespace (space, tab, newline, etc.)
    while (code === 9 || code === 10 || code === 13 || code === 32) {
      ch()
    }

    // Check for single-line comment (//)
    if (code === 47 && string.charCodeAt(end + 1) === 47) {
      // 47 is '/'
      while (code !== 10 && code !== 13 && code !== 0) {
        // Skip until newline or EOF
        ch()
      }
      continue // After skipping the comment, recheck for more whitespace/comments
    }

    // Check for multi-line comment (/* */)
    if (code === 47 && string.charCodeAt(end + 1) === 42) {
      // 42 is '*'
      ch() // Skip the '*'
      ch() // Move past the opening '/*'
      while (
        code !== 0 &&
        !(code === 42 && string.charCodeAt(end + 1) === 47)
      ) {
        // Look for '*/'
        ch()
      }
      ch() // Skip the '*'
      ch() // Move past the closing '*/'
      continue // After skipping the comment, recheck for more whitespace/comments
    }

    break // Exit loop when no more comments or whitespace
  }

  if (code === 0) {
    kind = "EOF"
    return
  }

  start = end

  switch (code) {
    // Handle strings, numbers, booleans, null, etc.
    case 34: // "
      kind = "String"
      return readString()
    case 45: // -
    case 48: // 0
    case 49: // 1
    case 50: // 2
    case 51: // 3
    case 52: // 4
    case 53: // 5
    case 54: // 6
    case 55: // 7
    case 56: // 8
    case 57: // 9
      kind = "Number"
      return readNumber()
    case 102: // 'f' for "false"
      if (string.slice(start, start + 5) === "false") {
        end += 4
        ch()
        kind = "Boolean"
        return
      }
      break
    case 110: // 'n' for "null"
      if (string.slice(start, start + 4) === "null") {
        end += 3
        ch()
        kind = "Null"
        return
      }
      break
    case 116: // 't' for "true"
      if (string.slice(start, start + 4) === "true") {
        end += 3
        ch()
        kind = "Boolean"
        return
      }
      break
  }

  kind = string[start]
  ch()
}

function readString() {
  ch()
  while (code !== 34 && code > 31) {
    if (code === (92 as any)) {
      // \
      ch()
      switch (code) {
        case 34: // "
        case 47: // /
        case 92: // \
        case 98: // b
        case 102: // f
        case 110: // n
        case 114: // r
        case 116: // t
          ch()
          break
        case 117: // u
          ch()
          readHex()
          readHex()
          readHex()
          readHex()
          break
        default:
          throw syntaxError("Bad character escape sequence.")
      }
    } else if (end === strLen) {
      throw syntaxError("Unterminated string.")
    } else {
      ch()
    }
  }

  if (code === 34) {
    ch()
    return
  }

  throw syntaxError("Unterminated string.")
}

function readHex() {
  if (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 70) || // A-F
    (code >= 97 && code <= 102) // a-f
  ) {
    return ch()
  }
  throw syntaxError("Expected hexadecimal digit.")
}

function readNumber() {
  if (code === 45) {
    // -
    ch()
  }

  if (code === 48) {
    // 0
    ch()
  } else {
    readDigits()
  }

  if (code === 46) {
    // .
    ch()
    readDigits()
  }

  if (code === 69 || code === 101) {
    // E e
    ch()
    if (code === (43 as any) || code === (45 as any)) {
      // + -
      ch()
    }
    readDigits()
  }
}

function readDigits() {
  if (code < 48 || code > 57) {
    // 0 - 9
    throw syntaxError("Expected decimal digit.")
  }
  do {
    ch()
  } while (code >= 48 && code <= 57) // 0 - 9
}
