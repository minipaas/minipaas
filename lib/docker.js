/* -*- mode: Javascript -*-

This file is part of minipaas.
Copyright 2014 Kuno Woudt <kuno@frob.nl>

This program is licensed under copyleft-next version 0.3.0,
see LICENSE.txt for more information.


This file provides an interface to interact with docker.  It interacts
with docker using the commandline "docker" command.

Eventually this should use the API directly or use an existing library
like [dockerode](https://www.npmjs.org/package/dockerode).

*/

require('colors');
var _ = require('underscore');
var _str = require('underscore.string');
var spawn = require('child_process').spawn;
var when = require('when');

_.mixin(_str.exports());

var run = function(command, args) {
    "use strict";

    var deferred = when.defer();

    var child = spawn(
        command, args, { stdio: [ 'ignore', 'pipe', process.stderr ] }
    );

    var chunks = [];
    child.stdout.on('data', function (data) {
        chunks.push(data);
    });

    child.on('close', function (code) {
        if (code === 0) {
            deferred.resolve(chunks.join(''));
        } else {
            deferred.reject(new Error("command failed: " + command + " " + args.join(" ")));
        }
    });

    return deferred.promise;
};

var Docker = function () {
    "use strict";

    var self = this;

    self.start = function(image_id, options) {
        options = _(options ? options : {}).defaults({
            cmd: [ '--login' ],
            entrypoint: [ '/bin/bash' ],
            args: [ '--interactive=true', '--detach=true' ]
        });

        var args = [ 'run' ].concat(
            options.args,
            [ '--entrypoint=' + options.entrypoint, image_id ],
            options.cmd
        );

        return run('docker', args).then(function (container_id) {
            return _(container_id).trim();
        });
    };

    self.stop = function(container_id) {
        return run('docker', [ 'stop', container_id ]).then(function () {
            return run('docker', [ 'rm', container_id ]);
        });
    };

    self.cp = function(container_id, src_path, dst_path) {
        var args = [ 'cp', container_id + ':' + src_path, dst_path ];
        return run('docker', args);
    };

    self.inspectOne = function(metadata) {
        var deferred = when.defer();

        return run('docker', [ 'inspect', metadata.id ]).then(function (data) {
            return {
                'docker': self,
                'inspect': JSON.parse (data)[0],
                'metadata': metadata
            };
        });
    };

    self.images = function() {
        return run('docker', [ 'images', '--no-trunc' ]).then(function (output) {
            var image_info = {};

            output.split("\n").forEach(function (line) {
                var parts = line.split(/\s+/);
                if (parts[0] === 'REPOSITORY' || parts[0] === '') {
                    return;
                }

                var data = {
                    'repository': parts[0],
                    'tag': parts[1],
                    'repoTag': parts[0] + ':' + parts[1],
                    'id': parts[2]
                };

                image_info[data.repoTag] = data;
            });

            return image_info;
        });
    };

    self.inspect = function(repositories) {
        if (!repositories) {
            repositories = [];
        }

        var repotags = _(repositories).map(function (item) {
            return _(item).contains(':') ? item : item + ':latest';
        });

        return self.images().then(function (metadata) {
            var picked = repotags.length ? _(metadata).pick(repotags) : metadata;
            return when.map(_(picked).values(), self.inspectOne);
        });
    };
};

module.exports = Docker;
