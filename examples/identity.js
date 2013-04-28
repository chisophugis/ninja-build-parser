// This file implements a rough "identity" transform, which takes a .ninja
// file and spits out a .ninja file that should behave identically.

var parser = require('../index.js');
var fs = require('fs');

var inStream = fs.createReadStream(process.argv[2] || '/dev/stdin');
var out = fs.createWriteStream(process.argv[3] || '/dev/stdout');

var p = parser();
process.nextTick(function () {
    inStream.pipe(p);
});

p.on('ruleHead', function (name) {
    out.write('rule ' + name + '\n');
});
p.on('poolHead', function (name) {
    out.write('pool ' + name + '\n');
});

function fmtEvalString(es, altEscapes) {
    function escape(s) {
        return s.replace(altEscapes || /[ :$]/g, function (match) {
            return '$' + match;
        });
    }
    return es.map(function (e) {
        if (typeof e === 'string') { return escape(e); }
        if (typeof e === 'object') { return '${' + e.name + '}'; }
        // Those are the only two possibilities.
        throw new Error('Unknown entry in evalstring!');
    }).join('');
}
p.on('binding', function (indent, key, value) {
    out.write(indent + key + ' = ');
    // Spaces and colons don't need to be escaped in bindings, and it looks
    // prettier if we don't escape them.
    out.write(fmtEvalString(value, /[$]/g));
    out.write('\n');
});
p.on('buildHead', function (o) {
    out.write('build ');
    out.write(o.outputs.map(fmtEvalString).join(' '));
    out.write(': ' + o.ruleName);
    function maybeWrite(a, sep) {
        a.length && out.write(sep + a.map(fmtEvalString).join(' '));
    }
    maybeWrite(o.inputs.explicit, ' ');
    maybeWrite(o.inputs.implicit, ' | ');
    maybeWrite(o.inputs.orderOnly, ' || ')
    out.write('\n');
});
p.on('default', function (defaults) {
    out.write('default ');
    out.write(defaults.map(fmtEvalString).join(' '));
    out.write('\n');
});
p.on('fileReference', function (kind, path) {
    out.write(kind + ' ' + fmtEvalString(path) + '\n');
});
