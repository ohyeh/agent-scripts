"""Writes hooks/schemas.ts: built-in tool input JSON schemas, from this build's types file.

  python3 scripts/gen-schemas.py <types file> hooks/schemas.ts

<types file>: the plugin-authoring skill's types/claude-code.d.ts, or a laid
.claude-plugin/types/claude-code-tools/index.d.ts. It reads the last `interface BuiltinToolInputs {`
(TypeScript types with /** doc */ comments) and turns each tool's type into JSON Schema.
Run it again after a Claude Code update. Handles what that block uses: string/number/boolean/
unknown/null, string literals and their unions, T[], Array<T>, nested { ... }, optional `?`, `&`.
"""
import json
import re
import sys

TOKEN = re.compile(r'\s+|(/\*\*.*?\*/)|(//[^\n]*)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*)|(.)', re.S)


def tokens(text):
    out = []
    for m in TOKEN.finditer(text):
        doc, _line, s, num, ident, punct = m.groups()
        if doc:
            out.append(('doc', re.sub(r'^\s*\*\s?', '', doc[3:-2].strip(), flags=re.M).strip()))
        elif s:
            out.append(('str', json.loads(s)))
        elif num:
            out.append(('num', float(num)))
        elif ident:
            out.append(('id', ident))
        elif punct:
            out.append(('p', punct))
    return out


class Parser:
    def __init__(self, toks):
        self.t, self.i = toks, 0

    def _next(self):  # index of the next non-doc token; peek never consumes docs
        j = self.i
        while j < len(self.t) and self.t[j][0] == 'doc':
            j += 1
        return j

    def peek(self):
        j = self._next()
        return self.t[j] if j < len(self.t) else ('eof', None)

    def take(self, value=None):
        tok = self.peek()
        if value is not None and tok[1] != value:
            raise ValueError(f'expected {value!r}, got {tok!r} at token {self.i}')
        self.i = self._next() + 1
        return tok

    def type(self):
        if self.peek()[1] == '|':
            self.take()
        parts = [self.inter()]
        while self.peek()[1] == '|':
            self.take()
            parts.append(self.inter())
        if len(parts) == 1:
            return parts[0]
        if all('const' in p for p in parts):
            return {'type': 'string', 'enum': [p['const'] for p in parts]}
        return {'anyOf': parts}

    def inter(self):
        parts = [self.postfix()]
        while self.peek()[1] == '&':
            self.take()
            parts.append(self.postfix())
        parts = [p for p in parts if p]  # unknown & unknown → {}
        return parts[0] if len(parts) == 1 else ({'allOf': parts} if parts else {})

    def postfix(self):
        t = self.primary()
        while self.peek()[1] == '[':
            self.take('[')
            self.take(']')
            t = {'type': 'array', 'items': t}
        return t

    def primary(self):
        kind, v = self.take()
        if kind == 'str':
            return {'const': v}
        if kind == 'num':
            return {'const': v}
        if v == '(':
            t = self.type()
            self.take(')')
            return t
        if v == '{':
            return self.members()
        simple = {'string': {'type': 'string'}, 'number': {'type': 'number'}, 'boolean': {'type': 'boolean'},
                  'null': {'type': 'null'}, 'unknown': {}, 'any': {}, 'true': {'const': True}, 'false': {'const': False}}
        if v in simple:
            return dict(simple[v])
        if v == 'Array':
            self.take('<')
            t = self.type()
            self.take('>')
            return {'type': 'array', 'items': t}
        if v == 'Record':
            self.take('<')
            self.type()
            self.take(',')
            t = self.type()
            self.take('>')
            return {'type': 'object', 'additionalProperties': t}
        raise ValueError(f'unhandled type token {v!r} at {self.i}')

    def members(self):
        props, required = {}, []
        while True:
            doc = None
            while self.i < len(self.t) and self.t[self.i][0] == 'doc':
                doc = self.t[self.i][1]
                self.i += 1
            kind, v = self.take()
            if v == '}':
                break
            if v in (';', ','):
                continue
            name = v
            optional = self.peek()[1] == '?'
            if optional:
                self.take('?')
            self.take(':')
            t = self.type()
            if doc:
                t = {**t, 'description': doc}
            props[name] = t
            if not optional:
                required.append(name)
        out = {'type': 'object', 'properties': props}
        if required:
            out['required'] = required
        return out


def parse(text):
    start = text.rfind('interface BuiltinToolInputs {')
    if start < 0:
        raise SystemExit('no `interface BuiltinToolInputs {` in the types file')
    p = Parser(tokens(text[text.index('{', start):]))
    p.take('{')
    tools = p.members()['properties']
    for schema in tools.values():
        schema.pop('description', None)
    return tools


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    schemas = parse(open(src, encoding='utf-8').read())
    version = re.search(r'bundled-skills/([^/]+)/', src)
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        f.write(f'// Generated by scripts/gen-schemas.py from Claude Code {version.group(1) if version else "?"} types. Do not edit.\n')
        f.write('export const SCHEMAS: Record<string, Record<string, unknown>> = ')
        f.write(json.dumps(schemas, indent=1, ensure_ascii=False))
        f.write('\n')
    assert schemas['Read']['required'] == ['file_path'] and 'command' in schemas['Bash']['required'], 'Read/Bash schema check failed'
    print(f'{len(schemas)} tool schemas → {dst}; Read/Bash check ok')
