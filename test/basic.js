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
    if (typeof src === 'string') {
        p.end(src);
    } else {
        src.forEach(function (s) { p.write(s); });
        p.end();
    }
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
    resultEquals(t, src, [
        { kind: 'ruleHead', name: 'noTerminatingNewline' }
    ]);
});

test('basic rule parsing', function (t) {
    var src =
        'rule cxx\n' +
        '  command = $cxx $cxxflags -MMD -MT $out -MF $out.d -o $out -c $in\n';
    t.plan(1);
    resultEquals(t, src, [
        { kind: 'ruleHead', name: 'cxx' },
        {
            kind: 'binding',
            indent: '  ',
            key: 'command',
            value: [
                {name: 'cxx'},
                ' ',
                {name: 'cxxflags'},
                ' -MMD -MT ',
                {name: 'out'},
                ' -MF ',
                {name: 'out'},
                '.d -o ',
                {name: 'out'},
                ' -c ',
                {name: 'in'}
            ]
        }
    ]);
});

test('top-level binding', function (t) {
    t.plan(1);
    var src = 'cxx = clang++';

    resultEquals(t, src, [
        {
            kind: 'binding',
            indent: '',
            key: 'cxx',
            value: ['clang++']
        }
    ]);
});

test('buildHead', function (t) {
    t.plan(1);
    var src = 'build foo: bar baz | $qux $quux || $frob.inc';
    resultEquals(t, src, [
        {
            kind: 'buildHead',
            outputs: [ ['foo'] ],
            ruleName: 'bar',
            inputs: {
                explicit: [ ['baz'] ],
                implicit: [ [{name: 'qux'}], [{name: 'quux'}] ],
                orderOnly: [ [{name: 'frob'}, '.inc'] ]
            }
        }
    ]);
});

test('default', function (t) {
    t.plan(1);
    var src = 'default $foo$ bar baz$\n  \n' +
              '# A comment\n' + // Get some testing that comments are ignored.
              '  # An indented comment\n';
    resultEquals(t, src, [
        {
            kind: 'default',
            defaults: [
                [{name: 'foo'}, ' bar'],
                ['baz'] // The $\n escape skips any leading whitespace too.
            ]
        }
    ]);
});

test('include and subninja', function (t) {
    t.plan(1);
    var src = 'include includeMe.ninja\n' +
              'subninja subninjaMe.ninja';
    resultEquals(t, src, [
        {
            kind: 'include',
            path: ['includeMe.ninja']
        },
        {
            kind: 'subninja',
            path: ['subninjaMe.ninja']
        }
    ]);
});

test('poolHead', function (t) {
    t.plan(1);
    var src = 'pool test_pool';
    resultEquals(t, src, [
        { kind: 'poolHead', name: 'test_pool' }
    ]);
});

test('$\\n escapes skip leading whitespace on next line', function (t) {
    t.plan(3);
    var src = 'key = stuck$$$\n    together';
    function feed(arr) {
        resultEquals(t, arr, [
            {
                kind: 'binding',
                indent: '',
                key: 'key',
                value: ['stuck$together']
            }
        ]);
    }
    feed(['key = stuck$','$$\n    together']);
    feed(src.split(''));
    feed(src);
});
