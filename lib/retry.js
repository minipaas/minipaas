/* -*- mode: Javascript -*-

This file is part of minipaas.
Copyright 2014 Kuno Woudt <kuno@frob.nl>

This program is licensed under copyleft-next version 0.3.0,
see LICENSE.txt for more information.

*/

var _ = require('underscore');
var when = require('when');

var retry = function (fn, args, options) {
    var deferred = when.defer();

    options = _(options ? options : {}).defaults({
        attempts: 8,
        sleep: 0
    });

    attempts_left = options.attempts;
    if (attempts_left < 1) {
        attempts_left = 8;
    }

    var self = this;

    self.success = function (value) {
        deferred.resolve(value);
    };

    self.try_again = function (err) {
        attempts_left--;

        if (attempts_left > 0) {
            when(fn.apply(null, args)).then(self.success).catch(function (err) {
                setTimeout(function () {
                    self.try_again(err);
                }, options.sleep);
            });
        } else {
            deferred.reject(err);
        }
    };

    self.try_again();

    return deferred.promise;
};

module.exports = retry;
