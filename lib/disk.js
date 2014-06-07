#!/usr/bin/env node
/* -*- mode: Javascript -*-

This file is part of minipaas.
Copyright 2014 Kuno Woudt <kuno@frob.nl>

This program is licensed under copyleft-next version 0.3.0,
see LICENSE.txt for more information.

*/

var fs = require('fs');
var xdg = require('xdg');
var mkdir = require('mkdir-parents');

var appName = 'minipaas';

var containerPath = function (imageId) {
    var dir = xdg.basedir.cachePath(appName + '/' + imageId);
    mkdir.sync(dir);

    return dir;
};

exports.containerPath = containerPath;
