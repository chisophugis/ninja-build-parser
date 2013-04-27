# ninja-build-manifest-parser

This package parses the `.ninja` files that the [ninja build
system](https://github.com/martine/ninja) reads.

It is a pure streaming parser (i.e., you can feed it data incrementally; it
never buffers anything that it doesn't have to). It turns out that these
are quite challenging to write.

The code is shockingly gross at the moment as I try to pick up the groove
of what the right abstractions are for a streaming parser. In a lot of
places there is repetitive code that I have not yet abstracted out.


## API

I'm basically envisioning the API as a single-function export. This
exported function creates a writable stream that you can then pipe the
source to, and listen to events on.


## License

MIT
