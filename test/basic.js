var test = require('tap').test;
var parser = require('../index.js');

test('ruleHead event', function (t) {
    var src = 'rule $\n sampleRule\n';
    var p = parser();
    p.on('ruleHead', function (name) {
        t.equal(name, 'sampleRule',
                '\'ruleHead\' event should have rule name.');
        t.end();
    });
    p.end(src);
});


test('\'binding\' event', function (t) {
    function check(src, expectedKey, expectedValue) {
        var p = parser();
        p.on('binding', function (indent, key, value) {
            t.equal(indent, '  ');
            t.equal(key, expectedKey);
            t.deepEqual(value, expectedValue);
        });
        p.end(src);
    }
    check('  varName = val\n', 'varName', ['val']);
    check('  vn = $foo ${bar}\n', 'vn',
          [{varName: 'foo'}, ' ', {varName: 'bar'}]);
    check('  vn = $foo ${bar}.d\n', 'vn',
          [{varName: 'foo'}, ' ', {varName: 'bar'}, '.d']);
    check('  vn = ${foo}$ $:$$\n', 'vn',
          [{varName: 'foo'}, ' :$']);
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
        t.deepEqual(o.inputs, [['baz']]);
        t.deepEqual(o.implicit, []);
        t.deepEqual(o.orderOnly, []);
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
        t.deepEqual(o.inputs, []);
        t.deepEqual(o.implicit, [['configure.py'], ['misc/ninja_syntax.py']]);
        t.deepEqual(o.orderOnly, []);
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
            [{varName: 'foo'}, ' bar'],
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
