// High level TODO's:
// - The keyword parsing for `rule` is horrific, need to simplify and
// generalize the mechanism to parse other keywords.
// - I'm not satisfied with the error handling at all. Really need to store
// the last line or so in a simple ring buffer so that we can give sensible
// diagnostics. Also need to keep track of the line and column number (or
// at least have some way of recovering it).
// - Need to have a way of saying "do this, then continue to state X", so
// that common functionality, like whitespace skipping, can be centralized.
// - Would things be significantly simplified by putting a "split on
// newline" stream in front? Then all the chunks would be full lines, which
// I think would significantly reduce the number of possible intermediate
// states that the parser might be in at the end of a chunk.
//
// Should probably go for just the "depfile parser" and come back to this
// once I have picked up the groove of writing streaming parsers.


var Writable = require('stream').Writable;
var util = require('util');

module.exports = function () {
    return new NinjaParser();
};

function NinjaParser() {
    Writable.call(this, {decodeStrings: false});
    // Any previous input that we weren't able to consume.
    // XXX: does this even make sense?
    this._previous = '';
    // Holds whatever amount of a varname we have parsed so far.
    this._varnameSoFar = '';
    // Holds the current state we're in.
    this._state = 0x00; // TOP_LEVEL. FIXME: avoid hoisting and use `TOP_LEVEL`.
    // Buffers up until chunks until a full line is found (well, permitting
    // $\n escapes).
    this._waitingForNewline = '';

    this.on('finish', function () {
        this._doParse(this._waitingForNewline);
    });
}

NinjaParser.prototype = Object.create(Writable.prototype, {
  constructor: { value: NinjaParser }
});

function cleanDollarNewlineEscapes(chunk) {
    return chunk.replace(/(\$\n)/g, function (match, p1, offset, string) {
        if (offset === 0 || string.charAt(offset - 1) === '$') {
            return match;
        }
        return '';
    });
}

NinjaParser.prototype._write = function (chunk, encoding, done) {
    // TODO: keep track of current line
    if (chunk.length === 0) { done(); return; }
    if (Buffer.isBuffer(chunk)) { chunk = chunk.toString(encoding); }
    chunk = this._waitingForNewline + chunk;
    chunk = cleanDollarNewlineEscapes(chunk);
    for (;;) {
        var idx = chunk.indexOf('\n');
        if (idx === -1) { break; }
        this._doParse(chunk.slice(0, idx));
        chunk = chunk.slice(idx + 1);
    }
    this._waitingForNewline = chunk;
    done();
};

function kwMatcher(kw) {
    var kw0 = kw.charCodeAt(0);
    var kwLen = kw.length;
    return function (chunk, i) {
        if ((chunk.length - i) >= kwLen && chunk.slice(i, i + kwLen) === kw) {
            return true;
        }
        return false;
    }
}

var kwRULE = kwMatcher('rule');

var KW_RULE_STATES = 0x10;
var KW_RULE_STATE1 = 0x11; // read 'r'
var KW_RULE_STATE2 = 0x12; // read 'u'
var KW_RULE_STATE3 = 0x13; // read 'l'
var KW_RULE_STATE4 = 0x14; // read 'e' (next char must be whitespace)
var KW_RULE_STATE_SKIP_SPACE = 0x15;
function inKWState(state, mask) {
    return (state & ~0xF) === mask;
}
// FIXME: This is a mess.
var TOP_LEVEL = 0x00;
var RULE_NEED_INIT_VARNAME = 0x70;
var RULE_FINISH_VARNAME = 0x71;
var RULE_WANT_NEWLINE = 0x72;
// TODO: Want some way to share this syntax production with `build` and any
// others that use an "indented suite".
var RULE_WANT_KEY_EQ_VALUE_PAIRS= 0x73;

// Some high bit that won't interfere with the other states.
// If this is set, then before doing anything else we skip whitespace.
var FLAG_SKIPPING_WHITESPACE = 1 << 20;

function isVarnameChar(code) {
    return (code >= 0x61 && code <= 0x7a) || // [a-z]
           (code >= 0x41 && code <= 0x5a) || // [A-Z]
           (code >= 0x30 && code <= 0x39) || // [0-9]
           code === 0x2e || code === 0x5f || code === 0x2d; // [._-]

}

function isVarnameCharNoDot(code) {
    return (code >= 0x61 && code <= 0x7a) || // [a-z]
           (code >= 0x41 && code <= 0x5a) || // [A-Z]
           (code >= 0x30 && code <= 0x39) || // [0-9]
           code === 0x5f || code === 0x2d; // [._-]

}

function varnameEndsInChunk(chunk, i, len) {
    // The varname starts at index `i`.
    // `len` is `chunk.length`.
    for (;;) {
        i += 1;
        if (i === len) { return -1; }
        if (!isVarnameChar(chunk.charCodeAt(i))) { return i; }
    }
}

NinjaParser.prototype.error = function (chunk, i) {
    console.trace(util.format('%d: %j', i, chunk));
    process.exit();
};

// Join all adjacent strings.
function normalizeEvalStringArray(arr) {
    var ret = [];
    for (var i = 0, n = arr.length; i !== n; ++i) {
        var val = arr[i];
        if (typeof val === 'object') {
            ret.push(val);
            continue;
        }
        if (val === '') {
            continue;
        }
        if (ret.length > 0 && typeof ret[ret.length - 1] === 'string') {
            ret[ret.length - 1] += val;
        } else {
            ret.push(val);
        }
    }
    return ret;
}

