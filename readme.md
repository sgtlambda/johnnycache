# johnnycache

> Super simple file operation cache

[![Build Status][travis-image]][travis-url]
[![Code Coverage][coveralls-image]][coveralls-url]
[![NPM Version][npm-image]][npm-url]
[![Required node version][node-image]][node-url]


## Install

```
$ yarn add johnnycache@next
```


## Usage

```js
const Cache = require('johnnycache');
const exec  = require('execa').shell;

const cache = new Cache();

const npmInstall = new Cache.Intent(() => exec('npm install'), {
    input:  ['package.json'],
    output: ['node_modules'],
});

cache.run(npmInstall);

```

## API

### Cache([options])

Constructor

#### options

##### workingDirectory

Type: `string`

Default: `process.cwd()`

Base path for cache `input` and `output` options.

##### workspace

Type: `string`  

Default: `path.join(process.cwd(), '.johnny')`

The path to the cache folder (will be [created](https://github.com/sindresorhus/make-dir) if it doesn't exist)

##### maxSize

Type: `string`

Default: `512mb`

The maximum size of the cache folder. Once this is exceeded, existing cached operation results will be intelligently purged based on the time of creation, the filesize, the time it originally took to run the operation, and the degree of redundancy. 
> Note: Expired cache results (based on `ttl`) will always be purged regardless of whether the max cache size is hit.

### new Cache.Intent(run, options)

Create a new operation intent.

#### run

Type: `function`

A function that returns a promise for the file operation's completion. The promise will resolve into an instance of either `SavedToCache`, `RestoredFromCache`.

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

### Cache.run(intent)

Run the operation, or restore cached results for the operation.

## License

MIT © [sgtlambda](http://github.com/sgtlambda)

[![dependency Status][david-image]][david-url]
[![devDependency Status][david-dev-image]][david-dev-url]

[travis-image]: https://img.shields.io/travis/sgtlambda/johnnycache.svg?style=flat-square
[travis-url]: https://travis-ci.org/sgtlambda/johnnycache

[codeclimate-image]: https://img.shields.io/codeclimate/github/sgtlambda/johnnycache.svg?style=flat-square
[codeclimate-url]: https://codeclimate.com/github/sgtlambda/johnnycache

[david-image]: https://img.shields.io/david/sgtlambda/johnnycache.svg?style=flat-square
[david-url]: https://david-dm.org/sgtlambda/johnnycache

[david-dev-image]: https://img.shields.io/david/dev/sgtlambda/johnnycache.svg?style=flat-square
[david-dev-url]: https://david-dm.org/sgtlambda/johnnycache#info=devDependencies

[coveralls-image]: https://img.shields.io/coveralls/sgtlambda/johnnycache.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/sgtlambda/johnnycache

[npm-image]: https://img.shields.io/npm/v/johnnycache.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/johnnycache

[node-image]: https://img.shields.io/badge/node-%3E=_v7.6-lightgrey.svg?style=flat-square
[node-url]: https://nodejs.org/en/blog/release/v7.6.0/

---

If I could start again 

A million miles away 

I would keep myself 

I would find a way
