'use strict';

const Cache = require('./lib/Cache');

const CacheFlow = require('./lib/CacheFlow');
const Intent    = require('./lib/Intent');

const SavedToCache      = require('./lib/SavedToCache');
const RestoredFromCache = require('./lib/RestoredFromCache');

module.exports = Cache;

module.exports.Cache     = Cache;
module.exports.CacheFlow = CacheFlow;
module.exports.Intent    = Intent;

module.exports.SavedToCache      = SavedToCache;
module.exports.RestoredFromCache = RestoredFromCache;