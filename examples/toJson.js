// This file dumps the stream of objects which is produced by the parser
// API into a JSON array representation.
// The output is a single JSON array (outputted with JSONStream) with a
// series of objects whose "kind" property indicates what they represent.

var parser = require('../index.js');
var JSONStream = require('JSONStream');

// Streams are awesome.
process.stdin
    .pipe(parser())
    .pipe(JSONStream.stringify())
    .pipe(process.stdout)
;
