# ninja-build-manifest-parser

This package parses the `.ninja` files that the [ninja build
system](https://github.com/martine/ninja) reads.

## API

I'm basically envisioning the API as a single-function export. This
exported function creates a writable stream that you can then pipe the
source to, and listen to events on.

## License

MIT
