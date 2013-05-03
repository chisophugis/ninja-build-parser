// This file implements a rough "identity" transform, which takes a .ninja
// file and spits out a .ninja file that should behave identically.

var parser = require('../index.js');

var out = process.stdout;

var p = parser();
process.stdin.pipe(p);
var handlers = {}; // Filled in with functions below.
p.on('readable', function () {
    var obj = this.read();
    if (obj === null) { return; }
    handlers[obj.kind](obj);
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

function printBindings(o) {
    Object.keys(o.bindings).forEach(function (k) {
        out.write('  ' + k + ' = ');
        out.write(fmtEvalString(o.bindings[k], /[$]/g));
        out.write('\n');
    });
}

handlers['rule'] = function (o) {
    out.write('rule ' + o.name + '\n');
    printBindings(o);
};
handlers['pool'] = function (o) {
    out.write('pool ' + o.name + '\n');
    printBindings(o);
};

handlers['binding'] = function (o) {
    out.write(o.key + ' = ' + fmtEvalString(o.value));
}
handlers['build'] = function (o) {
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
    printBindings(o);
}

handlers['default'] = function (o) {
    out.write('default ');
    out.write(o.defaults.map(fmtEvalString).join(' '));
    out.write('\n');
};
handlers['include'] = handlers['subninja'] = function (o) {
    out.write(o.kind + ' ' + fmtEvalString(o.path) + '\n');
}
