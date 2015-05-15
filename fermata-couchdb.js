/* CouchDB (and friends) plugin for Fermata, with support for change events and default base URL.

Example use:
    <script src="fermata.js"></script>
    <script src="plugins/couchdb.js"></script>
    <script>
        var db = fermata.couchdb()('dev');      // db() === "http://localhost:5984/dev"
        fermata.plugins.couchdb.watchChanges(db, 50000, function (r) {
            console.log("Got change results:", r);
        });
    </script>
*/

var fermata;
(function () {
    
    function autoBase(url) {
      // TODO: better URL guessing (especially if window.location is available)
      return url || "http://localhost:5984";
    }
    
    var plugin = function (transport, url) {
        this.base = autoBase(url);
        return transport.using('statusCheck').using('autoConvert', "application/json");
    };
    
    // HACK: starting XHR after page loads and outside of event handlers helps avoid "progress" indicators
    var avoidSpinners = (typeof document === 'object') ? (
        (document.readyState !== 'complete') ? _callDelayedAfterLoad : _callDelayed
    ) : _call;
    function _call(fn) { fn(); }
    function _callDelayed(fn) { setTimeout(fn, 0); }
    function _callAfterLoad(fn) {
        addEventListener('load', function _listener() {
            try {
                fn();
            } finally {
                removeEventListener('load', _listener, false);
            }
        }, false);
    }
    function _callDelayedAfterLoad(fn) {
        _callAfterLoad(function () {
            _callDelayed(fn);
        });
    }
    if (avoidSpinners === _callDelayedAfterLoad) _callAfterLoad(function () {
        // use our own helper to remove load-awaiting stuff once load happens
        avoidSpinners = _callDelayed;
    });
    
    plugin.warn = function () {
        if (console && console.warn) console.warn.apply(console, arguments);
    };
    
    plugin.watchChanges = function (db, lastSeq, callback, interval) {
        var currentSeq = lastSeq,
            DEFAULT_DELAY = (typeof interval === 'number') ? interval : 100,
            backoff = DEFAULT_DELAY,
            feedType = (interval) ? 'normal' : 'longpoll',
            activeRequest = null,
            cancelled = false;
        if (interval === 'continuous') {
            feedType = interval;
            interval = 0;
        }
        
        function safeCallback() {
            try {
                return callback.apply(this, arguments);
            } catch (e) {
                plugin.warn("CouchDB _changes callback handler threw exception", e);
            }
        }
        function poll() {
            /* Deal with effects of IE caching — will poll rapidly once IE decides to screw up
               as described in e.g. http://www.dashbay.com/2011/05/internet-explorer-caches-ajax/ */
            // NOTE: see also https://issues.apache.org/jira/browse/COUCHDB-257 (shouldn't have been closed?!)
            db = db({nocache:Math.random()});
            var responseType = (feedType === 'continuous') ? 'stream' : null,
                // NOTE: CouchDB doesn't really handle this Content-Type, but it does avoid https://issues.apache.org/jira/browse/COUCHDB-2562 in our case
                headers = (feedType === 'continuous') ? {'Accept': "application/x-ldjson"} : null,
                query = (currentSeq === 'now') ? {feed:feedType, since:'now'} : {feed:feedType, $since:currentSeq};
            activeRequest = db('_changes', query).get(responseType, headers, null, function (e,d) {
                activeRequest = (responseType === 'stream') ? activeRequest : null;
                if (cancelled) return;
                else if (e) {
                    var _d = (responseType === 'stream') ? '<stream>' : d;
                    plugin.warn("Couldn't fetch CouchDB _changes feed, trying again in "+backoff+" milliseconds.", e, _d);
                    safeCallback([], e);
                    setTimeout(poll, backoff);
                    if (!interval) backoff *= 2;
                } else {
                    backoff = DEFAULT_DELAY;
                    if (responseType === 'stream') {
                        var prev = "";
                        d.setEncoding('utf8');
                        d.on('data', function (chunk) {
                            var lines = chunk.toString().split('\n'),
                                last = lines.length - 1;
                            lines[0] = prev + lines[0];
                            for (var i = 0; i < last; i++) try {
                                if (!lines[i]) continue;
                                var result = JSON.parse(lines[i]);
                                safeCallback([result]);
                                currentSeq = result.seq;
                            } catch (e) {
                                plugin.warn("CouchDB _changes watcher failed to parse part of response", e);
                            }
                            prev = lines[last];
                        });
                        d.on('end', function () {
                            activeRequest = null;
                            setTimeout(poll, backoff);
                        });
                    } else {
                        if (d.results.length) safeCallback(d.results);
                        currentSeq = d.last_seq;
                        setTimeout(poll, backoff);
                    }
                }
            });
        }
        function cancel() {
            cancelled = true;
            if (activeRequest) activeRequest.abort();
        };
        
        var utils = cancel;       // TODO: this is for backwards compat, should simply be an object
        utils.cancel = utils.pause = cancel;
        utils.restart = function () {
            cancelled = false;
            poll();
        };
        utils.getStatus = function () {
            return {update_seq:currentSeq};
        };
        
        avoidSpinners(poll);
        
        return utils;
    };
    
    // WORKAROUND: custom statusCheck to treat 202 responses as an error
    // if Cloudant sends this, we can't be sure the write won't conflict
    // see https://github.com/cloudant/bigcouch/issues/55#issuecomment-30186518
    // and https://cloudant.com/for-developers/faq/data/
    // and http://bigcouch.cloudant.com/api
    // it's futile to attempt a unanimous quorum read to be sure (r=N is only advisory!!)
    // so…assume the worst (e.g. conflicting or lost update) and treat these like a 500
    plugin.bigcouch = function (transport, url) {
        this.base = autoBase(url);
        transport = transport.using('statusCheck').using('autoConvert', "application/json");
        return function (req, cb) {
            return transport(req, function (e, d, m) {
                var status = m && m['X-Status-Code'];
                if (!e && status === 202) {
                    e = Error("Troublesome status code from server: " + status);
                    e.status = status;
                }
                cb(e, d, m);
            });
        };
    };
    
    // some boilerplate to deal with browser vs. CommonJS
    if (fermata) {
        fermata.registerPlugin("couchdb", plugin);
        fermata.registerPlugin("bigcouch", plugin.bigcouch);
    } else {
        module.exports = plugin;
    }
})();