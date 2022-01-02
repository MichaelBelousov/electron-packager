'use strict'

const common = require('./common')
const debug = require('debug')('electron-packager')
const junk = require('junk')
const path = require('path')
const prune = require('./prune')
const targets = require('./targets')
const fs = require("fs")

const DEFAULT_IGNORES = [
  '/package-lock\\.json$',
  '/yarn\\.lock$',
  '/\\.git($|/)',
  '/node_modules/\\.bin($|/)',
  '\\.o(bj)?$'
]

function populateIgnoredPaths (opts) {
  opts.originalIgnore = opts.ignore
  if (typeof (opts.ignore) !== 'function') {
    if (opts.ignore) {
      opts.ignore = common.ensureArray(opts.ignore).concat(DEFAULT_IGNORES)
    } else {
      opts.ignore = [].concat(DEFAULT_IGNORES)
    }
    if (process.platform === 'linux') {
      opts.ignore.push(common.baseTempDir(opts))
    }

    debug('Ignored path regular expressions:', opts.ignore)
  }
}

function generateIgnoredOutDirs (opts) {
  const normalizedOut = opts.out ? path.resolve(opts.out) : null
  const ignoredOutDirs = []
  if (normalizedOut === null || normalizedOut === process.cwd()) {
    for (const [platform, archs] of Object.entries(targets.officialPlatformArchCombos)) {
      for (const arch of archs) {
        const basenameOpts = {
          arch: arch,
          name: opts.name,
          platform: platform
        }
        ignoredOutDirs.push(path.join(process.cwd(), common.generateFinalBasename(basenameOpts)))
      }
    }
  } else {
    ignoredOutDirs.push(normalizedOut)
  }

  debug('Ignored paths based on the out param:', ignoredOutDirs)

  return ignoredOutDirs
}

function generateFilterFunction (ignore) {
  if (typeof (ignore) === 'function') {
    return file => !ignore(file)
  } else {
    const ignoredRegexes = common.ensureArray(ignore)

    return function filterByRegexes (file) {
      return !ignoredRegexes.some(regex => file.match(regex))
    }
  }
}

/**
 * get cached pruner since it may have already read a module tree
 * @param {string} dir
 * @returns {prune.Pruner}
 */
function getPruner(dir) {
  if (getPruner.cache === undefined) {
    getPruner.cache = {};
  }
  if (!(dir in getPruner.cache)) {
    getPruner.cache[dir] = new prune.Pruner(dir);
  }
  return getPruner.cache[dir];
}

// this is old and may be removed
async function moduleFilter(pruner) {
  // TODO: try to reuse stats from galactus or node glob
  //const fileStat = await fs.promises.lstat(file);
  //if (fileStat.isSymbolicLink()) file = await fs.promises.readlink(file);
  // TODO: only do this if following symlinks, right?
  let resolvedModulePath = file;
  try {
    // FIXME: weird handling but need to check if there is a symlink in the path, not just the result
    resolvedModulePath = await fs.promises.readlink(file)
    resolvedModulePath = path.resolve(path.dirname(file), resolvedModulePath)
  } catch {
    // FIXME: weird comment: resolving the path is necessary to remove extraneous ending slashes
    resolvedModulePath = path.resolve(file)
  }
  return pruner.pruneModule(resolvedModulePath)
}

function userPathFilter (opts, filterModules = false) {
  const filterFunc = generateFilterFunction(opts.ignore || [])
  const ignoredOutDirs = generateIgnoredOutDirs(opts)
  const pruner = opts.prune ? getPruner(opts.dir) : null

  return async function filter (file) {
    const fullPath = path.resolve(file)

    if (ignoredOutDirs.includes(fullPath)) {
      return false
    }

    if (opts.junk !== false) { // defaults to true
      if (junk.is(path.basename(fullPath))) {
        return false
      }
    }

    return filterFunc(path.relative(opts.dir, fullPath))

    //let name = fullPath.split(path.resolve(opts.dir))[1]

    //if (path.sep === '\\') {
      //name = common.normalizePath(name)
    //}

    //if (filterModules && pruner && name.startsWith('/node_modules/') && await prune.isModule(file)) {
      //return await moduleFilter(pruner);
    //}

    //return filterFunc(name)
  }
}

module.exports = {
  populateIgnoredPaths,
  generateIgnoredOutDirs,
  userPathFilter,
  getPruner,
}
