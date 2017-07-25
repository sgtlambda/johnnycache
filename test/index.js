'use strict';

require('./support/bootstrap');

const _                  = require('lodash');
const CacheableOperation = require('./../lib/CacheableOperation');
const Cache              = require('./../lib/Cache');
const sinon              = require('sinon');
const pify               = require('pify');
const fs                 = require('fs');
const fsExtra            = require('fs-extra');
const del                = require('del');
const SavedToCache       = require('./../lib/SavedToCache');
const RestoredFromCache  = require('./../lib/RestoredFromCache');
const CachedResult       = require('./../lib/CachedResult');
const StoringResult      = require('./../lib/StoringResult');

const shouldHaveNDocs = (cache, n) => () => cache.index.all().should.have.length(n);

const copy = function () {
    let copy = pify(fsExtra.copy);
    return Promise.all([
        copy('test/sample/assets/foo.txt', 'test/sample/build/foo.txt'),
        copy('test/sample/assets/.boo', 'test/sample/build/.boo')
    ]);
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

const defaultOptions = {
    action: 'op',
    input:  ['test/sample/assets/*'],
    output: ['test/sample/build/*'],
    ttl:    60000
};

const defaultOptionBuilder = () => _.assign({}, defaultOptions);

describe('Cache', () => {

    let cache;

    beforeEach(() => {
        cache = new Cache();
    });

    afterEach(() => {
        return resetWorkspace();
    });

    describe('.doCached', () => {

        let checkFile;

        beforeEach(() => {
            checkFile = options => cache.doCached(copy, options)
                .then(() => uncopy()).then(() => cache.doCached(copy, options))
                .then(() => pify(fs.access)('test/sample/build/.boo'));
        });

        describe('input and output with wildcard', () => {

            it('should not store and restore files starting with a dot', () => {
                return checkFile(defaultOptionBuilder()).should.be.rejected;
            });
        });

        describe('input and output with short directory syntax', () => {

            it('should store and restore files starting with a dot', () => {
                return checkFile(_.assign({}, defaultOptionBuilder(), {
                    input:  'test/sample/assets',
                    output: 'test/sample/build'
                }));
            });
        });

        _.forEach({

            'input and output with wildcard': () => defaultOptionBuilder(),

            'input and output as folder names (and strings)': () => _.assign({}, defaultOptionBuilder(), {
                input:  'test/sample/assets',
                output: 'test/sample/build'
            }),

            'no input given': () => _.omit(defaultOptionBuilder(), 'input'),

            'lazyLoad': () => _.assign({}, defaultOptionBuilder(), {lazyLoad: true})

        }, (optionBuilder, description) => {

            describe(description, () => {

                let defaultOptions;

                beforeEach(() => {
                    defaultOptions = optionBuilder();
                });

                it('should correctly invoke the callbacks', () => {
                    let run       = sinon.spy();
                    let onStore   = sinon.spy();
                    let onRun     = sinon.spy();
                    let onRestore = sinon.spy();
                    cache.on('store', onStore);
                    cache.on('run', onRun);
                    cache.on('restore', onRestore);
                    return cache.doCached(run, defaultOptions)
                        .then(() => {
                            onStore.should.have.been.calledAfter(run);
                            onRun.should.have.been.calledBefore(run);
                            onRestore.should.not.have.been.called;
                            return uncopy();
                        })
                        .then(() => cache.doCached(run, defaultOptions))
                        .then(() => {
                            onStore.should.have.been.calledOnce;
                            onRun.should.have.been.calledOnce;
                            onRestore.should.have.been.calledOnce;
                        });
                });

                it('should not run the callable a second time if the input files stayed the same', () => {
                    let run = sinon.spy();
                    return cache.doCached(run, defaultOptions)
                        .then(() => uncopy())
                        .then(() => cache.doCached(run, defaultOptions))
                        .then(() => run.should.have.been.calledOnce);
                });

                if (optionBuilder().input)
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
                        .then(result => pify(fs.access)(cache.getAbsolutePath(result.cachedResult.fileName)));
                });

                it('should fallback gracefully if the cached result has no corresponding file', () => {
                    let run = sinon.spy(copy);
                    return cache.doCached(run, defaultOptions)
                        .then(result => del(cache.getAbsolutePath(result.cachedResult.fileName)))
                        .then(() => cache.doCached(run, defaultOptions))
                        .then(() => run.should.have.been.calledTwice);
                });

                it('should not await the saving of the result when awaitStore is set to false', () => {
                    let run     = sinon.spy(copy);
                    let onStore = sinon.spy();
                    cache.on('store', onStore);
                    let options = _.assign({}, defaultOptions, {awaitStore: false});
                    return cache.doCached(run, options)
                        .then(storingResult => {
                            run.should.have.been.called;
                            onStore.should.not.have.been.called;
                            storingResult.should.be.an.instanceof(StoringResult);
                            storingResult.cacheableOperation.should.be.an.instanceof(CacheableOperation);
                            return storingResult.savedToCache;
                        })
                        .then(savedToCache => {
                            onStore.should.have.been.called;
                            savedToCache.should.be.an.instanceof(SavedToCache);
                        });
                });
            });

        });

        it('should return SavedToCache and RestoredFromCache objects for performance analytics purposes', () => {
            let run = sinon.spy();
            return cache.doCached(run, defaultOptions)
                .then(saved => {
                    saved.should.be.an.instanceof(SavedToCache);
                    saved.should.have.property('operationRuntime').that.is.a('number');
                    saved.should.have.property('storageRuntime').that.is.a('number');
                    saved.should.have.property('cachedResult').that.is.an.instanceof(CachedResult);
                })
                .then(() => uncopy())
                .then(() => cache.doCached(run, defaultOptions))
                .then(restored => {
                    restored.should.be.an.instanceof(RestoredFromCache);
                    restored.should.have.property('runtime').that.is.a('number');
                    restored.should.have.property('cachedResult').that.is.an.instanceof(CachedResult);
                });
        });
    });

    describe('lifecycle events', () => {

        let spy;

        beforeEach(() => {

            spy = sinon.spy();
        });

        describe('cleanup', () => {

            it('should be fired when the cache exceeds the maximum allowed size', () => {

                cache.on('cleanup', spy);

                return cache.doCached(sinon.spy(), defaultOptions)
                    .then(() => {
                        cache.maxSize = -1;
                        return cache.sync();
                    })
                    .then(() => {
                        spy.should.have.been.calledOnce;
                    });
            });
        });

        describe('query', () => {

            it('should be fired when running a cacheable operation', () => {

                cache.on('query', spy);

                return cache.doCached(sinon.spy(), defaultOptions)
                    .then(() => {
                        spy.should.have.been.calledOnce;
                    });
            });
        });

        describe('saved', () => {

            it('should have been fired after running a cacheable operation for the first time', () => {

                cache.on('saved', spy);

                return cache.doCached(sinon.spy(), defaultOptions)
                    .then(() => {
                        spy.should.have.been.calledOnce;
                    });
            });

            it('should not fire when running an identical cacheable operation for the second time', () => {

                return cache.doCached(sinon.spy(), defaultOptions)
                    .then(() => {
                        cache.on('saved', spy);
                        return cache.doCached(sinon.spy(), defaultOptions);
                    }).then(() => {
                        spy.should.not.have.been.called;
                    });
            });
        });
    });

    describe('.sync', () => {
        it('should delete the files of expired cache entries', () => {
            let expiresLater       = defaultOptions;
            let expiresImmediately = _.assign({}, defaultOptions, {'ttl': -1, 'action': 'op2'});
            let resultExpiresImmediately, resultExpiresLater;
            return cache.doCached(copy, expiresImmediately)
                .then(r => resultExpiresImmediately = r)
                .then(() => cache.doCached(copy, expiresLater))
                .then(r => resultExpiresLater = r)
                .then(() => cache.sync())
                .then(() => Promise.all([
                    pify(fs.access)(cache.getAbsolutePath(resultExpiresImmediately.cachedResult.fileName)).should.be.rejected,
                    pify(fs.access)(cache.getAbsolutePath(resultExpiresLater.cachedResult.fileName)).should.be.fulfilled
                ]))
                .then(shouldHaveNDocs(cache, 1));
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
                    result1.cachedResult.fileName.should.not.eql(result2.fileName);
                });
        });
    });

    describe('.removeResults', () => {
        it('should remove the given results', () => {
            let results;
            return Promise.all([
                cache.doCached(sinon.spy(), defaultOptions),
                cache.doCached(sinon.spy(), _.assign({}, defaultOptions, {'action': 'op 2'})),
                cache.doCached(sinon.spy(), _.assign({}, defaultOptions, {'action': 'op 3'})),
            ])
                .then(r => {
                    results = _.map(r, 'cachedResult');
                    shouldHaveNDocs(cache, 3)();
                    return cache.removeResults([results[0], results[2]]);
                })
                .then(() => {
                    const docs = cache.index.all();
                    docs.should.have.length(1);
                    docs[0].should.have.property('id', results[1].id);
                });
        });
    });

    describe('db', () => {
        describe('persistence', () => {
            it('should persist added entries', () => {
                return cache.doCached(sinon.spy(), defaultOptions)
                    .then(shouldHaveNDocs(cache, 1))
                    .then(() => (new Cache()).sync())
                    .then(newCache => shouldHaveNDocs(newCache, 1)());
            });
            it('should not persist removed entries', () => {
                return Promise.all([
                    cache.doCached(_.noop, defaultOptions),
                    cache.doCached(_.noop, _.assign({}, defaultOptions, {'ttl': -1, 'action': 'op2'})),
                ])
                    .then(shouldHaveNDocs(cache, 1))
                    .then(() => cache.sync())
                    .then(shouldHaveNDocs(cache, 1))
                    .then(() => (new Cache()).sync())
                    .then(newCache => shouldHaveNDocs(newCache, 1)());
            });
        });
    });
});