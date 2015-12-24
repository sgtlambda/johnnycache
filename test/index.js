'use strict';

require('./support/bootstrap');

const _       = require('lodash');
const Cache   = require('./../lib/Cache');
const sinon   = require('sinon');
const pify    = require('pify');
const fs      = require('fs');
const fsExtra = require('fs-extra');
const del     = require('del');

const copy = function () {
    return pify(fsExtra.copy)('sample/assets/foo.txt', 'sample/build/foo.txt');
};

const uncopy = function () {
    return del(['sample/build']);
};

const modify = function () {
    return pify(fsExtra.copy)('sample/assets/foo.txt', 'sample/assets/foo2.txt');
};

const resetWorkspace = function () {
    return del(['sample/build', '.johnny', 'sample/assets/foo2.txt']);
};

var defaultOptions = {
    action: 'op',
    input:  ['sample/assets/*'],
    output: ['sample/build/*'],
    ttl:    60000
};

describe('Cache', ()=> {
    let cache;
    beforeEach(()=> {
        cache = new Cache();
    });
    afterEach(()=> {
        return resetWorkspace();
    });
    describe('doCached', ()=> {
        it('should not run the callable a second time if the input files stayed the same', () => {
            let run = sinon.spy();
            return cache.doCached(run, defaultOptions)
                .then(() => uncopy())
                .then(() => cache.doCached(run, defaultOptions))
                .then(() => run.should.have.been.calledOnce);
        });
        it('should run the callable twice if the input files were modified', () => {
            let run = sinon.spy(copy);
            return cache.doCached(run, defaultOptions)
                .then(() => modify())
                .then(() => cache.doCached(run, defaultOptions))
                .then(() => run.should.have.been.calledTwice);
        });
        it('should run the callable twice if the cached version has expired', () => {
            let run     = sinon.spy(copy);
            let options = _.assign({}, defaultOptions, {'ttl': -1});
            return cache.doCached(run, options)
                .then(() => uncopy())
                .then(() => cache.doCached(run, options))
                .then(() => run.should.have.been.calledTwice);
        });
        it('should restore the operation from cache the second time if the input files stayed the same', () => {
            return cache.doCached(copy, defaultOptions)
                .then(() => uncopy())
                .then(() => cache.doCached(copy, defaultOptions))
                .then(() => pify(fs.readFile)('sample/build/foo.txt', {encoding: 'utf8'}))
                .then((data) => {
                    data.should.equal('bar');
                });
        });
        it('should work with the compress option set to true', () => {
            let options = _.assign({}, defaultOptions, {'compress': true});
            return cache.doCached(copy, options)
                .then(() => uncopy())
                .then(() => cache.doCached(copy, options))
                .then(() => pify(fs.readFile)('sample/build/foo.txt', {encoding: 'utf8'}))
                .then((data) => {
                    data.should.equal('bar');
                });
        });
    });
    describe('purgeExpired', () => {
        it('should delete the files of expired cache entries', () => {
            let expiresLater       = defaultOptions;
            let expiresImmediately = _.assign({}, defaultOptions, {'ttl': -1, 'action': 'op2'});
            let resultExpiresImmediately, resultExpiresLater;
            return cache.doCached(copy, expiresImmediately)
                .then(r => resultExpiresImmediately = r)
                .then(() => cache.doCached(copy, expiresLater))
                .then(r => resultExpiresLater = r)
                .then(() => cache.purgeExpired())
                .then(() => Promise.all([
                    pify(fs.access)(cache.getStorageLocation(resultExpiresImmediately)).should.be.rejected,
                    pify(fs.access)(cache.getStorageLocation(resultExpiresLater)).should.be.resolved
                ]));
        });
    });
});