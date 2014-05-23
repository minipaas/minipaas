#!/usr/bin/env node
/* -*- mode: Javascript -*-

bin/metadata — this file is part of minipaas.
Copyright 2014 Kuno Woudt <kuno@frob.nl>

This program is licensed under copyleft-next version 0.3.0,
see LICENSE.txt for more information.

*/

require('colors');

(function () {
    "use strict";

    var _ = require('underscore');
    var when = require('when');
    var Docker = require('dockerode');

    var parse_env = function (env) {
        return _(env).reduce(function (memo, item, idx) {
            var parts = item.split('=');
            memo[parts[0]] = parts.length > 1 ? parts[1] : null;
            return memo;
        }, {});
    };

    var info = function (service) {
        // FIXME: make service a proper "type" instead of a dict?
        var OK = service.env.minipaas_version === "1" ? "■ ".green : "■ ".red;
        var id = "(" + service.info.Id.slice(0,12) + ")";
        console.log(OK, service.info.RepoTags.join(", "), id.grey);
    };

    var inspect = function (docker, repotags, image_info) {
        var deferred = when.defer();

        if (repotags.length && _(repotags).intersection(image_info.RepoTags).length === 0) {
            // we're looking for a specific image, and this is not it.
            return deferred.resolve (null);
        }

        docker.getImage(image_info.Id).inspect(function (err, data) {
            if (err) {
                return deferred.reject(err);
            }

            if (!data.config) {
                return deferred.resolve(null);
            }

            var environment = parse_env(data.config.Env);
            if (environment.minipaas_version) {
                return deferred.resolve ({ 'info': image_info, 'data': data, 'env': environment });
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
                return deferred.reject(err);
            }

            deferred.resolve(when.lift(_.compact)(
                when.map(images, boundInspect)));
        });

        return deferred.promise;
    };

    exports.info = info;
    exports.services = services;
})();
