import Ember from 'ember';

var get = Ember.get;
var addObserver = Ember.addObserver;
var removeObserver = Ember.removeObserver;
var warn = Ember.warn;
var run = Ember.run;
var once = run.once;
var EmberString = Ember.String;
var camelize = EmberString.camelize;

function EMPTY_CACHE() {
}
function WRONG_BINDING() {
}

var STYLE_BINDING_PROPERTY_REGEXP = /^(([^\?:]+):)?([a-z0-9_\.-]+)(\[([a-z%]+)\])?(\?([a-z0-9_\.\-]*):([a-z0-9_\.\-]*))?$/i;

/**
 * Cache for building bindings
 * @name BINDINGS_CACHE
 * @type Object
 */
var BINDINGS_CACHE = Object.create(null);


/**
 * Flushes the bindings map building cache
 *
 * @method flushBindingsMapCache
 */
export function flushBindingsMapCache() {
  BINDINGS_CACHE = Object.create(null);
}

/**
 * Compute the style property given its css property name, value and unit
 *
 * @param {String} cssProp
 * @param {*} value
 * @param {Object} [yesNo]
 * @param {String} [unit]
 * @returns {String}
 */
function computeStyleProperty(cssProp, value, yesNo, unit) {
  if (yesNo) {
    if (value) {
      value = yesNo.yes;
    }
    else {
      value = yesNo.no;
    }
  }
  if (value !== undefined && value !== null && value !== '') {
    value = '' + value;
    unit = (unit && value !== '0' && !isNaN(value)) ? unit : '';
    return cssProp + ': ' + value + unit + ';';
  }
  else {
    return null;
  }
}

/**
 * Given a string or an array, returns a clean array of bindings
 *
 * @method cleanupBindings
 * @param {String|Array} bindings
 * @returns {Array}
 */
function cleanupBindings(bindings) {
  var cleanBindings = typeof(bindings) === 'string' ? [bindings] : bindings;
  cleanBindings = cleanBindings.join(' ').split(/\s+/g);
  if (cleanBindings.length === 1 && cleanBindings[0] === '') {
    cleanBindings = [];
  }
  return cleanBindings;
}


/**
 * Handles style bindings dependent on properties of a given target
 *
 * @class StyleBindingsMeta
 * @param {Ember.Object} target
 * @param {Array} [bindings]
 * @constructor
 */
function StyleBindingsMeta(target, bindings) {
  this.dependencyMap = null;
  this.map = null;
  this.bindings = bindings ? cleanupBindings(bindings) : null;
  this.cachedStyle = EMPTY_CACHE;
  this.target = target;
  this.listeners = [];
}

/**
 * Free memory related to this object and freeze the object if possible
 *
 * @method destroy
 */
StyleBindingsMeta.prototype.destroy = function () {
  this.stopObserving();
  delete this.dependencyMap;
  delete this.map;
  delete this.bindings;
  delete this.cachedStyle;
  delete this.target;
  delete this.listeners;
  if (Object.freeze) {
    Object.freeze(this);
  }
};

/**
 * Add a listener which gonna be called when the style changes
 * The context of the listener will be the target
 *
 * @method addListener
 * @param {Function|String} listener
 */
StyleBindingsMeta.prototype.addListener = function (listener) {
  if (typeof listener === 'string') {
    listener = get(this.target, listener);
  }
  if (this.listeners.indexOf(listener) < 0) {
    this.listeners.push(listener);
  }
};

/**
 * Removes a listener
 *
 * @method removeListener
 * @param {String|Function} listener
 */
StyleBindingsMeta.prototype.removeListener = function (listener) {
  var index;
  if (typeof listener === 'string') {
    listener = get(this.target, listener);
  }
  if ((index = this.listeners.indexOf(listener)) >= 0) {
    this.listeners.splice(index, 1);
  }
};

/**
 * Updates the bindings definition
 *
 * @method setBindings
 * @param {Array<String>} bindings
 */
StyleBindingsMeta.prototype.setBindings = function (bindings) {
  bindings = cleanupBindings(bindings);
  if (this.bindings && bindings.join(' ') === this.bindings.join(' ')) {
    return;
  }
  this.stopObserving();
  this.dependencyMap = null;
  this.map = null;
  this.bindings = bindings;
  this.cachedStyle = EMPTY_CACHE;
};

/**
 * Get the css property mapping, computing it if necessary
 *
 * @method getMap
 * @returns {Object}
 */
StyleBindingsMeta.prototype.getMap = function () {
  if (!this.map) {
    this.buildMaps();
  }
  return this.map;
};

/**
 * Get the target property mapping, computing it if necessary
 *
 * @method getDependencyMap
 * @returns {Object}
 */
