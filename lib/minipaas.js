/* -*- mode: Javascript -*-

This file is part of minipaas.
Copyright 2014 Kuno Woudt <kuno@frob.nl>

This program is licensed under copyleft-next version 0.3.0,
see LICENSE.txt for more information.

*/

require('colors');

var _ = require('underscore');
var disk = require('./disk');
var Docker = require('./docker');
var fs = require('fs');
var metadata = require('./metadata');
var N3 = require('n3');
var nodefn = require('when/node');
var path = require('path');
var retry = require('./retry');
var when = require('when');

var Service = function (data) {
    "use strict";

    var self = this;

    var parseEnv = function (env) {
        return _(env).reduce(function (memo, item, idx) {
            var parts = item.split('=');
            memo[parts[0]] = parts.length > 1 ? parts[1] : null;
            return memo;
        }, {});
    };

    self._metadata = data.metadata;
    self._inspect = data.inspect;
    self._docker = data.docker;
    self._container_path = null;
    self._minipaas_version = null;

    self._env = null;

    if (self._inspect.Config && self._inspect.Config.Env) {
        self._env = parseEnv(self._inspect.Config.Env);

        if (self._env.minipaas_version) {
            self._minipaas_version = parseInt(self._env.minipaas_version, 10);
            self._container_path = disk.containerPath(self._metadata.id);
        }
    }

    self._copy_metadata = function(container_id) {
        var deferred = when.defer();
        var dir = self._container_path;

        var options = { sleep: 2000 };
        var args = [ container_id, '/etc/minipaas', dir ];

        return retry(self._docker.cp, args, options).finally(function () {
            return self._docker.stop(container_id);
        });
    };

    self.quickVerify = function() {
        var candidates = [
            self._container_path + '/minipaas/service.json',
            self._container_path + '/minipaas/service.jsonld',
            self._container_path + '/minipaas/service.ttl'
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
        if (self.quickVerify()) {
            return when(self);
        }

        return when.promise(function(resolve, reject, notify) {
            self._docker.start(self._metadata.id)
                .then(self._copy_metadata)
                .then(self.metadata)
                .then(function (data) {
                    resolve(self);
                }, function (err) {
                    resolve(self);
                });
        });
    };

    self.metadata = function() {
        if (self._minipaas_version !== 1) {
            return when.reject(new Error("not a minipaas image"));
        }

        var filename = self.quickVerify();
        if (!filename) {
            return when.reject(new Error("no metadata found (please ensure your image has a /etc/minipaas/service.json file)"));
        }

        return metadata.parse(self._metadata.id, filename);
    };

    self.printInfo = function() {
        var id = "(" + self._metadata.id.slice(0,12) + ")";
        var tag = self._metadata.repoTag;
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

    // var pull = function(repotags, docker) {
    //     if (!docker) {
    //         docker = new Docker({socketPath: '/var/run/docker.sock'});
    //     }

    //     if (!repotags) {
    //         repotags = [];
    //     }

    //     return when.map(repotags, function (item) {
    //         var deferred = when.defer();

    //         docker.pull(item, function (err, data) {
    //             if (err) {
    //                 console.log('pull error', err);
    //                 return deferred.reject(new Error(err));
    //             }

    //             deferred.resolve({ 'repotag': item, 'result': data });
    //         });

    //         return deferred.promise;
    //     });
    // };

    var services = function(repotags, docker) {
        if (!docker) {
            docker = new Docker();
        }

        return docker.inspect(repotags).then(function (data) {
            return _(data).map(function (item) { return new Service(item); });
        });
    };

    // exports.pull = pull;
    exports.services = services;
})();