function splitEvalString(s) {
    var ret = [];
    var lastIdx = 0;
    for (var i = 0, n = s.length; i !== n; ) {
        if (s.charAt(i) !== '$') { i += 1; continue; }
        ret.push(s.slice(lastIdx, i));
        i += 1;
        if (i === n) {
            throw new Error('Unterminated \'$\'');
        }
        var next = s.charAt(i);
        if (next === '$' || next === ':' || next === ' ') {
            ret.push(next);
            i += 1;
            lastIdx = i;
            continue;
        }
        if (next === '{') {
            i += 1;
            var varNameStart = i;
            while (i !== n && isVarnameChar(s.charCodeAt(i))) {
                i += 1;
            }
            ret.push({ varName: s.slice(varNameStart, i) });
            if (i === n || s.charAt(i) !== '}') {
                // FIXME: Need proper error handling
                throw new Error('Expected \'}\'');
            }
            i += 1;
            lastIdx = i;
            continue;
        }
        if (isVarnameCharNoDot(s.charCodeAt(i))) {
            var varNameStart = i;
            while (i !== n && isVarnameCharNoDot(s.charCodeAt(i))) {
                i += 1;
            }
            ret.push({ varName: s.slice(varNameStart, i) });
            lastIdx = i;
        }
    }
    ret.push(s.slice(lastIdx, i));
    return normalizeEvalStringArray(ret);
}

NinjaParser.prototype._doParse = function (chunk) {
    var m;
    if ((m = /^\s*rule\s+([a-zA-Z0-9._-]+)\s*$/.exec(chunk))) {
        this.emit('ruleHead', m[1]);
    }
    // Variable binding, e.g. for `rule` or `build`.
    if ((m = /^\s+([a-zA-Z0-9._-]+)\s*=\s*/.exec(chunk))) {
        var varName = m[1];
        chunk = chunk.slice(m[0].length);
        this.emit('varEqVal', varName, splitEvalString(chunk));
    }
    return;
    // This is clearly work in progress code...

    var i = 0;
    var state = this._state;
    var len = chunk.length;
    for (;;) {
        if (i === len) { break; }
        if (state & FLAG_SKIPPING_WHITESPACE) { // Keep this first.
            for (;;) {
                var char = chunk.charAt(i);
                if (char === ' ') {
                    i += 1;
                    continue;
                }
                // TODO: Eat a newline escape '$\n'
                // This is tough with the current code in the case where
                // the '$' is the last character in the chunk.
                break;
            }
            state &= ~FLAG_SKIPPING_WHITESPACE;
        }
        if (state === TOP_LEVEL) {
            if (chunk.charAt(0) === 'r') {
                state = KW_RULE_STATE1;
                i += 1;
                continue;
            }
        }
        if (inKWState(state, KW_RULE_STATES)) {
            if (state === KW_RULE_STATE1) {
                if (chunk.charAt(i) !== 'u') { this.error(chunk, i); }
                i += 1;
                state = KW_RULE_STATE2;
            }
            if (state === KW_RULE_STATE2) {
                if (chunk.charAt(i) !== 'l') { this.error(chunk, i); }
                i += 1;
                state = KW_RULE_STATE3;
            }
            if (state === KW_RULE_STATE3) {
                if (chunk.charAt(i) !== 'e') { this.error(chunk, i); }
                i += 1;
                state = KW_RULE_STATE4;
            }
            if (state === KW_RULE_STATE4) {
                if (chunk.charAt(i) !== ' ') { this.error(chunk, i); }
                i += 1;
                state = KW_RULE_STATE_SKIP_SPACE;
            }
            if (state === KW_RULE_STATE_SKIP_SPACE) {
                for (;;) {
                    // FIXME: $\n escape.
                    if (chunk.charAt(i) !== ' ') { break; }
                    i += 1;
                    if (i === len) { break; }
                }
                state = RULE_NEED_INIT_VARNAME;
            }
            continue;
        }
        if (state === RULE_NEED_INIT_VARNAME) {
            if (!isVarnameChar(chunk.charCodeAt(i))) { this.error(chunk, i); }
            this._varnameSoFar = chunk.charAt(i);
            // FIXME: all these `+= 1`'s need to check for the end and
            // break if so.
            i += 1;
            state = RULE_FINISH_VARNAME;
        }
        if (state === RULE_FINISH_VARNAME) {
            var varnameEndIdx = varnameEndsInChunk(chunk, i, len);
            this._varnameSoFar += chunk.slice(i, varnameEndIdx);
            if (varnameEndIdx === -1) { // This chunk is over.
                break;
            }
            i = varnameEndIdx;
            this.emit('ruleHead', this._varnameSoFar);
            state = RULE_WANT_NEWLINE;
            state |= FLAG_SKIPPING_WHITESPACE;
            continue;
        }
        if (state === RULE_WANT_NEWLINE) {
            if (chunk.charAt(i) !== '\n') { this.error(chunk, i); }
            i += 1;
            state = RULE_WANT_KEY_EQ_VALUE_PAIRS;
        }
        if (state === RULE_WANT_KEY_EQ_VALUE_PAIRS) {
            debugger;
            break; // FIXME: temporary
        }
    }
    // Maybe save like the last line or so to help with diagnostics?
    this._state = state;
};

