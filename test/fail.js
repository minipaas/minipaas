/* -*- mode: Javascript -*-

This file is part of minipaas.
Copyright 2014 Kuno Woudt <kuno@frob.nl>

This program is licensed under copyleft-next version 0.3.0,
see LICENSE.txt for more information.

*/

var when = require('when');

(function () {
    "use strict";

    var global_failures_left = 4;

    var reset = function (count) {
        global_failures_left = count + 1;
    };

    var attempt = function (trying) {
        var deferred = when.defer();

        setTimeout(function () {
            global_failures_left--;

            if (global_failures_left > 0) {
                deferred.reject(new Error("attempt failed"));
            } else {
                deferred.resolve({ 'success': true, 'arg': trying });
            }

        }, 0);

        return deferred.promise;
    };

    exports.reset = reset;
    exports.attempt = attempt;
})();

