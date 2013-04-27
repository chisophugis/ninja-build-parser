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
