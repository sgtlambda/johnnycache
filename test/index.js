'use strict';

require('./support/bootstrap');

const _       = require('lodash');
const globby  = require('globby');
const sinon   = require('sinon');
const fs      = require('fs');
const del     = require('del');
const pify    = require('pify');
const fsExtra = require('fs-extra');
const fsCopy  = pify(fsExtra.copy);

const Intent            = require('./../lib/Intent');
const Cache             = require('./../lib/Cache');
const SavedToCache      = require('./../lib/SavedToCache');
const RestoredFromCache = require('./../lib/RestoredFromCache');
const Result            = require('./../lib/Result');
const Runner            = require('./../lib/Runner');

const shouldHaveNDocs = (cache, n) => () => cache.index.all().should.have.length(n);

const copy = async () => {
    const d = await globby('test/sample/assets', {dot: true});
    return Promise.all(d.map(path => {
        return fsCopy(path, path.replace('test/sample/assets', 'test/sample/build'));
    }));
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

describe('Cache', () => {

    let cache;

    /**
     * Convenience method that wraps the instantiation of an Intent
     * @param {Function} run
     * @param {Object} options
     * @param {Object} runnerOptions
     * @returns {SavedToCache|RestoredFromCache}
     */
    const doCached = (run = null, options = defaultOptions, runnerOptions = {}) => {
        if (run === null) run = sinon.stub();
        const intent = new Intent(run, options);
        return cache.run(intent, runnerOptions);
    };

    /**
     * Run the "copy" operation (with cache enabled) with given cache options,
     * then clear the output folder, then run the operation with cache again,
     * then check if the given file at "fileToCheck" exists.
     * @param cacheOptions
     * @param fileToCheck
     * @return {Promise<void>}
     */
    const checkFile = async (cacheOptions, fileToCheck = 'test/sample/build/.boo') => {
        await doCached(copy, cacheOptions);
        await uncopy();
        await doCached(copy, cacheOptions);
        return pify(fs.access)(fileToCheck);
    };

    beforeEach(() => cache = new Cache());

    afterEach(resetWorkspace);

    describe('.run', () => {

        describe('input and output with wildcard', () => {

            // as to provide a temporary workaround for https://github.com/mrmlnc/fast-glob/issues/226
            // the below test currently doesn't pass
            
            // it('should not store and restore files starting with a dot', () => {
            //     return checkFile(defaultOptions).should.be.rejected;
            // });
        });

        describe('output with "short directory syntax"', () => {

            it('should store and restore files starting with a dot', () => checkFile({
                ...defaultOptions, output: 'test/sample/build',
            }));

            it('should store and restore files in subdirectories', () => checkFile({
                ...defaultOptions, output: 'test/sample/build',
            }, 'test/sample/build/deep/path/file.txt'));
        });

        const runBasicCacheTests = optionBuilder => {

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
                return doCached(run, defaultOptions)
                    .then(() => {
                        onStore.should.have.been.calledAfter(run);
                        onRun.should.have.been.calledBefore(run);
                        onRestore.should.not.have.been.called;
                        return uncopy();
                    })
                    .then(() => doCached(run, defaultOptions))
                    .then(() => {
                        onStore.should.have.been.calledOnce;
                        onRun.should.have.been.calledOnce;
                        onRestore.should.have.been.calledOnce;
                    });
            });

            it('should not run the callable a second time if the input files stayed the same', () => {
                let run = sinon.spy();
                return doCached(run, defaultOptions)
                    .then(() => uncopy())
                    .then(() => doCached(run, defaultOptions))
                    .then(() => run.should.have.been.calledOnce);
            });

            if (optionBuilder().input)
                it('should run the callable twice if the input files were modified', () => {
                    let run = sinon.spy(copy);
                    return doCached(run, defaultOptions)
                        .then(() => modify())
                        .then(() => doCached(run, defaultOptions))
                        .then(() => run.should.have.been.calledTwice);
                });

            it('should run the callable twice if the output argument is different', async () => {
                let run = sinon.spy(copy);
                await doCached(run, defaultOptions);
                await doCached(run, _.assign({}, defaultOptions, {
                    output: ['test/sample/build/*.txt']
                }));
                return run.should.have.been.calledTwice;
            });

            it('should run the callable twice if the cached version has expired', () => {
                let run     = sinon.spy(copy);
                let options = _.assign({}, defaultOptions, {'ttl': -1});
                return doCached(run, options)
                    .then(() => uncopy())
                    .then(() => doCached(run, options))
                    .then(() => run.should.have.been.calledTwice);
            });

            it('should restore the operation from cache the second time if the input files stayed the same', () => {
                return doCached(copy, defaultOptions)
                    .then(() => uncopy())
                    .then(() => doCached(copy, defaultOptions))
                    .then(() => pify(fs.readFile)('test/sample/build/foo.txt', {encoding: 'utf8'}))
                    .then((data) => {
                        data.should.equal('bar');
                    });
            });

            it('should work with the compress option set to true', () => {
                let options = _.assign({}, defaultOptions, {'compress': true});
                return doCached(copy, options)
                    .then(() => uncopy())
                    .then(() => doCached(copy, options))
                    .then(() => pify(fs.readFile)('test/sample/build/foo.txt', {encoding: 'utf8'}))
                    .then((data) => {
                        data.should.equal('bar');
                    });
            });

            it('should generate a file at the location corresponding to the cached result', async () => {

                let run = sinon.spy(copy);

                const {result} = await doCached(run, defaultOptions);

                await pify(fs.access)(cache.getAbsolutePath(result.filename));
            });

            it('should fallback gracefully if the cached result has no corresponding file', () => {
                let run = sinon.spy(copy);
                return doCached(run, defaultOptions)
                    .then(({result}) => del(cache.getAbsolutePath(result.filename)))
                    .then(() => doCached(run, defaultOptions))
                    .then(() => run.should.have.been.calledTwice);
            });
        };

        describe('input and output with wildcard', () => {
            runBasicCacheTests(() => defaultOptions);
        });

        describe('input and output as folder names (and strings)', () => {
            runBasicCacheTests(() => _.assign({}, defaultOptions, {
                input:  'test/sample/assets',
                output: 'test/sample/build'
            }));
        });

        describe('no input given', () => {
            runBasicCacheTests(() => _.omit(defaultOptions, 'input'));
        });

        it('should return SavedToCache and RestoredFromCache objects for performance analytics purposes', () => {
            let run = sinon.spy();
            return doCached(run, defaultOptions)
                .then(saved => {
                    saved.should.be.an.instanceof(SavedToCache);
                    saved.should.have.property('operationRuntime').that.is.a('number');
                    saved.should.have.property('storageRuntime').that.is.a('number');
                    saved.should.have.property('result').that.is.an.instanceof(Result);
                })
                .then(() => uncopy())
                .then(() => doCached(run, defaultOptions))
                .then(restored => {
                    restored.should.be.an.instanceof(RestoredFromCache);
                    restored.should.have.property('runtime').that.is.a('number');
                    restored.should.have.property('result').that.is.an.instanceof(Result);
                });
        });

        describe('env input', () => {

            const options = _.assign({}, defaultOptions, {input: ['$SOME_VAR']});

            it('should not run twice if the environment variable does not change', async () => {
                process.env.SOME_VAR = 'foo';
                const spy            = sinon.spy();
                await doCached(spy, options);
                await doCached(spy, options);
                spy.should.have.been.calledOnce;
            });

            it('should run twice if the environment variable changes', async () => {
                process.env.SOME_VAR = 'foo';
                const spy            = sinon.spy();
                await doCached(spy, options);
                process.env.SOME_VAR = 'bar';
                await doCached(spy, options);
                spy.should.have.been.calledTwice;
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

                return doCached(sinon.spy(), defaultOptions)
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

            it('should be fired when running a cacheable operation', async () => {

                cache.on('query', spy);
                await doCached();
                return spy.should.have.been.calledOnce;
            });
        });

        describe('saved', () => {

            it('should have been fired after running a cacheable operation for the first time', async () => {

                cache.on('saved', spy);
                await doCached();
                return spy.should.have.been.calledOnce;
            });

            it('should not fire when running an identical cacheable operation for the second time', async () => {

                await doCached();
                cache.on('saved', spy);
                await doCached();
                return spy.should.not.have.been.called;
            });
        });
    });

    describe('.sync', () => {
        it('should delete the files of expired cache entries', () => {
            let expiresLater       = defaultOptions;
            let expiresImmediately = _.assign({}, defaultOptions, {'ttl': -1, 'action': 'op2'});
            let resultExpiresImmediately, resultExpiresLater;
            return doCached(copy, expiresImmediately)
                .then(r => resultExpiresImmediately = r)
                .then(() => doCached(copy, expiresLater))
                .then(r => resultExpiresLater = r)
                .then(() => cache.sync())
                .then(() => Promise.all([
                    pify(fs.access)(cache.getAbsolutePath(resultExpiresImmediately.result.filename)).should.be.rejected,
                    pify(fs.access)(cache.getAbsolutePath(resultExpiresLater.result.filename)).should.be.fulfilled
                ]))
                .then(shouldHaveNDocs(cache, 1));
        });
    });

    describe('.prepareResult', () => {

        let oci;

        beforeEach(() => {
            oci                 = cache.convertIntent.bind(cache);
            cache.convertIntent = intent => {
                const op       = oci(intent);
                op.getFileHash = sinon.stub().resolves('bar');
                return op;
            };
        });

        afterEach(() => {
            cache.convertIntent = oci;
        });

        it('should prevent hash collisions', async () => {
            // let result1, result2;
            const fakeIntent = new Intent(sinon.stub().resolves(), defaultOptions);
            const result1    = await cache.run(fakeIntent);
            const operation  = cache.convertIntent(fakeIntent);
            const result2    = await (Runner.prepareResult({operation, cache}));
            result1.result.filename.should.not.eql(result2.filename);
        });
    });

    describe('.removeResults', () => {
        it('should remove the given results', () => {
            let results;
            return Promise.all([
                doCached(sinon.spy(), defaultOptions),
                doCached(sinon.spy(), _.assign({}, defaultOptions, {'action': 'op 2'})),
                doCached(sinon.spy(), _.assign({}, defaultOptions, {'action': 'op 3'})),
            ])
                .then(r => {
                    results = _.map(r, 'result');
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
                return doCached(sinon.spy(), defaultOptions)
                    .then(shouldHaveNDocs(cache, 1))
                    .then(() => (new Cache()).sync())
                    .then(newCache => shouldHaveNDocs(newCache, 1)());
            });
            it('should not persist removed entries', () => {
                return Promise.all([
                    doCached(_.noop, defaultOptions),
                    doCached(_.noop, _.assign({}, defaultOptions, {'ttl': -1, 'action': 'op2'})),
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
