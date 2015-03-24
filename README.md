# fermata-couchdb

**NOTE**: the currently-published fermata@0.10.6 already bundles this plugin, this is split out for an upcoming version!


This is a CouchDB plugin for [Fermata](https://github.com/natevw/fermata). It primarily offers a `watchChanges` helper for monitoring a _changes feed, as well as a few other convenience helpers where it makes sense.


## Setup

For classic in-browser usage, copy the main script file for both Fermata and this plugin alongside your static files. Then:

    <script src="/your/static/files/fermata.js"></script>
    <script src="/your/static/files/fermata-couchdb.js"></script>
    <script>
    var db = fermata.couchdb()('my-database');    // will try to auto-detect server
    
    // … see example usage below …
    </script>

Under node.js/browserify you will again need to `npm install fermata fermata-couchdb`. Then in your code, you will need to register this plugin manually:


    var fermata = require('fermata'),
        couchdb = require('fermata-couchdb);
    fermata.registerPlugin('couchdb', couchdb);   // you could pick a different name if you'd like
    
    var db = fermata.couchdb()('my-database');
    // …

## Example usage

**TBD**: improve, and actually test, this…

    var autoDatabase = fermata.couchdb()('my-database'),    // will try to auto-detect server
        corsDatabase = fermata.couchdb("https://other-server.example.com")('your-database');
    
    // implement a lousy sort of "replicator", copying changed docs from the other server into our own…
    fermata.plugins.couchb.watchChanges(corsDatabase({since:'now', include_docs:true}), function (arr) {
        arr.forEach(function (change) {
          autoDatabase.put(change.doc, function (e,d) {
              if (e) console.error(e, d);
              else console.log("New rev is:", d.rev);
          });
        });
    });

    
## Plugin API

The following documentation assumes this plugin has been registered with the name `'couchdb'` (as by default the browser, or if you follow the node.js example above).

- `fermata.couchdb([serverUrl])` — Returns a "URL proxy" object for the server's base URL. This gives you access to CouchDB's complete API via [Fermata's usual API](https://github.com/natevw/fermata#complete-documentation), following [its philosophy](https://github.com/natevw/fermata#why) of direct REST access. Pass a string with the `serverUrl` or omit to autodect. (**TBD**: The "autodection" currently just uses `"http://localhost:5984"` if no `serverUrl` is provided, but this could get a bit smarter in the future.)
- `fermata.plugins.couchdb.watchChanges(databaseUrl, lastSeq, callback[, interval])` — Starts monitoring changes, returning a watcher object whose API is documented below. `databaseUrl` must be a Fermata URL object, using pre-set query parameters to customize many of the monitoring options, e.g. `db({include_docs:true, timeout:5e3})`. Changes will be monitored starting from `lastSeq`, which may be `'now'` if you aren't trying to catch up a set of existing data [**TBD**: why isn't this included in databaseUrl?]. Your `callback` will be provided with an /array/ of changes (to support bulk handling) as its first and only argument. (Currently all error handling is done internally, which may not be ideal….) Finally, the `interval` parameter controls how changes are monitored. If omitted, it will long-poll using any `timeout` query parameter of `databaseURL`. If set to a number, the watcher will issue simple polls with `interval` milliseconds between the previous response and the next request. Under node.js you can also pass `'continuous'` to keep a persistent/streaming connection open.


## Alternate Cloudant / BigCouch (/ CouchDB 2.0?) extended plugin

Cloudant's "BigCouch" version of CouchDB [does not actually enforce read quorums](https://github.com/cloudant/bigcouch/issues/55#issuecomment-30186518)! This means that if a quorum *write* request yields a 202 response, there is no way to ever know whether the write ended up conflicting or not. So my recommendation is to treat such writes as failed from the upstream code's perspective.

To facilitate this, this plugin offers a variant which, in the browser, is registered under the "bigcouch" name. To register under node.js you can follow this example, changing the variable names and/or registered name if you'd like:

    var fermata = require('fermata'),
        plugin = require('fermata-couchdb');
    fermata.registerPlugin('bigcouch', plugin.bigcouch);
    
    var db = fermata.bigcouch()('my-database');
    // …

This alternate plugin is used exactly as the main plugin. The only difference is that a response with a 202 status code will cause an error callback rather than a successful callback.


## Changes watcher API

- `watcher.cancel()` — Stops (or pauses) monitoring changes. Any pending request will be aborted and no more callbacks will be sent; however, if you keep a reference to the watcher, its current status is preserved.
- `watcher.restart()` — Resumes monitoring of changes. Use this to "unpause" a cancelled watcher.
- `watcher.getStatus()` — Returns an object with information about the monitoring status. Currently the only proprerty provided is `update_seq`, which is the last processed sequence.

**TBD**: a way to be aware of (/customize?) errors


## License (MIT)

Copyright © 2011–2015 Nathan Vander Wilt.

Released under the terms of the MIT License:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
