var test = require('tap').test;
var parser = require('../index.js');

function resultEquals(t, src, expected) {
    var accum = [];
    var p = parser();
    p.on('readable', function () {
        var o = this.read();
        if (o) {
            accum.push(o);
        }
    });
    p.on('end', function () {
        t.deepEqual(accum, expected);
    });
    p.end(src);
}

test('ruleHead', function (t) {
    t.plan(1);
    var src = 'rule $\n sampleRule\n';
    resultEquals(t, src, [
        { kind: 'ruleHead', name: 'sampleRule' }
    ]);
});

test('binding', function (t) {
    function check(src, expectedObj) {
        resultEquals(t, src, [ expectedObj ])
    }
    check('  varName = val\n', {
        kind: 'binding',
        indent: '  ',
        key: 'varName',
        value: ['val']
    });
    check('  vn = $foo ${bar}\n', {
        kind: 'binding',
        indent: '  ',
        key: 'vn',
        value: [{name: 'foo'}, ' ', {name: 'bar'}]
    });
    check('  vn = $foo ${bar}.d\n', {
        kind: 'binding',
        indent: '  ',
        key: 'vn',
        value: [{name: 'foo'}, ' ', {name: 'bar'}, '.d']
    });
    check('  vn = ${foo}$ $:$$\n', {
        kind: 'binding',
        indent: '  ',
        key: 'vn',
        value: [{name: 'foo'}, ' :$']
    });
    t.end();
});

test('finish parsing on end', function (t) {
    t.plan(1);
    var src = 'rule noTerminatingNewline';
    var p = parser();
    p.on('ruleHead', function (name) {
        t.pass('\'ruleHead\' event was emitted');
    });
    p.end(src);
});

test('basic rule parsing', function (t) {
    var src =
        'rule cxx\n' +
        '  command = $cxx $cxxflags -MMD -MT $out -MF $out.d -o $out -c $in\n' +
        '  description = CXX $in\n' +
        '  depfile = $out.d\n';

    var p = parser();
    var rule = null;
    p.on('ruleHead', function (name) {
        t.equal(rule, null, '\'ruleHead\' should be first event');
        rule = {
            name: name,
            bindings: []
        };
    });
    var count = 0;
    p.on('binding', function (indent, key, value) {
        rule.bindings.push({
            key: key,
            value: value
        });
        count += 1;
        t.equal(rule.bindings.length, count);
        t.equal(indent, '  ');
        if (count === 3) {
            t.end();
        }
    });
    // Ensure that buffering is happening correctly.
    src.split('').forEach(function (e) {
        p.write(e);
    });
    p.end();
});

test('top-level binding', function (t) {
    t.plan(3);
    var src = 'cxx = clang++';

    var p = parser();
    p.on('binding', function (indent, key, value) {
        t.equal(indent, '');
        t.equal(key, 'cxx');
        t.deepEqual(value, ['clang++']);
    });
    p.end(src);
});

test('\'buildHead\' event', function (t) {
    t.plan(5);
    var src = 'build foo: bar baz';
    var p = parser();
    p.on('buildHead', function (o) {
        t.deepEqual(o.outputs, [['foo']]);
        t.equal(o.ruleName, 'bar');
        t.deepEqual(o.inputs.explicit, [['baz']]);
        t.deepEqual(o.inputs.implicit, []);
        t.deepEqual(o.inputs.orderOnly, []);
    });
    p.end(src);
});

test('Real \'buildHead\' event', function (t) {
    t.plan(5);
    var src = 'build build.ninja: configure | configure.py misc/ninja_syntax.py';
    var p = parser();
    p.on('buildHead', function (o) {
        t.deepEqual(o.outputs, [['build.ninja']]);
        t.equal(o.ruleName, 'configure');
        t.deepEqual(o.inputs.explicit, []);
        t.deepEqual(o.inputs.implicit, [['configure.py'], ['misc/ninja_syntax.py']]);
        t.deepEqual(o.inputs.orderOnly, []);
    });
    p.end(src);
});

test('\'default\' event', function (t) {
    t.plan(1);
    var src = 'default $foo$ bar baz$\n  \n' +
              '# A comment\n' + // Get some testing that comments are ignored.
              '  # An indented comment\n';
    var p = parser();
    p.on('default', function (defaults) {
        t.deepEqual(defaults, [
            [{name: 'foo'}, ' bar'],
            ['baz']
        ]);
    });
    p.end(src);
});

test('\'fileReference\' event', function (t) {
    t.plan(4);
    var src = 'include includeMe.ninja\n' +
              'subninja subninjaMe.ninja';
    var p = parser();
    p.once('fileReference', function (kind, path) {
        t.equal(kind, 'include');
        t.deepEqual(path, ['includeMe.ninja']);
        p.once('fileReference', function (kind, path) {
            t.equal(kind, 'subninja');
            t.deepEqual(path, ['subninjaMe.ninja'])
        });
    });
    p.end(src);
});

test('\'poolHead\' event', function (t) {
    t.plan(1);
    var src = 'pool test_pool';
    var p = parser();
    p.on('poolHead', function (name) {
        t.equal(name, 'test_pool');
    });
    p.end(src);
});

test('$\\n escapes skip leading whitespace on next line', function (t) {
    t.plan(4 * 3);
    var src = 'key = stuck$$$\n    together';
    function feed(fn) {
        var p = parser();
        p.on('binding', function (indent, key, value) {
            t.equal(indent, '');
            t.equal(key, 'key');
            t.deepEqual(value, ['stuck$together']);
        });
        fn(p);
    }
    feed(function (p) {
        var a = ['key = stuck$','$$\n    together'];
        a.forEach(function (e) { p.write(e); });
        p.end();
    });
    feed(function (p) {
        var a = ['key = stuck$','$$\n    together'];
        a.forEach(function (e) { p.write(e); });
        p.end();
    });
    feed(function (p) {
        src.split('').forEach(function (e) {
            p.write(e);
        });
        p.end();
    });
    feed(function (p) {
        p.end(src);
    });
});
