# ninja-build-manifest-parser

This module parses the `.ninja` files that the [ninja build
system](https://github.com/martine/ninja) reads.

It's currently about 1/3 of the way from regex monstrosity to proper
parser.

The parser has not been optimized at all, but is (to my great surprise)
actually pretty speedy.
As a rough comparison, when building LLVM, ninja spends about 350ms (as
reported by the `.ninja parse` metric of `ninja -d stats`) parsing the 2
.ninja files, which total to about 4.5MB of text.
At the time of this writing, `examples/toJson.js` takes 450ms to read both
files (`cat`'d together) and write out a JSON representation of the .ninja
files.

## API

The basic idea of the API currently is that it decomposes the .ninja file
into its basic components without attempting to interpret them.
It does the bare minimum to get from a flat text file to something that can
be operated on programmatically.

The file `examples/identity.js` parses a .ninja file and then uses the
provided structural information to print out a .ninja file that behaves
identically; hence it handles all the possible .ninja file components and
exhibits how they are reflected in the API.

## Example

```js
// Print all `build` declarations with more than 1 output.
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
```

## Limitations

Generally, the parser is not very error tolerant or helpful for humans.
In particular:

* The pathetic "diagnostics" currently take the form of throwing an
  exception to bail.
* Lines that are not recognized are silently discarded. (This could be
  remedied quite easily; turning them into an error would be a one-line
  patch).

This limitation doesn't pose a huge problem since most interesting .ninja
files are generated programmatically and don't have errors.
Besides, one can always run the file through ninja itself in order to get
slightly more helpful diagnostics (e.g. caret diagnostics with line
numbers).

It would be neat to have a "sourcecode-stream" module that you can pipe
text through.
Basically all it needs to do is keeps track of source locations as chunks
go through and have functionality for giving nice diagostics based on that
information.


## License

MIT
