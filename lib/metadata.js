/* -*- mode: Javascript -*-

This file is part of minipaas.
Copyright 2014 Kuno Woudt <kuno@frob.nl>

This program is licensed under copyleft-next version 0.3.0,
see LICENSE.txt for more information.

*/

require('colors');

var _ = require('underscore');
var _str = require('underscore.string');
var disk = require('./disk');
var fs = require('fs');
var jsonld = require('jsonld').promises();
var nodefn = require('when/node');
var N3 = require('n3');
var path = require('path');
var when = require('when');

_.mixin(_str.exports());

var context_json_path = __dirname + '/../site/rdf/v1/context.json';

var Metadata = function (serviceID, store, ns) {
    "use strict";

    var self = this;
    self.store = store;
    self.id = serviceID;
    self.ns = ns;

    self.get = function () {
        var subject = self.id;
        var predicate = null;

        if (arguments.length > 1) {
            subject = arguments[0];
            predicate = arguments[1];
        } else {
            predicate = arguments[0];
        }

        if (predicate === 'a') {
            predicate = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
        } else if (!_(predicate).startsWith('http')) {
            var parts = predicate.split(':');
            predicate = self.ns[parts[0]](parts[1]);
        }

        var result = store.find(subject, predicate, null)[0];
        return result ? result.object : null;
    };
};

(function () {
    "use strict";

    var namespace = function(uri) {
        return function(term) {
            return uri + term;
        };
    };

    var initNamespaces = function(context) {
        var data = JSON.parse(fs.readFileSync(context, { encoding: 'utf-8' }));
        var ctx = data['@context'];

        return _(ctx).reduce(function (memo, val, key) {
            if (_(val).isString() && _(val).startsWith('http')) {
                memo[key] = namespace(val);
            }
            return memo;
        }, {});
    };

    var parseTurtle = function (uri, data) {
        var deferred = when.defer();

        var parser = N3.Parser({ 'documentURI': uri });
        var store = N3.Store();

        parser.parse(data, function (err, triple, prefixes) {
            if (err) {
                deferred.reject(err);
            } else if (triple) {
                store.addTriple(triple);
            } else {
                deferred.resolve(store);
            }
        });

        return deferred.promise;
    };

    var parseJSONLD = function (uri, data) {
        var doc = JSON.parse (data);

        // If this is a plain .json file, patch a few things so we can parse it as JSON-LD.
        if (doc['@context'] === undefined) {

            var ctx_data = JSON.parse(fs.readFileSync(context_json_path, { encoding: 'utf-8' }));
            doc['@context'] = ctx_data['@context'];

            var ns = {};
            ns.rdf = namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');

            if (doc['@graph'] === undefined) {
                if (doc['@id'] === undefined) {
                    doc['@id'] = uri;
                }

                if (doc['rdf:type'] === undefined && doc[ns.rdf('type')] === undefined) {
                    doc['rdf:type'] = 'mini:Service';
                }
            }
        }

        var options = {format: 'application/nquads'};
        return jsonld.toRDF(doc, options).then(parseTurtle.bind(null, uri));
    };

    var serviceID = function(imageID) {
        // FIXME: support repo tags?

        return 'http://id.minipaas.org/' + imageID + '/service';
    };

    var parse = function(imageID, filename) {
        var data = fs.readFileSync(filename, { encoding: 'utf-8' });
        var metadata = null;
        var uri = serviceID(imageID);

        if (_(filename).endsWith('.ttl') || _(filename).endsWith('.turtle')) {
            metadata = parseTurtle (uri, data);
        } else if (_(filename).endsWith('.json') || _(filename).endsWith('.jsonld')) {
            metadata = parseJSONLD (uri, data);
        }

        return metadata.then(function (store) {
            return new Metadata(uri, store, exports.ns);
        });
    };

    exports.ns = initNamespaces(context_json_path);
    exports.serviceID = serviceID;
    exports.parse = parse;
})();
