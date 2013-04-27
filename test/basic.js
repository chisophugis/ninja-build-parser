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


test('varEqVal event', function (t) {
    function check(src, varName, val) {
        var p = parser();
        p.on('varEqVal', function (varName_, val_) {
            t.equal(varName_, varName);
            t.deepEqual(val_, val);
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
    p.on('varEqVal', function (varName, val) {
        rule.bindings.push({
            key: varName,
            value: val
        });
        count += 1;
        t.equal(rule.bindings.length, count);
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
