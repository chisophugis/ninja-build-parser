// This file converts the evented interface that structure parser exports
// into a JSON representation of the .ninja file.
// The result is more structured than the raw events in that bindings are
// properly glued to the thing that they follow (top-level bindings of
// course are not attached to anything).
// The output is a single JSON array (outputted with JSONStream) with a
// series of objects whose "kind" property indicates what they represent.
// This also might serve as a prototype for a better overall API for the
// module. The evented API "splinters" the incoming stream; the API should
// produce a stream for so that it is more consumable.

var parser = require('../index.js');
var JSONStream = require('JSONStream');

var p = parser();
var out = JSONStream.stringify();
process.nextTick(function () {
    process.stdin.pipe(p);
    //                  ^
    // ,----------------'
    // | This is begging to be streamified.
    // | FIXME: Need to move towards a stream API.
    // V
    out.pipe(process.stdout);
});

// A property to hold the state for the stringification.
// If we just saw something that could have bindings, then we stash it
// here. We reset to null (after emitting to the stream) if we see
// something that implies the end of the bindings (e.g. EOS, a top-level
// binding, an include, etc.).
p.currentNode = null;
p.on('finish', function () {
    if (this.currentNode) {
        out.write(this.currentNode);
    }
});

p.on('ruleHead', function (name) {
    if (this.currentNode) {
        out.write(this.currentNode);
    }
    this.currentNode = {
        kind: 'rule',
        bindings: {}
    }
});
p.on('poolHead', function (name) {
    if (this.currentNode) {
        out.write(this.currentNode);
    }
    this.currentNode = {
        kind: 'pool',
        bindings: {}
    }
});

p.on('binding', function (indent, key, value) {
    if (indent) { // Not top-level.
        if (this.currentNode) {
            this.currentNode.bindings[key] = value;
        } else {
            throw new Error('Unexpected indented binding');
        }
    } else { // Top level.
        if (this.currentNode) {
            out.write(this.currentNode);
            this.currentNode = null;
        }
        out.write({
            kind: 'topLevelBinding',
            key: key,
            value: value
        });
    }
});

p.on('buildHead', function (o) {
    // FIXME: this check happens in a lot of places. Factor it out!
    if (this.currentNode) {
        out.write(this.currentNode);
    }
    this.currentNode = {
        kind: 'build',
        outputs: o.outputs,
        ruleName: o.ruleName,
        inputs: o.inputs,
        bindings: {} // FIXME: error-prone having to add this everywhere.
    };
});
p.on('default', function (defaults) {
    if (this.currentNode) {
        out.write(this.currentNode);
        this.currentNode = null;
    }
    out.write({
        kind: 'default',
        defaults: defaults
    });
});
p.on('fileReference', function (kind, path) {
    if (this.currentNode) {
        out.write(this.currentNode);
        this.currentNode = null;
    }
    out.write({
        kind: kind,
        path: path
    });
});
