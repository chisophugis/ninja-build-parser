# ninja-build-parser

This module parses the `.ninja` files that the [ninja build
system](https://github.com/martine/ninja) reads.
It does the bare minimum to get from flat text to something that can be
operated on programmatically.

On a scale of 0-9, where 0 is a regex monstrosity and 9 is a proper parser,
I would rate it about a 3 or 4. It's simple though; that counts for
something.

## Example

```js
// Print info about `build` declarations with >1 output in the given file.
// Reads the .ninja file from stdin.
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

## API

The basic idea of the API is that it decomposes the .ninja file
into its basic components without attempting to interpret them (for
example, it does not handle `include` or `subninja`).

This is exposed as a through/Transform stream: pipe .ninja source into one
side, and objects representing the file will come out the other side.

`example/identity.js` uses the API to read a .ninja file and print out
another .ninja file that behaves identically.
Hence it is a good learning resource because it handles all the possible
.ninja file components and exhibits how they are reflected in the API.

`example/toJson.js` is useful if you just want to dump the stream of
objects into a JSON array to look at it (with your favorite JSON
pretty-printer/inspector).

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
more helpful diagnostics (e.g. caret diagnostics with line numbers).

## Performance

The parser has not been optimized at all, but is (to my great surprise)
actually pretty speedy.
As a rough comparison, when building LLVM, ninja spends about 350ms (as
reported by the `.ninja parse` metric of `ninja -d stats`) parsing the 2
.ninja files, which total to about 4.5MB of text.
At the time of this writing, `example/toJson.js` takes 450ms to read both
files (`cat`'d together) and write out a JSON representation (also about
4.5MB) of the .ninja files.

Note that this comparison doesn't tell the whole story because that time
that ninja reports also includes building up the initial dependency graph
structure and evaluating variable substitutions.
However, this is mostly wasted work anyway since it doesn't need to be on
the critical path, which finding the first file that needs to be rebuilt.
Another example of such inefficiency is that ninja reads the entire .ninja
file off disk before it starts parsing it, and it parses the whole file
before it starts stat'ing files to determine whether they are out of date.
Node and streams are amazing in that they avoid such time wasting by
incrementally/asynchronously processing everything.

## License

MIT
