'use strict';

require('./support/bootstrap');

const _                  = require('lodash');
const Promise            = require('pinkie-promise');
const CacheableOperation = require('./../lib/CacheableOperation');
const Cache              = require('./../lib/Cache');
const sinon              = require('sinon');
const pify               = require('pify');
const fs                 = require('fs');
const fsExtra            = require('fs-extra');
const del                = require('del');

require('sinon-as-promised');

const copy = function () {
    return pify(fsExtra.copy)('test/sample/assets/foo.txt', 'test/sample/build/foo.txt');
};

const uncopy = function () {
    return del(['test/sample/build']);
};

const modify = function () {
    return pify(fsExtra.copy)('test/sample/assets/foo.txt', 'test/sample/assets/foo2.txt');
};

const resetWorkspace = function () {
    return del(['test/sample/build', '.johnny', 'test/sample/assets/foo2.txt']);
};

var defaultOptions = {
    action: 'op',
    input:  ['test/sample/assets/*'],
    output: ['test/sample/build/*'],
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

    describe('.doCached', ()=> {

        _.forEach({

            'input and output with wildcard': defaultOptions,

            'input and output as folder names (and strings)': {
                action: 'op',
                input:  'test/sample/assets',
                output: 'test/sample/build',
                ttl:    60000
            },

            'no input given': {
                action: 'op',
                output: ['test/sample/build'],
                ttl:    60000
            }

        }, (defaultOptions, description) => {

            describe(description, () => {

                it('should not run the callable a second time if the input files stayed the same', () => {
                    let run = sinon.spy();
                    return cache.doCached(run, defaultOptions)
                        .then(() => uncopy())
                        .then(() => cache.doCached(run, defaultOptions))
                        .then(() => run.should.have.been.calledOnce);
                });

                if (defaultOptions.input)
                    it('should run the callable twice if the input files were modified', () => {
                        let run = sinon.spy(copy);
                        return cache.doCached(run, defaultOptions)
                            .then(() => modify())
                            .then(() => cache.doCached(run, defaultOptions))
                            .then(() => run.should.have.been.calledTwice);
                    });

                it('should run the callable twice if the output argument is different', () => {
                    let run = sinon.spy(copy);
                    return cache.doCached(run, defaultOptions)
                        .then(() => cache.doCached(run, _.assign(defaultOptions, {
                            output: ['test/sample/build/*.txt']
                        })))
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
                        .then(() => pify(fs.readFile)('test/sample/build/foo.txt', {encoding: 'utf8'}))
                        .then((data) => {
                            data.should.equal('bar');
                        });
                });

                it('should work with the compress option set to true', () => {
                    let options = _.assign({}, defaultOptions, {'compress': true});
                    return cache.doCached(copy, options)
                        .then(() => uncopy())
                        .then(() => cache.doCached(copy, options))
                        .then(() => pify(fs.readFile)('test/sample/build/foo.txt', {encoding: 'utf8'}))
                        .then((data) => {
                            data.should.equal('bar');
                        });
                });

                it('should generate a file at the location corresponding to the cached result', () => {
                    let run = sinon.spy(copy);
                    return cache.doCached(run, defaultOptions)
                        .then(cachedResult => pify(fs.access)(cache.getStorageLocation(cachedResult)));
                });

                it('should fallback gracefully if the cached result has no corresponding file', () => {
                    let run = sinon.spy(copy);
                    return cache.doCached(run, defaultOptions)
                        .then(cachedResult => del(cache.getStorageLocation(cachedResult)))
                        .then(() => cache.doCached(run, defaultOptions))
                        .then(() => run.should.have.been.calledTwice);
                });
            });

        });
    });

    describe('.purgeExpired', () => {
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

    describe('.prepareResult', () => {
        it('should prevent hash collisions', () => {
            let result1, result2;
            const fakeOp = () => {
                let fakeOp         = new CacheableOperation(() => Promise.resolve(), defaultOptions);
                fakeOp.getFileHash = () => Promise.resolve('bar');
                return fakeOp;
            };
            return cache.run(fakeOp())
                .then(result => {
                    result1 = result;
                    return cache.prepareResult(fakeOp());
                })
                .then(result => {
                    result2 = result;
                    result1.fileName.should.not.eql(result2.fileName);
                });
        });
    });
});