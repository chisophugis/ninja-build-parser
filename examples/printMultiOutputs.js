// Print out info about `build` declarations that have more than one output.
// Reads input on stdin.
// It prints out the rule name and the list of outputs.
// E.g. print out info on this one:
//     build test.pdf test.aux test.log: latex test.tex
// but not this one:
//     build test.tex: weave $noweb_file

var parser = require('../index.js');
var p = parser();
process.stdin.pipe(p);

p.on('readable', function () {
    var o = this.read();
    if (o.kind !== 'build') {
        return;
    }
    if (o.outputs.length > 1) {
        console.log(o.ruleName);
        console.log(o.outputs);
    }
});
