"use strict";
/* -*- mode: Javascript -*-

turtle-to-jsonld
Copyright 2013 Kuno Woudt <kuno@frob.nl>

turtle-to-jsonld is licensed under copyleft-next version 0.3.0, see
LICENSE.txt for more information.

*/

var metadata = require('../lib/metadata.js');
var assert = require('assert');
var N3 = require('n3');

var ns = metadata.ns;

suite ('Metadata', function () {
    suite ('JSON-LD', function () {

        test ('parse', function (done) {
            var filename = __dirname + '/data/service.json';
            var imageID = '6950f04ee720641dd7c0215cce762f64c2b2649d51aa86fc242da8ed301b9110';
            metadata.parse(imageID, filename).then(function (info) {
                assert.equal (info.get('a'), ns.mini('Service'));

                var dc_title = info.get('dc:title');
                assert.equal (N3.Util.isLiteral(dc_title), true);
                assert.equal (N3.Util.getLiteralValue(dc_title), 'Minipaas: Hello, World!');

                var mini_storage = info.get('mini:storage')
                assert.equal (mini_storage, null);

                var mini_license = info.get('mini:license')
                assert.equal (N3.Util.isBlank(mini_license), true);
                var license_id = info.get(mini_license, 'mini:licenseIdentifier');
                var license_uri = info.get(mini_license, 'foaf:homepage');
                assert.equal (N3.Util.getLiteralValue(license_id), 'copyleft-next-0.3');
                assert.equal (N3.Util.isUri(license_uri), true);

                var homepage = info.get('foaf:homepage');
                assert.equal (N3.Util.isUri(homepage), true);
                assert.equal (homepage, 'http://minipaas.org');
            }).then(done, done);
        });

    });

    suite ('Turtle', function () {

        test ('parse', function (done) {
            var filename = __dirname + '/data/service.ttl';
            var imageID = 'e555080d282b0d2a79cb0ba3fdd56c629e6e250a2fb6fd6fefb56b484e873cc0';
            var serviceID = metadata.serviceID (imageID);

            metadata.parse(imageID, filename).then(function (info) {
                assert.equal (info.get('a'), ns.mini('Service'));

                var dc_title = info.get('dc:title');
                assert.equal (N3.Util.isLiteral(dc_title), true);
                assert.equal (N3.Util.getLiteralValue(dc_title), 'Minipaas: Autoincrement');
                assert.equal (N3.Util.getLiteralLanguage(dc_title), 'en');

                var mini_storage = info.get('mini:storage')
                assert.equal (N3.Util.getLiteralValue(mini_storage), 'minipaas/plugins.redis');
                assert.equal (N3.Util.getLiteralType(mini_storage), ns.xsd('string'));

                var mini_license = info.get('mini:license')
                assert.equal (N3.Util.isBlank(mini_license), true);
                var license_id = info.get(mini_license, 'mini:licenseIdentifier');
                var license_uri = info.get(mini_license, 'foaf:homepage');
                assert.equal (N3.Util.getLiteralValue(license_id), 'copyleft-next-0.3');
                assert.equal (N3.Util.isUri(license_uri), true);

                var homepage = info.get('foaf:homepage');
                assert.equal (N3.Util.isUri(homepage), true);
                assert.equal (homepage, 'http://minipaas.org');
            }).then(done, done);
        });

    });
});
