#!/usr/bin/env node
/* -*- mode: Javascript -*-

This file is part of minipaas.
Copyright 2014 Kuno Woudt <kuno@frob.nl>

This program is licensed under copyleft-next version 0.3.0,
see LICENSE.txt for more information.

*/

require('colors');

var fs = require('fs');
var path = require('path');
var when = require('when');
var nodefn = require('when/node');
var disk = require('./disk');
var untar = require('untar')
var _ = require('underscore');

var Service = function (data) {
    "use strict";

    var self = this;

    self._docker = data.docker;
    self._info = data.info;
    self._data = data.data;
    self._env = data.env;

    self._start = function() {
        var deferred = when.defer();

        self._docker.createContainer({
            'Image': self._info.Id,
            'Cmd': ['--login'],
            'Tty': true,
            'Entrypoint': '/bin/bash'
        }, function (err, container) {
            if (err) {
                return deferred.reject(new Error('createContainer error: ' + err));
            }

            container.start(function (err, data) {
                if (err) {
                    return deferred.reject(new Error('container.start error: ' + err));
                }

                deferred.resolve(container);
            });
        });

        return deferred.promise;
    };

    self._stop = function(container) {
        var deferred = when.defer();

        container.stop(function (err, data) {
            if (err) {
                return deferred.reject(new Error('container.stop error: ' + err));
            }

            // wait a second before removing, this works around a
            // "device or resource busy" error.
            setTimeout(function () {
                container.remove({ force: true }, function (err, data) {
                    if (err) {
                        console.log('container.remove error: ' + err);
                    }
                });
            }, 1000);

            // don't wait for the remove to finish before resolving
            return deferred.resolve();
        });

        return deferred.promise;
    };

    self._extract = function(container) {
        var dir = self._container_path;
        var deferred = when.defer();

        console.log ('INFO: extract metadata for ', self._info.RepoTags[0]);

        container.copy({
            'Resource': '/etc/minipaas'
        }, function (err, stream) {
            if (err) {
                deferred.reject(new Error('container.copy error: ' + err));
                return self._stop(container);
            }

            var tarFile = dir + '/metadata.tar';
            var writer = fs.createWriteStream(tarFile);
            stream.pipe(writer);

            stream.on('end', function () {
                deferred.resolve(tarFile);
                self._stop(container);
            });
        });

        return deferred.promise.timeout(2000).catch(when.TimeoutError, function () {
            console.log('timeout!');
            self._stop(container);
        });
    };

    self._untar = function (tarFile) {
        var result = untar(path.dirname(tarFile), fs.createReadStream(tarFile));
        return when(result);
    };


    self.quickVerify = function() {
        var candidates = [
            self._container_path + '/service.json',
            self._container_path + '/service.jsonld',
            self._container_path + '/service.ttl'
        ];

        var ret = false;
        candidates.some (function (file, idx, arr) {
            if (fs.existsSync(file)) {
                ret = file;
                return true;
            } else {
                return false;
            }
        });

        return ret;
    };

    /**
    * Verify metadata:
    *
    * 1. parse service.json
    * 2. if service.json references local files, verify that they exist
    */
    self._verify = function () {
        var deferred = when.defer();

        deferred.resolve(self.quickVerify());

        return deferred.promise;
    };

    self.unpack = function () {
        self._container_path = disk.containerPath(self._info.Id);
        if (self.quickVerify()) {
            return when(self);
        }

        return when.promise(function(resolve, reject, notify) {
            self._start()
                .then(self._extract)
                .then(self._untar)
                .then(self._verify)
                .then(function (data) {
                    console.log('SUCCESS:', JSON.stringify(data, null, 4));

                    resolve(self);
                }, function (err) {
                    console.log('WARNING: unable to extract metadata for ' +
                                self._info.RepoTags[0] + ' (' + err + ')');

                    // unable to extract metadata
                    resolve(self);
                });
        });
    };

    self.metadata = function() {
        if (self._env.minipaas_version !== "1") {
            return false;
        }

        return false;
    };

    self.printInfo = function() {
        var id = "(" + self._info.Id.slice(0,12) + ")";
        var OK = "■ ".green;
        var notOK = "■ ".red;

        var metadata = self.metadata();

        if (!metadata) {
            console.log(notOK, self._info.RepoTags.join(", "), id.grey);
            return;
        }

        console.log(OK, self._info.RepoTags.join(", "), id.grey);
    };
};

(function () {
    "use strict";

    var _ = require('underscore');
    var Docker = require('dockerode');

    var parseEnv = function (env) {
        return _(env).reduce(function (memo, item, idx) {
            var parts = item.split('=');
            memo[parts[0]] = parts.length > 1 ? parts[1] : null;
            return memo;
        }, {});
    };

    var inspect = function (docker, repotags, image_info) {
        var deferred = when.defer();

        if (repotags.length && _(repotags).intersection(image_info.RepoTags).length === 0) {
            // we're looking for a specific image, and this is not it.
            return deferred.resolve (null);
        }

        docker.getImage(image_info.Id).inspect(function (err, data) {
            if (err) {
                return deferred.reject(new Error(err));
            }

            if (!data.config) {
                return deferred.resolve(null);
            }

            var environment = parseEnv(data.config.Env);
            if (environment.minipaas_version) {
                var service = new Service({
                    'docker': docker,
                    'info': image_info,
                    'data': data,
                    'env': environment
                });

                return deferred.resolve (service.unpack());
            }

            return deferred.resolve(null);
        });

        return deferred.promise;
    };

    var services = function(repotags, docker) {
        var deferred = when.defer();

        if (!docker) {
            docker = new Docker({socketPath: '/var/run/docker.sock'});
        }

        if (!repotags) {
            repotags = [];
        }

        var boundInspect = inspect.bind(null, docker, repotags);

        docker.listImages(function (err, images) {
            if (err) {
                return deferred.reject(new Error(err));
            }

            deferred.resolve(when.lift(_.compact)(
                when.map(images, boundInspect)));
        });

        return deferred.promise;
    };

    exports.services = services;
})();
