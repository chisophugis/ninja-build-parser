var test = require('tape');
var parser = require('../index.js');

test('ruleHead event', function (t) {
    var src = 'rule sampleRule\n';
    var p = parser();
    p.on('ruleHead', function (name) {
        t.equal(name, 'sampleRule',
                '\'ruleHead\' event should have rule name.');
        t.end();
    });
    p.write(src);
});
