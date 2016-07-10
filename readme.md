# johnnycache

> Cache file operations

[![Build Status][travis-image]][travis-url]
[![Code Quality][codeclimate-image]][codeclimate-url]
[![Code Coverage][coveralls-image]][coveralls-url]
[![NPM Version][npm-image]][npm-url]

## Install

```
$ npm install --save johnnycache
```


## Usage

```js
const Cache = require('johnnycache');
const exec = require('execa').shell;

let cache = new Cache();

cache.doCached(() => exec('npm install'), {
    input: 'package.json',
    output: 'node_modules'
});

```


## API

### johnnycache([options])

Constructor

#### options

##### workspace

Type: `type`  

Default: `path.join(process.cwd(), '.johnny')`

The path to the cache folder (will be [created](https://github.com/substack/node-mkdirp) if it doesn't exist)

##### maxSize

Type: `string`

Default: `512mb`

The maximum size of the cache folder. Once this is exceeded, existing cached operation results will be intelligently purged based on the time of creation, the filesize, the time it originally took to run the operation, and the degree of redundancy. 
> Note: Expired cache results (based on `ttl`) will always be purged regardless of whether the max cache size is hit.

### johnnycache.doCached(run, options)

#### run

Type: `function`

A function that returns a promise for the file operation's completion. The promise will resolve into an instance of either `SavedToCache`, `RestoredToCache`, or (if the [`awaitStore`](#awaitstore) option is set to false), `StoringResult`.

#### options

##### input

Type: `string|string[]` (optional)

A glob/directory or a mixed array of globs/directories that indicate the files of which the hash should be calculated to check whether there is a cached version of the operation

##### output

Type: `string|string[]`

A glob/directory or a mixed array of globs/directories that indicate the files that are produced as a result of the operation

##### ttl

Type: `number`

Ttl (time-to-live) in milliseconds. If none given, the cache will not expire and will only be purged automatically if the total cache size exceeds the configured maximum.

##### action

Type: `string`

Default: Automatically generated string based on `input` and `output` arguments

Identifier for the operation

##### compress

Type: `boolean`

Default: `false`

Whether to gzip cached files

##### awaitStore

Type: `boolean`

Default: `true`

Whether the returned promise should only resolve once the process is completely finished (safer, but potentially less performant). When set to `false` and some result is saved to the cache, the Promise will resolve to an instance of `StoringResult` as soon as the actual (to-be-cached) operation completed. This object will then have a property `savedToCache`, a promise that will resolve to an instance of `SavedToCache`.

## License

MIT © [JM Versteeg](http://github.com/jmversteeg)

[![dependency Status][david-image]][david-url]
[![devDependency Status][david-dev-image]][david-dev-url]

[travis-image]: https://img.shields.io/travis/jmversteeg/johnnycache.svg?style=flat-square
[travis-url]: https://travis-ci.org/jmversteeg/johnnycache

[codeclimate-image]: https://img.shields.io/codeclimate/github/jmversteeg/johnnycache.svg?style=flat-square
[codeclimate-url]: https://codeclimate.com/github/jmversteeg/johnnycache

[david-image]: https://img.shields.io/david/jmversteeg/johnnycache.svg?style=flat-square
[david-url]: https://david-dm.org/jmversteeg/johnnycache

[david-dev-image]: https://img.shields.io/david/dev/jmversteeg/johnnycache.svg?style=flat-square
[david-dev-url]: https://david-dm.org/jmversteeg/johnnycache#info=devDependencies

[coveralls-image]: https://img.shields.io/coveralls/jmversteeg/johnnycache.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/jmversteeg/johnnycache

[npm-image]: https://img.shields.io/npm/v/johnnycache.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/johnnycache


---

If I could start again 

A million miles away 

I would keep myself 

I would find a way