StyleBindingsMeta.prototype.getDependencyMap = function () {
  if (!this.dependencyMap) {
    this.buildMaps();
  }
  return this.dependencyMap;
};

/**
 * Builds the property map and dependency map
 *
 * @method buildMaps
 */
StyleBindingsMeta.prototype.buildMaps = function () {
  var map = this.map = Object.create(null);
  var dependencyMap = this.dependencyMap = Object.create(null);
  var bindings = this.bindings;
  var match, cssProp, emberProp, unit, binding, meta, cache, dep;
  // loop on all bindings, try to get them from the cache if it exists
  for (var i = 0; i < bindings.length; i++) {
    binding = bindings[i];
    // we got a match in the bindings cache
    if ((match = BINDINGS_CACHE[binding])) {
      // if it is a valid binding, use it
      if (match !== WRONG_BINDING) {
        cssProp = match.cssProp;
        map[cssProp] = meta = Object.create(null);
        meta.property = match.property;
        meta.unit = match.unit;
        meta.yesNo = match.yesNo;
        meta.cache = EMPTY_CACHE;
      }
    }
    // try to parse the binding
    else if ((match = binding.match(STYLE_BINDING_PROPERTY_REGEXP))) {
      cssProp = match[3];
      emberProp = match[2] || camelize(cssProp);
      unit = match[5];
      map[cssProp] = meta = Object.create(null);
      meta.property = emberProp;
      meta.unit = unit;
      meta.cache = EMPTY_CACHE;
      if (match[6]) {
        meta.yesNo = Object.create(null);
        meta.yesNo.yes = match[7];
        meta.yesNo.no = match[8];
      }
      // cache the binding
      BINDINGS_CACHE[binding] = cache = Object.create(null);
      cache.property = emberProp;
      cache.unit = unit;
      cache.cssProp = cssProp;
      cache.yesNo = meta.yesNo;
    }
    // without match, save it in the bindings cache to avoid re-computing later
    else {
      BINDINGS_CACHE[binding] = WRONG_BINDING;
      warn('[with-style-mixin] Invalid binding: `' + binding + '`');
    }
    // populate the dependency map
    if (meta) {
      if (!(dep = dependencyMap[meta.property])) {
        dependencyMap[meta.property] = dep = [];
      }
      dep.push(cssProp);
    }
    cache = meta = undefined;
  }
};

/**
 * Get the css style source, computed it if not in cache
 *
 * @method getStyle
 * @returns {String}
 */
StyleBindingsMeta.prototype.getStyle = function () {
  var buffer, val, map;
  if (this.cachedStyle !== EMPTY_CACHE) {
    return this.cachedStyle;
  }
  buffer = '';
  map = this.getMap();
  for (var cssProp in map) {
    // get from the cache, and compute the value if the cache is an empty entry
    if ((val = map[cssProp].cache) === EMPTY_CACHE) {
      val = map[cssProp].cache = computeStyleProperty(
        cssProp,
        get(this.target, map[cssProp].property),
        map[cssProp].yesNo,
        map[cssProp].unit
      );
    }
    if (val !== null) {
      buffer += buffer ? ' ' + val : val;
    }
  }
  return (this.cachedStyle = buffer);
};

/**
 * Called when a property is changed to clear the cache of dependent css properties
 *
 * @method propertyDidChange
 * @param {Ember.Object} target
 * @param {String} property
 */
StyleBindingsMeta.prototype.propertyDidChange = function (target, property) {
  var cssProps = this.getDependencyMap()[property];
  for (var i = 0; i < cssProps.length; i++) {
    this.map[cssProps[i]].cache = EMPTY_CACHE;
  }
  this.cachedStyle = EMPTY_CACHE;
  if (this.listeners.length) {
    once(this, 'styleDidChange');
  }
};

/**
 * Called when the style has been changed. Will call all listeners if any defined
 *
 * @method styleDidChange
 */
StyleBindingsMeta.prototype.styleDidChange = function () {
  for (var i = 0; i < this.listeners.length; i++) {
    this.listeners[i].call(this.target, this);
  }
};

/**
 * Start observing the target for changes on properties it depends on
 *
 * @method startObserving
 */
StyleBindingsMeta.prototype.startObserving = function () {
  var dependencyMap = this.getDependencyMap();
  for (var property in dependencyMap) {
    addObserver(this.target, property, this, 'propertyDidChange');
  }
};

/**
 * Stop observing for property changes
 *
 * @method stopObserving
 */
StyleBindingsMeta.prototype.stopObserving = function () {
  if (!this.dependencyMap) {
    return;
  }
  for (var property in this.dependencyMap) {
    removeObserver(this.target, property, this, 'propertyDidChange');
  }
};

export default StyleBindingsMeta;
