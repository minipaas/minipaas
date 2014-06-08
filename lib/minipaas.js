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
var N3 = require('n3');
var nodefn = require('when/node');
var disk = require('./disk');
var untar = require('untar');
var _ = require('underscore');

var metadata = require('../lib/metadata.js');

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

    self.unpack = function () {
        self._container_path = disk.containerPath(self._info.Id);
        if (self.quickVerify()) {
            return when(self);
        }

        return when.promise(function(resolve, reject, notify) {
            self._start()
                .then(self._extract)
                .then(self._untar)
                .then(self.metadata)
                .then(function (data) {
                    resolve(self);
                }, function (err) {
                    // unable to extract metadata
                    resolve(self);
                });
        });
    };

    self.metadata = function() {
        if (self._env.minipaas_version !== "1") {
            return when.reject(new Error("not a minipaas image"));
        }

        var filename = self.quickVerify();
        if (!filename) {
            return when.reject(new Error("no metadata found (please ensure your image has a /etc/minipaas/service.json file)"));
        }

        return metadata.parse(self._info.Id, filename);
    };

    self.printInfo = function() {
        var id = "(" + self._info.Id.slice(0,12) + ")";
        var tag = self._info.RepoTags[0];
        var OK = "■ ".green;
        var notOK = "■ ".red;

        var idStr = tag + ' ' + id;
        var colWidth = 52;
        var padding = '';
        if (idStr.length < colWidth) {
            padding = _('').pad (colWidth - idStr.length);
        }

        self.metadata().then(function (info) {
            var dc_title = N3.Util.getLiteralValue(info.get('dc:title'));
            console.log(OK, tag, id.grey, padding, dc_title.bold.white);
        }).catch(function (err) {
            console.log(notOK, tag, id.grey, padding, err.toString ().bold.red);
        });
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
