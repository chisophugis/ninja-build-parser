var Writable = require('stream').Writable;
var util = require('util');

module.exports = function () {
    return new NinjaParser();
};

function NinjaParser() {
    Writable.call(this, {decodeStrings: false});
    // Buffers up until chunks until a full line is found (well, permitting
    // $\n escapes).
    this._waitingForNewline = '';
    // After we see a $\n escape, we need to make note that we are skipping
    // spaces. This has to persist across calls to _write.
    this._skippingSpaces = false;

    this.on('finish', function () {
        this._doParse(this._waitingForNewline);
    });
}

NinjaParser.prototype = Object.create(Writable.prototype, {
  constructor: { value: NinjaParser }
});

NinjaParser.prototype._write = function (chunk, encoding, done) {
    // TODO: keep track of current line
    if (chunk.length === 0) { done(); return; }
    if (Buffer.isBuffer(chunk)) { chunk = chunk.toString(encoding); }
    if (this._skippingSpaces) {
        var idx = chunk.search(/[^ ]/);
        if (idx === -1) { // This chunk is entirely whitespace, skip it.
            done();
            return;
        }
        this._skippingSpaces = false;
        chunk = chunk.slice(idx);
    }
    chunk = this._waitingForNewline + chunk;
    var self = this;
    function replacer(match, p1, offset, string) {
        if (match.length + offset === string.length) {
            self._skippingSpaces = true;
        }
        return p1;
    }
    chunk = chunk.replace(/((?:^|[^$])(?:\$\$)*)\$\n */g, replacer);
    for (;;) {
        var idx = chunk.indexOf('\n');
        if (idx === -1) { break; }
        this._doParse(chunk.slice(0, idx));
        chunk = chunk.slice(idx + 1);
    }
    this._waitingForNewline = chunk;
    done();
};

function isVarnameCharNoDot(code) {
    return (code >= 0x61 && code <= 0x7a) || // [a-z]
           (code >= 0x41 && code <= 0x5a) || // [A-Z]
           (code >= 0x30 && code <= 0x39) || // [0-9]
           code === 0x5f || code === 0x2d; // [_-]
}

function isVarnameChar(code) {
    return isVarnameCharNoDot(code) || code === 0x2e;
}

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

// This function splits a so-called "EvalString" (that's what ninja's
// source calls it internally). Basically an EvalString is a region of the
// .ninja file that possibly has variable substitutions. This function
// takes a string, and converts it into an array containing alternating
// entries of the form:
// * `'string'` represents literal text to be interpreted as-is.
// * `{name: 'varName'}` represents a variable substitution, where 'varName'
//   is the variable name whose value should be substituted.
// E.g. the string 'foo$bar' would become: ['foo', {name: 'bar'}]
// This function also deals with a couple escapes that ninja permits.
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
            ret.push({ name: s.slice(varNameStart, i) });
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
            ret.push({ name: s.slice(varNameStart, i) });
            lastIdx = i;
            continue;
        }
        throw new Error('Unexpected $ escape \'$' + next + '\'');
    }
    ret.push(s.slice(lastIdx, i));
    return normalizeEvalStringArray(ret);
}

function skipSpaces(s) {
    var idx = s.search(/[^ ]/);
    if (idx === -1) { return ''; }
    return s.slice(idx);
}

NinjaParser.prototype._doParse = function (chunk) {
    var m;
    if ((m = /^rule\s+([a-zA-Z0-9._-]+)\s*$/.exec(chunk))) {
        this.emit('ruleHead', m[1]);
    }
    if ((m = /^pool\s+([a-zA-Z0-9._-]+)\s*$/.exec(chunk))) {
        this.emit('poolHead', m[1]);
    }
    // Variable binding, e.g. for `rule` or `build`.
    if ((m = /^(\s*)([a-zA-Z0-9._-]+)\s*=\s*/.exec(chunk))) {
        var indent = m[1];
        var key = m[2];
        chunk = chunk.slice(m[0].length);
        this.emit('binding', indent, key, splitEvalString(chunk));
    }
    if ((m = /^build\s+/.exec(chunk))) {
        chunk = chunk.slice(m[0].length);
        var idx;
        var outputs = [];
        while ((idx = chunk.search(/[^$][: ]/)) !== -1) {
            // match officially starts on the [^$].
            var wasColon = chunk.charAt(idx + 1) === ':';
            outputs.push(splitEvalString(chunk.slice(0, idx + 1)));
            chunk = skipSpaces(chunk.slice(idx + 2)); // Advance past match.
            if (wasColon) {
                break; // done parsing the out-edges.
            }
        }
        m = /^[a-zA-Z0-9._-]+/.exec(chunk);
        if (!m) {
            throw new Error(util.format('expecting rule name for ' +
                                        'build statement %j', outputs));
        }
        var ruleName = m[0];
        chunk = skipSpaces(chunk.slice(m[0].length));
        var deps = [[], [], []];
        // 0 = just after ':', expecting ' ', '|', '||', or EOL
        // 1 = after '|', expecting ' ', '||', or EOL
        // 2 = after '||', expecting ' ', or EOL.
        // Index into `deps`.
        var state = 0;
        for (;;) {
            var opMatch = chunk.match(/^\|\|?/);
            if (opMatch !== null) {
                var op = opMatch[0].trim();
                if (state >= op.length) {
                    throw new Error('Only need to specify | or || once.');
                }
                state = op.length;
                chunk = skipSpaces(chunk.slice(op.length));
            }
            idx = chunk.search(/[^$](?:[: |]|$)/);
            if (idx === -1) {
                break;
            }
            deps[state].push(splitEvalString(chunk.slice(0, idx + 1)));
            chunk = skipSpaces(chunk.slice(idx + 1));
        }
        this.emit('buildHead', {
            outputs: outputs,
            ruleName: ruleName,
            inputs: {
                explicit: deps[0],
                implicit: deps[1],
                orderOnly: deps[2]
            }
        });
    }
    if ((m = /^default\s+/.exec(chunk))) {
        chunk = chunk.slice(m[0].length);
        var idx;
        var defaults = [];
        while ((idx = chunk.search(/[^$](?: |$)/)) !== -1) {
            defaults.push(splitEvalString(chunk.slice(0, idx + 1)));
            chunk = skipSpaces(chunk.slice(idx + 1));
        }
        this.emit('default', defaults);
    }
    if ((m = /^(include|subninja)\s+/.exec(chunk))) {
        // Since the handling of 'include' and 'subninja' will be basically
        // the same for a client, it doesn't make sense to have separate
        // events for each of them. Instead, we bunch them both into a
        // 'fileReference' event.
        this.emit('fileReference', m[1], splitEvalString(chunk.slice(m[0].length)));
    }
};

