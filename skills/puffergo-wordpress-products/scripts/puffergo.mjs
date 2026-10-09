#!/usr/bin/env node
import{createRequire}from'module';const require=createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = Symbol.for("yaml.alias");
    var DOC = Symbol.for("yaml.document");
    var MAP = Symbol.for("yaml.map");
    var PAIR = Symbol.for("yaml.pair");
    var SCALAR = Symbol.for("yaml.scalar");
    var SEQ = Symbol.for("yaml.seq");
    var NODE_TYPE = Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag2) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag2.startsWith(prefix))
            return handle + escapeTagName(tag2.substring(prefix.length));
        }
        return tag2[0] === "!" ? tag2 : `!<${tag2}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode2(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode2;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode2 = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode2.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag2) => tag2.default && tag2.tag !== "tag:yaml.org,2002:str" && tag2.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options2) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options2);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag2 = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag2)
        props.push(doc.directives.tagString(tag2));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag2) => tag2.tag === merge.tag && tag2.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log2 = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log2.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode2 = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode2.createNode(key, void 0, ctx);
      const v = createNode2.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options2) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options2);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode2 = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode2.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag: tag2, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag2 || tag2 === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag2 of customTags)
          tags = tags.concat(tag2);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag2) => {
        const tagObj = typeof tag2 === "string" ? tagsByName[tag2] : tag2;
        if (!tagObj) {
          const tagName = JSON.stringify(tag2);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options2) {
      const lines = [];
      let hasDirectives = options2.directives === true;
      if (options2.directives !== false && doc.directives) {
        const dir2 = doc.directives.toString(doc);
        if (dir2) {
          lines.push(dir2);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options2);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode2 = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options2) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options2 === void 0 && replacer) {
          options2 = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options2);
        this.options = opt;
        let { version } = opt;
        if (options2?._directives) {
          this.directives = options2._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options2);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options2);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options2) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options2 === void 0 && replacer) {
          options2 = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag: tag2 } = options2 ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode2.createNode(value, tag2, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options2 = {}) {
        const k = this.createNode(key, null, options2);
        const v = this.createNode(value, null, options2);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options2 = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options2.schema instanceof Object)
          this.schema = options2.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options2));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options2 = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options2 && (!Number.isInteger(options2.indent) || Number(options2.indent) <= 0)) {
          const s = JSON.stringify(options2.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options2);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag2 = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag2)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag2)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag2 = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag2)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag: tag2,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag2) {
      const NodeClass = tag2?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag2) {
      const NodeClass = tag2?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag2) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag2?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag2) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag2) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag2) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag2);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag2 = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag2) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag2 = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag2);
      const res = tag2.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag2?.format)
        node.format = tag2.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line = /(.*?)\r?\n/sy;
      let match = line.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep = " ";
      let pos = line.lastIndex;
      while (match = line.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + lm;
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag2;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag2 = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag2 = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag2 = findScalarTagByTest(ctx, value, token, onError);
      else
        tag2 = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag2.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag2.format)
        scalar.format = tag2.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag2 of schema.tags) {
        if (!tag2.collection && tag2.tag === tagName) {
          if (tag2.default && tag2.test)
            matchWithTest.push(tag2);
          else
            return tag2;
        }
      }
      for (const tag2 of matchWithTest)
        if (tag2.test?.test(value))
          return tag2;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag2 = schema.tags.find((tag3) => (tag3.default === true || atKey && tag3.default === "key") && tag3.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag3) => tag3.default && tag3.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag2.tag !== compat.tag) {
          const ts = directives.tagString(tag2.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag2;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag: tag2 } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag2)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag2, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag2 ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag: tag2, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag2, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options: options2 }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options2.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options2, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options2);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options2 = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options2.version || "1.2" });
        this.options = options2;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer2 = require_lexer();
    function includesToken(list2, type) {
      for (let i = 0; i < list2.length; ++i)
        if (list2[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list2) {
      for (let i = 0; i < list2.length; ++i) {
        switch (list2[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer2.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log2 = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser2 = require_parser();
    function parseOptions(options2) {
      const prettyErrors = options2.prettyErrors !== false;
      const lineCounter$1 = options2.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options2 = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options2);
      const parser$1 = new parser2.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options2);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options2 = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options2);
      const parser$1 = new parser2.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options2);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse2(src, reviver, options2) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options2 === void 0 && reviver && typeof reviver === "object") {
        options2 = reviver;
      }
      const doc = parseDocument(src, options2);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log2.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options2));
    }
    function stringify(value, replacer, options2) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options2 === void 0 && replacer) {
        options2 = replacer;
      }
      if (typeof options2 === "string")
        options2 = options2.length;
      if (typeof options2 === "number") {
        const indent = Math.round(options2);
        options2 = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options2 ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options2);
      return new Document.Document(value, _replacer, options2).toString(options2);
    }
    exports.parse = parse2;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer2 = require_lexer();
    var lineCounter = require_line_counter();
    var parser2 = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer2.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser2.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// packages/cli/src/authorize/wp-authorize-protocol.ts
function buildAuthorizeUrl(siteUrl, successUrl, appName = "PufferGo") {
  const base = siteUrl.trim().replace(/\/+$/, "");
  return `${base}/wp-admin/authorize-application.php?app_name=${encodeURIComponent(appName)}&success_url=${encodeURIComponent(successUrl)}`;
}
function parseAuthorizeReturn(params) {
  if (params.get("success") === "false") return null;
  const appPassword = params.get("password") ?? "";
  if (!appPassword) return null;
  return { username: params.get("user_login") ?? "", appPassword };
}
var init_wp_authorize_protocol = __esm({
  "packages/cli/src/authorize/wp-authorize-protocol.ts"() {
    "use strict";
  }
});

// packages/cli/src/authorize/authorize-server.ts
var authorize_server_exports = {};
__export(authorize_server_exports, {
  runAuthorizeServer: () => runAuthorizeServer
});
import * as http from "node:http";
function isCallbackRequest(params) {
  return params.has("password") || params.get("success") === "false";
}
function runAuthorizeServer(siteUrl, onListening, opts = {}) {
  const {
    appName = "PufferGo",
    timeoutMs = 5 * 60 * 1e3,
    port = 0,
    resultPage = DEFAULT_RESULT_PAGE,
    onTimeout,
    signal
  } = opts;
  return new Promise((resolve10, reject) => {
    let settled = false;
    let timer;
    let active;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      active?.close();
      resolve10(value);
    };
    timer = setTimeout(() => {
      onTimeout?.();
      finish(null);
    }, timeoutMs);
    signal?.addEventListener("abort", () => finish(null), { once: true });
    const start = (bindPort) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (!isCallbackRequest(url.searchParams)) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("not found");
          return;
        }
        const creds = parseAuthorizeReturn(url.searchParams);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(resultPage(!!creds));
        finish(creds);
      });
      active = server;
      server.on("error", (err) => {
        if (err.code === "EADDRINUSE" && bindPort !== 0) {
          start(0);
          return;
        }
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        reject(err);
      });
      server.listen(bindPort, "127.0.0.1", () => {
        const { port: bound } = server.address();
        onListening(buildAuthorizeUrl(siteUrl, `http://127.0.0.1:${bound}/`, appName), bound);
      });
    };
    if (signal?.aborted) finish(null);
    else start(port);
  });
}
var DEFAULT_RESULT_PAGE;
var init_authorize_server = __esm({
  "packages/cli/src/authorize/authorize-server.ts"() {
    "use strict";
    init_wp_authorize_protocol();
    DEFAULT_RESULT_PAGE = (ok) => `<!doctype html><html><head><meta charset="utf-8"><title>PufferGo</title>
<style>html{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2430;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f7fb}
div{text-align:center}</style></head><body><div>${ok ? "\u2705 \u5DF2\u6388\u6743\u3002" : "\u274C \u672A\u83B7\u53D6\u5230\u5E94\u7528\u5BC6\u7801\u3002"}<br><small style="color:#888">\u8FD9\u4E2A\u9875\u9762\u53EF\u4EE5\u5173\u95ED\u4E86\u3002</small></div></body></html>`;
  }
});

// packages/cli/src/index.ts
import { readFile as readFile17 } from "node:fs/promises";

// packages/silo-core/lib/model/types.ts
var SILO_WORKSPACE_VERSION = 3;
var LOCAL_SITE_KEY = "__local__";

// packages/silo-core/lib/model/factory.ts
var newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
var emptySeo = () => ({ title: "", description: "", coreKeywords: [], longTailKeywords: [] });
var emptyWorkspace = (profile) => ({
  version: SILO_WORKSPACE_VERSION,
  profile,
  nodes: [],
  contents: [],
  edges: [],
  keywords: []
});
var createNode = (term, kind, parentId, extra) => ({
  id: newId("n"),
  term,
  kind,
  parentId,
  wpCategoryId: null,
  ...extra
});
var createContent = (siloNodeId, title, postType = "post", extra) => ({
  id: newId("c"),
  siloNodeId,
  postType,
  title,
  seo: emptySeo(),
  wpPostId: null,
  seoSyncedAt: null,
  lastModifiedRemote: null,
  ...extra
});

// packages/silo-core/lib/model/keywords.ts
var normalizeTerm = (t) => t.trim().toLowerCase();
var seoTerms = (seo) => [...seo.coreKeywords, ...seo.longTailKeywords].map((s) => s.trim()).filter(Boolean);
function usageIndex(ws) {
  const idx = /* @__PURE__ */ new Map();
  const touch = (term, isCloud) => {
    const key = normalizeTerm(term);
    if (!key) return;
    const u = idx.get(key) ?? { display: term.trim(), cloud: false, local: false };
    if (isCloud) u.cloud = true;
    else u.local = true;
    idx.set(key, u);
  };
  for (const c of ws.contents) {
    const isCloud = c.wpPostId != null;
    for (const t of seoTerms(c.seo)) touch(t, isCloud);
  }
  for (const n of ws.nodes) {
    if (n.system || !n.seo) continue;
    const isCloud = n.wpCategoryId != null;
    for (const t of seoTerms(n.seo)) touch(t, isCloud);
  }
  return idx;
}
var asSource = (cloud, local) => cloud && local ? "both" : cloud ? "cloud" : "local";
var mergeSource = (prior, u) => asSource(prior === "cloud" || prior === "both" || u.cloud, prior === "local" || prior === "both" || u.local);
function reconcileKeywords(ws) {
  const usage = usageIndex(ws);
  const existing = ws.keywords ?? [];
  const byKey = /* @__PURE__ */ new Map();
  for (const k of existing) {
    const key = normalizeTerm(k.term);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, { ...k });
  }
  for (const [key, ent] of byKey) {
    const u = usage.get(key);
    if (u) ent.source = mergeSource(ent.source, u);
  }
  for (const [key, u] of usage) {
    if (byKey.has(key)) continue;
    byKey.set(key, { id: newId("k"), term: u.display, source: asSource(u.cloud, u.local) });
  }
  return Array.from(byKey.values());
}

// packages/silo-core/lib/model/migrate.ts
var sanitizeKey = (host) => host.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "");
function siteKey(url) {
  const raw = (url ?? "").trim();
  if (!raw) return LOCAL_SITE_KEY;
  try {
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).host.toLowerCase();
    return sanitizeKey(host.replace(/^www\./, "")) || LOCAL_SITE_KEY;
  } catch {
    return sanitizeKey(raw.toLowerCase().replace(/^www\./, "")) || LOCAL_SITE_KEY;
  }
}

// packages/silo-core/lib/wp/parse-links.ts
var canonicalHost = (url, base) => {
  try {
    return new URL(url, base).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};
var isFallbackPermalink = (url, base) => {
  try {
    const u = new URL(url, base);
    if (u.pathname.replace(/\/+$/, "") !== "") return false;
    return u.searchParams.has("page_id") || u.searchParams.has("p");
  } catch {
    return false;
  }
};
var PREVIEW_PARAMS = ["preview", "preview_id", "preview_nonce", "_ppp"];
var canonicalPostLink = (link2) => {
  try {
    const u = new URL(link2);
    let preview = false;
    for (const param of PREVIEW_PARAMS) {
      if (u.searchParams.has(param)) {
        u.searchParams.delete(param);
        preview = true;
      }
    }
    return preview ? u.toString() : link2;
  } catch {
    return link2;
  }
};
var NOFOLLOW = /\bnofollow\b/i;
var NON_MARKUP_RE = /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
var maskNonMarkup = (html2) => html2.replace(NON_MARKUP_RE, (m) => {
  const open = m.indexOf(">") + 1;
  const close = m.lastIndexOf("</");
  return m.slice(0, open) + " ".repeat(close - open) + m.slice(close);
});
var REGION_RE = /<(header|nav|footer)\b[^>]*>|<\/(header|nav|footer)\s*>|<(?:div|section)\b[^>]*\bid\s*=\s*["'](masthead|colophon|site-header|site-footer)["'][^>]*>/gi;
function templateRegions(html2) {
  const regions = [];
  const open = [];
  for (const m of html2.matchAll(REGION_RE)) {
    const [tag2, openName, closeName, idName] = m;
    const at = m.index ?? 0;
    if (openName) {
      const name = openName.toLowerCase();
      const top = open[open.length - 1];
      if (top && top.name === name) {
        top.depth++;
        continue;
      }
      if (open.length) continue;
      open.push({ name, start: at, placement: name === "footer" ? "footer" : "nav", depth: 1 });
    } else if (closeName) {
      const name = closeName.toLowerCase();
      const top = open[open.length - 1];
      if (!top || top.name !== name) continue;
      if (--top.depth > 0) continue;
      open.pop();
      regions.push({ start: top.start, end: at + tag2.length, placement: top.placement });
    } else if (idName && !open.length) {
      const id = idName.toLowerCase();
      regions.push({
        start: at,
        // Closed later by the next region's start; provisionally runs to end of document.
        end: html2.length,
        placement: id === "colophon" || id === "site-footer" ? "footer" : "nav"
      });
    }
  }
  for (const o of open) regions.push({ start: o.start, end: html2.length, placement: o.placement });
  regions.sort((a, b) => a.start - b.start);
  for (let i = 0; i < regions.length - 1; i++) {
    if (regions[i].end > regions[i + 1].start) regions[i].end = Math.min(regions[i].end, regions[i + 1].start);
  }
  return regions;
}
var placementAt = (regions, at) => regions.find((r) => at >= r.start && at < r.end)?.placement ?? "body";
var ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
var attr = (tag2, name) => tag2.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2).find((v) => v !== void 0);
var stripTags = (s) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function parseLinks(rawHtml, siteUrl, postUrl) {
  const siteHost = canonicalHost(siteUrl);
  const base = postUrl || siteUrl;
  const internal = [];
  const external = [];
  const html2 = maskNonMarkup(rawHtml);
  const regions = templateRegions(html2);
  for (const m of html2.matchAll(ANCHOR_RE)) {
    const [, tag2, inner] = m;
    const href = (attr(tag2, "href") ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    const host = canonicalHost(href, base);
    let url = null;
    try {
      url = new URL(href, base).toString();
    } catch {
      url = null;
    }
    const link2 = {
      href,
      url,
      anchor: stripTags(inner),
      dofollow: !NOFOLLOW.test(attr(tag2, "rel") ?? ""),
      placement: placementAt(regions, m.index ?? 0)
    };
    if (host && siteHost && host === siteHost) internal.push(link2);
    else external.push(link2);
  }
  return { internal, external };
}

// packages/silo-core/lib/model/graph.ts
var GRAPH_ROOT_ID = "__root__";
var pathKey = (u) => {
  if (!u) return "";
  try {
    const url = new URL(u);
    return `${url.host.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return "";
  }
};
var extId = (url) => `ext:${url}`;
function linkGraph(ws) {
  const nodeById = new Map(ws.nodes.map((n) => [n.id, n]));
  const pillarOf = (nodeId) => {
    let cur = nodeId ? nodeById.get(nodeId) : void 0;
    if (!cur) return null;
    const seen = /* @__PURE__ */ new Set();
    while (cur.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const p = nodeById.get(cur.parentId);
      if (!p) break;
      cur = p;
    }
    return cur.id;
  };
  const contentIds = new Set(ws.contents.map((c) => c.id));
  const keywordNodeIds = new Set(ws.nodes.map((n) => n.id));
  const linkTargetIds = /* @__PURE__ */ new Set([...contentIds, ...keywordNodeIds]);
  const internalEdges = [];
  const externalEdges = [];
  const seenInternal = /* @__PURE__ */ new Set();
  const seenExternal = /* @__PURE__ */ new Set();
  for (const e of ws.edges) {
    if (e.type === "internal-link") {
      if (e.from === e.to || !contentIds.has(e.from) || !linkTargetIds.has(e.to)) continue;
      const k = `${e.from}\0${e.to}`;
      if (seenInternal.has(k)) continue;
      seenInternal.add(k);
      internalEdges.push({ from: e.from, to: e.to, dofollow: e.dofollow, placement: e.placement });
    } else if (e.type === "external-link") {
      if (!contentIds.has(e.from)) continue;
      const k = `${e.from}\0${e.to}`;
      if (seenExternal.has(k)) continue;
      seenExternal.add(k);
      externalEdges.push({ from: e.from, to: e.to, dofollow: e.dofollow, placement: e.placement });
    }
  }
  const inbound = /* @__PURE__ */ new Map();
  const outbound = /* @__PURE__ */ new Map();
  for (const e of internalEdges) {
    outbound.set(e.from, (outbound.get(e.from) ?? 0) + 1);
    inbound.set(e.to, (inbound.get(e.to) ?? 0) + 1);
  }
  const nodes = [];
  const homeKey = pathKey(ws.profile.url);
  const homeContent = homeKey ? ws.contents.find((c) => c.wpLink && !isFallbackPermalink(c.wpLink) && pathKey(c.wpLink) === homeKey) : void 0;
  const rootId = homeContent?.id ?? GRAPH_ROOT_ID;
  if (!homeContent) {
    nodes.push({
      id: GRAPH_ROOT_ID,
      label: ws.profile.name || "\u7AD9\u70B9\u5B9A\u4F4D",
      type: "root",
      pillarId: null,
      inboundInternal: 0,
      outboundInternal: 0,
      orphan: false
    });
  }
  for (const n of ws.nodes) {
    nodes.push({
      id: n.id,
      label: n.term,
      type: n.parentId ? "cluster" : "pillar",
      pillarId: pillarOf(n.id),
      // A section archive can genuinely receive internal links (menus point at it constantly), so this
      // is a real tally, not a placeholder. It never links OUT — the archive body isn't authored here.
      inboundInternal: inbound.get(n.id) ?? 0,
      outboundInternal: 0,
      // Only pages can be orphans; a structural node with no links is normal, not a defect.
      orphan: false
    });
  }
  for (const c of ws.contents) {
    const inn = inbound.get(c.id) ?? 0;
    const out = outbound.get(c.id) ?? 0;
    const isHome = c.id === homeContent?.id;
    nodes.push({
      id: c.id,
      label: c.title,
      type: "content",
      pillarId: pillarOf(c.siloNodeId),
      inboundInternal: inn,
      outboundInternal: out,
      // The homepage is never an orphan even with no internal links — it is reached directly.
      orphan: inn === 0 && out === 0 && !isHome,
      ...isHome ? { isHome: true } : {}
    });
  }
  const edges = [];
  const internalPairs = new Set(internalEdges.map((e) => `${e.from}\0${e.to}`));
  for (const n of ws.nodes) {
    const parent = n.parentId ?? rootId;
    if (internalPairs.has(`${parent}\0${n.id}`)) continue;
    edges.push({ id: `bb:${parent}->${n.id}`, source: parent, target: n.id, type: "backbone" });
  }
  for (const c of ws.contents) {
    if (c.id === rootId) continue;
    if (internalPairs.has(`${c.siloNodeId}\0${c.id}`)) continue;
    if (nodeById.has(c.siloNodeId)) {
      edges.push({ id: `bb:${c.siloNodeId}->${c.id}`, source: c.siloNodeId, target: c.id, type: "backbone" });
    }
  }
  for (const e of internalEdges) {
    edges.push({
      id: `in:${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: "internal",
      dofollow: e.dofollow,
      placement: e.placement
    });
  }
  const externalNodeSeen = /* @__PURE__ */ new Set();
  for (const e of externalEdges) {
    const target = extId(e.to);
    if (!externalNodeSeen.has(e.to)) {
      externalNodeSeen.add(e.to);
      let host = e.to;
      try {
        host = new URL(e.to).host;
      } catch {
      }
      nodes.push({
        id: target,
        label: host,
        type: "external",
        pillarId: null,
        inboundInternal: 0,
        outboundInternal: 0,
        orphan: false
      });
    }
    edges.push({
      id: `ex:${e.from}->${e.to}`,
      source: e.from,
      target,
      type: "external",
      dofollow: e.dofollow,
      placement: e.placement
    });
  }
  return { nodes, edges };
}
function keywordOverlay(ws) {
  const coreItems = /* @__PURE__ */ new Map();
  const used = /* @__PURE__ */ new Set();
  const primaryFocusById = {};
  const seenPair = /* @__PURE__ */ new Set();
  const addCore = (term, id) => {
    const key = normalizeTerm(term);
    if (!key) return;
    const pairKey = `${key}\0${id}`;
    if (seenPair.has(pairKey)) return;
    seenPair.add(pairKey);
    const e = coreItems.get(key) ?? { display: term.trim(), ids: [] };
    e.ids.push(id);
    coreItems.set(key, e);
  };
  const markUsed = (term) => {
    const key = normalizeTerm(term);
    if (key) used.add(key);
  };
  for (const c of ws.contents) {
    c.seo.coreKeywords.forEach((k) => {
      addCore(k, c.id);
      markUsed(k);
    });
    c.seo.longTailKeywords.forEach(markUsed);
    const primary = c.seo.coreKeywords.find((k) => k.trim());
    if (primary) primaryFocusById[c.id] = primary.trim();
  }
  for (const n of ws.nodes) {
    if (n.system || !n.seo) continue;
    n.seo.coreKeywords.forEach((k) => {
      addCore(k, n.id);
      markUsed(k);
    });
    n.seo.longTailKeywords.forEach(markUsed);
    const primary = n.seo.coreKeywords.find((k) => k.trim());
    if (primary) primaryFocusById[n.id] = primary.trim();
  }
  const cannibalIds = /* @__PURE__ */ new Set();
  const cannibalEdges = [];
  for (const [, { display, ids }] of coreItems) {
    if (ids.length < 2) continue;
    ids.forEach((id) => cannibalIds.add(id));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        cannibalEdges.push({
          id: `cn:${ids[i]}->${ids[j]}:${normalizeTerm(display)}`,
          source: ids[i],
          target: ids[j],
          term: display
        });
      }
    }
  }
  const gaps = (ws.keywords ?? []).filter((k) => !used.has(normalizeTerm(k.term))).map((k) => ({ term: k.term }));
  return { primaryFocusById, cannibalIds: Array.from(cannibalIds), cannibalEdges, gaps };
}

// packages/silo-core/lib/model/seo-limits.ts
var TITLE_MIN = 30;
var TITLE_MAX = 60;
var DESC_MIN = 120;
var DESC_MAX = 160;
var CORE_KEYWORDS_MAX = 1;
var LONGTAIL_KEYWORDS_MAX = 5;
var FOCUS_KEYWORDS_MAX = CORE_KEYWORDS_MAX + LONGTAIL_KEYWORDS_MAX;
function applySeoLimits(l) {
  if (!l) return;
  [TITLE_MIN, TITLE_MAX] = l.titleRecommended;
  [DESC_MIN, DESC_MAX] = l.descriptionRecommended;
  CORE_KEYWORDS_MAX = l.coreKeywordsMax;
  LONGTAIL_KEYWORDS_MAX = l.longTailKeywordsMax;
  FOCUS_KEYWORDS_MAX = CORE_KEYWORDS_MAX + LONGTAIL_KEYWORDS_MAX;
}
var WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|[\u{20000}-\u{3FFFD}]/u;
function seoWidth(text) {
  let width = 0;
  for (const ch of text.trim()) width += WIDE.test(ch) ? 2 : 1;
  return width;
}
function widthRange(min, max) {
  return `${min}\u2013${max}\uFF08\u4E2D\u6587\u7EA6 ${Math.floor(min / 2)}\u2013${Math.floor(max / 2)} \u5B57\uFF09`;
}

// packages/silo-core/lib/model/health.ts
var SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
var STALE_DRAFT_DAYS = 30;
var isBlank = (s) => !s || !s.trim();
function healthCheck(ws) {
  applySeoLimits(ws.seoLimits);
  const issues = [];
  const graph = linkGraph(ws);
  const overlay = keywordOverlay(ws);
  const graphNodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const cannibalByTerm = /* @__PURE__ */ new Map();
  for (const e of overlay.cannibalEdges) {
    const key = normalizeTerm(e.term);
    const set = cannibalByTerm.get(key) ?? /* @__PURE__ */ new Set();
    set.add(e.source);
    set.add(e.target);
    cannibalByTerm.set(key, set);
  }
  for (const e of overlay.cannibalEdges) {
    const key = normalizeTerm(e.term);
    const set = cannibalByTerm.get(key);
    if (!set) continue;
    cannibalByTerm.delete(key);
    const ids = [...set];
    issues.push({
      id: `cannibalization:${key}`,
      code: "cannibalization",
      severity: "critical",
      title: `\u5173\u952E\u8BCD\u81EA\u566C\uFF1A${ids.length} \u9875\u4E89\u62A2\u300C${e.term}\u300D`,
      detail: `${ids.length} \u4E2A\u9875\u9762\u628A\u300C${e.term}\u300D\u8BBE\u4E3A\u6838\u5FC3\u5173\u952E\u8BCD\uFF0C\u6392\u540D\u4F1A\u4E92\u76F8\u7A00\u91CA\u3002\u4FDD\u7559\u6700\u5339\u914D\u7684\u4E00\u9875\u505A\u6838\u5FC3\u5173\u952E\u8BCD\uFF0C\u5176\u4F59\u964D\u4E3A\u957F\u5C3E\u5173\u952E\u8BCD\u6216\u6539\u7528\u76F8\u8FD1\u7684\u8BCD\u3002`,
      nodeIds: ids,
      term: e.term
    });
  }
  for (const c of ws.contents) {
    const label = c.title || "\uFF08\u672A\u547D\u540D\u5185\u5BB9\uFF09";
    const node = graphNodeById.get(c.id);
    const primary = c.seo.coreKeywords.find((k) => k.trim())?.trim();
    if (node?.orphan) {
      issues.push({
        id: `orphan:${c.id}`,
        code: "orphan",
        severity: "critical",
        title: `\u5B64\u5C9B\u9875\uFF1A${label}`,
        detail: "\u8FD9\u4E2A\u9875\u9762\u6CA1\u6709\u4EFB\u4F55\u5185\u94FE\u8FDB\u51FA\uFF0C\u641C\u7D22\u5F15\u64CE\u548C\u8BFB\u8005\u90FD\u5F88\u96BE\u5230\u8FBE\u3002\u81F3\u5C11\u52A0 1 \u6761\u8FDB\u94FE\u548C 1 \u6761\u51FA\u94FE\uFF0C\u628A\u5B83\u63A5\u5165\u6240\u5C5E\u652F\u67F1\u3002",
        nodeIds: [c.id]
      });
    }
    if (!primary) {
      issues.push({
        id: `no-focus:${c.id}`,
        code: "no-focus",
        severity: "critical",
        title: `\u672A\u8BBE\u6838\u5FC3\u5173\u952E\u8BCD\uFF1A${label}`,
        detail: "\u6CA1\u6709\u6838\u5FC3\u5173\u952E\u8BCD\uFF0C\u7B49\u4E8E\u6CA1\u544A\u8BC9\u641C\u7D22\u5F15\u64CE\u8FD9\u9875\u8981\u6392\u4EC0\u4E48\u3002\u5230 SEO \u91CC\u8865\u4E00\u4E2A\u6838\u5FC3\u5173\u952E\u8BCD\u3002",
        nodeIds: [c.id]
      });
    }
    if (isBlank(c.seo.title)) {
      issues.push({
        id: `missing-seo-title:${c.id}`,
        code: "missing-seo-title",
        severity: "warning",
        title: `\u7F3A SEO \u6807\u9898\uFF1A${label}`,
        detail: "\u6807\u9898\u4E3A\u7A7A\uFF0CGoogle \u4F1A\u81EA\u884C\u62FC\u51D1\uFF0C\u6392\u540D\u548C\u70B9\u51FB\u90FD\u53D7\u635F\u3002\u8865\u4E00\u4E2A\u542B\u6838\u5FC3\u5173\u952E\u8BCD\u3001\u226460 \u5B57\u7B26\u7684\u6807\u9898\u3002",
        nodeIds: [c.id]
      });
    }
    if (isBlank(c.seo.description)) {
      issues.push({
        id: `missing-seo-desc:${c.id}`,
        code: "missing-seo-desc",
        severity: "warning",
        title: `\u7F3A SEO \u63CF\u8FF0\uFF1A${label}`,
        detail: "\u6CA1\u6709 meta \u63CF\u8FF0\uFF0C\u6458\u8981\u7531 Google \u968F\u610F\u622A\u53D6\u3002\u8865\u4E00\u6BB5 120\u2013160 \u5B57\u7B26\u3001\u542B\u5173\u952E\u8BCD\u3001\u80FD\u5438\u5F15\u70B9\u51FB\u7684\u63CF\u8FF0\u3002",
        nodeIds: [c.id]
      });
    }
    const overTitle = seoWidth(c.seo.title) > TITLE_MAX;
    const overDesc = seoWidth(c.seo.description) > DESC_MAX;
    if (overTitle || overDesc) {
      const which = overTitle && overDesc ? "\u6807\u9898\u548C\u63CF\u8FF0\u90FD" : overTitle ? "\u6807\u9898" : "\u63CF\u8FF0";
      issues.push({
        id: `meta-truncated:${c.id}`,
        code: "meta-truncated",
        severity: "warning",
        title: `${which}\u8D85\u957F\uFF1A${label}`,
        detail: `${which}\u8D85\u8FC7\u5C55\u793A\u4E0A\u9650\uFF0C\u7ED3\u5C3E\u4F1A\u5728\u641C\u7D22\u7ED3\u679C\u91CC\u88AB\u622A\u65AD\u3002\u7CBE\u7B80\u5230 \u6807\u9898\u2264${TITLE_MAX} / \u63CF\u8FF0\u2264${DESC_MAX}\uFF08\u6309\u5BBD\u5EA6\u7B97\uFF0C\u4E2D\u6587\u6BCF\u5B57\u7B97 2\uFF09\u3002`,
        nodeIds: [c.id]
      });
    }
    const shortTitle = !isBlank(c.seo.title) && !overTitle && seoWidth(c.seo.title) < TITLE_MIN;
    const shortDesc = !isBlank(c.seo.description) && !overDesc && seoWidth(c.seo.description) < DESC_MIN;
    if (shortTitle || shortDesc) {
      const which = shortTitle && shortDesc ? "\u6807\u9898\u548C\u63CF\u8FF0\u90FD" : shortTitle ? "\u6807\u9898" : "\u63CF\u8FF0";
      issues.push({
        id: `meta-too-short:${c.id}`,
        code: "meta-too-short",
        severity: "warning",
        title: `${which}\u8FC7\u77ED\uFF1A${label}`,
        detail: `${which}\u592A\u77ED\uFF0C\u6D6A\u8D39\u4E86 SERP \u5C55\u793A\u4F4D\u4E0E\u76F8\u5173\u6027\u3002\u5199\u5230 \u6807\u9898 ${widthRange(TITLE_MIN, TITLE_MAX)} / \u63CF\u8FF0 ${widthRange(DESC_MIN, DESC_MAX)}\u3002`,
        nodeIds: [c.id]
      });
    }
    const coreCount = c.seo.coreKeywords.filter((k) => k.trim()).length;
    const longCount = c.seo.longTailKeywords.filter((k) => k.trim()).length;
    if (coreCount > CORE_KEYWORDS_MAX || longCount > LONGTAIL_KEYWORDS_MAX || coreCount + longCount > FOCUS_KEYWORDS_MAX) {
      issues.push({
        id: `too-many-keywords:${c.id}`,
        code: "too-many-keywords",
        severity: "warning",
        title: `\u5173\u952E\u8BCD\u8FC7\u591A\uFF1A${label}`,
        detail: `\u7126\u70B9\u5173\u952E\u8BCD\u6700\u591A ${FOCUS_KEYWORDS_MAX} \u4E2A\uFF08${CORE_KEYWORDS_MAX} \u6838\u5FC3 + ${LONGTAIL_KEYWORDS_MAX} \u957F\u5C3E\uFF09\uFF0C\u8D85\u51FA\u7684\u5199\u8FDB Rank Math \u4E5F\u4E0D\u4F1A\u751F\u6548\u3002\u5F53\u524D \u6838\u5FC3 ${coreCount} / \u957F\u5C3E ${longCount}\uFF0C\u8BF7\u7CBE\u7B80\u3002`,
        nodeIds: [c.id],
        term: primary
      });
    }
    if (primary && !isBlank(c.seo.title) && !c.seo.title.toLowerCase().includes(primary.toLowerCase())) {
      issues.push({
        id: `focus-not-in-title:${c.id}`,
        code: "focus-not-in-title",
        severity: "warning",
        title: `\u6838\u5FC3\u5173\u952E\u8BCD\u672A\u8FDB\u6807\u9898\uFF1A${label}`,
        detail: `\u6838\u5FC3\u5173\u952E\u8BCD\u300C${primary}\u300D\u6CA1\u51FA\u73B0\u5728 SEO \u6807\u9898\u91CC\uFF0C\u76F8\u5173\u6027\u4F1A\u6253\u6298\u3002\u628A\u5B83\u81EA\u7136\u5730\u5199\u8FDB\u6807\u9898\u3002`,
        nodeIds: [c.id],
        term: primary
      });
    }
    if (node && !node.orphan && node.outboundInternal === 0) {
      issues.push({
        id: `thin-internal-links:${c.id}`,
        code: "thin-internal-links",
        severity: "warning",
        title: `\u5185\u94FE\u8FC7\u7626\uFF1A${label}`,
        detail: "\u8FD9\u4E2A\u9875\u9762\u6CA1\u6709\u4EFB\u4F55\u51FA\u94FE\uFF0C\u6743\u91CD\u8FDB\u5F97\u6765\u5374\u56DE\u4E0D\u53BB\uFF0C\u65E0\u6CD5\u56DE\u6D41\u5230\u652F\u67F1\u3002\u52A0 2\u20133 \u6761\u6307\u5411\u76F8\u5173\u5185\u5BB9\u7684\u5185\u94FE\u3002",
        nodeIds: [c.id]
      });
    }
    if (c.wpStatus === "draft" && c.wpPostId != null && c.lastModifiedRemote) {
      const ageDays = (Date.now() - new Date(c.lastModifiedRemote).getTime()) / 864e5;
      if (ageDays >= STALE_DRAFT_DAYS) {
        issues.push({
          id: `stale-draft:${c.id}`,
          code: "stale-draft",
          severity: "info",
          title: `\u957F\u671F\u8349\u7A3F\uFF1A${label}`,
          detail: `\u5DF2\u4F5C\u4E3A\u8349\u7A3F\u5B58\u5728 ${Math.round(ageDays)} \u5929\u8FD8\u6CA1\u53D1\u5E03\uFF0C\u4E0D\u4EA7\u751F\u4EFB\u4F55 SEO \u4EF7\u503C\u3002\u8865\u5B8C\u6B63\u6587\u5E76\u53D1\u5E03\uFF0C\u6216\u5220\u9664\u3002`,
          nodeIds: [c.id]
        });
      }
    }
    if (c.dirtyAt) {
      issues.push({
        id: `unsynced:${c.id}`,
        code: "unsynced",
        severity: "info",
        title: `\u672C\u5730\u6539\u52A8\u672A\u540C\u6B65\uFF1A${label}`,
        detail: "\u672C\u5730\u7684\u4FEE\u6539\u8FD8\u6CA1\u63A8\u9001\u5230 WordPress\uFF0C\u7EBF\u4E0A\u4ECD\u662F\u65E7\u7248\u672C\u3002\u540C\u6B65\u4E00\u6B21\u8BA9\u6539\u52A8\u5728\u7EBF\u4E0A\u751F\u6548\u3002",
        nodeIds: [c.id]
      });
    }
  }
  const pillarsWithContent = /* @__PURE__ */ new Set();
  for (const gn of graph.nodes) {
    if (gn.type === "content" && gn.pillarId) pillarsWithContent.add(gn.pillarId);
  }
  for (const n of ws.nodes) {
    if (n.system) continue;
    const label = n.term || "\uFF08\u672A\u547D\u540D\u8282\u70B9\uFF09";
    if (!n.parentId && !pillarsWithContent.has(n.id)) {
      issues.push({
        id: `empty-pillar:${n.id}`,
        code: "empty-pillar",
        severity: "warning",
        title: `\u7A7A\u652F\u67F1\uFF1A${label}`,
        detail: "\u8FD9\u4E2A\u652F\u67F1\u4E0B\u6CA1\u6709\u4EFB\u4F55\u5185\u5BB9\u9875\uFF0C\u6491\u4E0D\u8D77\u4E3B\u9898\u6743\u91CD\u3002\u5F80\u4E0B\u8865\u6587\u7AE0\uFF0C\u6216\u5148\u5E76\u5165\u76F8\u90BB\u652F\u67F1\u3002",
        nodeIds: [n.id]
      });
    }
    if (n.isCategory && (isBlank(n.seo?.title) || isBlank(n.seo?.description))) {
      issues.push({
        id: `category-no-seo:${n.id}`,
        code: "category-no-seo",
        severity: "warning",
        title: `\u5206\u7C7B\u5F52\u6863\u65E0 SEO\uFF1A${label}`,
        detail: "\u5206\u7C7B\u5F52\u6863\u9875\u672C\u8EAB\u662F\u4E00\u4E2A\u53EF\u6392\u540D\u7684\u9875\u9762\uFF0C\u5374\u7F3A\u5C11\u6807\u9898/\u63CF\u8FF0\u3002\u7ED9\u5B83\u8865\u4E0A SEO\uFF0C\u8BA9\u5F52\u6863\u9875\u4E5F\u80FD\u5E26\u6765\u6D41\u91CF\u3002",
        nodeIds: [n.id]
      });
    }
  }
  for (const g of overlay.gaps) {
    issues.push({
      id: `keyword-gap:${normalizeTerm(g.term)}`,
      code: "keyword-gap",
      severity: "warning",
      title: `\u5173\u952E\u8BCD\u7F3A\u53E3\uFF1A${g.term}`,
      detail: `\u89C4\u5212\u4E86\u300C${g.term}\u300D\u4F46\u8FD8\u6CA1\u6709\u4EFB\u4F55\u9875\u9762\u8986\u76D6\u5B83\u3002\u5B89\u6392\u4E00\u7BC7\u5185\u5BB9\u53BB\u627F\u63A5\uFF0C\u6216\u4ECE\u8BA1\u5212\u91CC\u79FB\u9664\u3002`,
      nodeIds: [],
      term: g.term
    });
  }
  const crossSiloNodes = /* @__PURE__ */ new Set();
  let crossCount = 0;
  for (const e of graph.edges) {
    if (e.type !== "internal") continue;
    const a = graphNodeById.get(e.source);
    const b = graphNodeById.get(e.target);
    if (a?.pillarId && b?.pillarId && a.pillarId !== b.pillarId) {
      crossCount++;
      crossSiloNodes.add(e.source);
      crossSiloNodes.add(e.target);
    }
  }
  if (crossCount > 0) {
    issues.push({
      id: "cross-silo-link",
      code: "cross-silo-link",
      severity: "info",
      title: `\u8DE8\u652F\u67F1\u5185\u94FE\uFF08${crossCount} \u6761\uFF09`,
      detail: "\u6709\u5185\u94FE\u8DE8\u8D8A\u4E86\u4E0D\u540C\u652F\u67F1\uFF0C\u53EF\u80FD\u7A00\u91CA\u4E3B\u9898\u805A\u5408\uFF08\u4E5F\u53EF\u80FD\u662F\u6709\u610F\u7684\u6865\u63A5\uFF09\u3002\u786E\u8BA4\u8FD9\u4E9B\u94FE\u63A5\u662F\u5426\u5FC5\u8981\u3002",
      nodeIds: [...crossSiloNodes]
    });
  }
  const broken = ws.brokenLinks ?? [];
  if (broken.length) {
    const byUrl = /* @__PURE__ */ new Map();
    for (const b of broken) byUrl.set(b.url, [...byUrl.get(b.url) ?? [], b]);
    for (const [url, hits] of byUrl) {
      const where = hits[0].placement;
      const scope = where === "nav" || where === "footer" ? "\uFF08\u5168\u7AD9\u5BFC\u822A/\u9875\u811A\uFF0C\u5F71\u54CD\u6BCF\u4E2A\u9875\u9762\uFF09" : "";
      issues.push({
        id: `broken-link:${url}`,
        code: "broken-link",
        severity: "warning",
        title: `\u7AD9\u5185\u6B7B\u94FE\uFF1A${hits[0].anchor || url}${scope}`,
        detail: `${url} \u8FD4\u56DE ${hits[0].status}\u3002\u6B7B\u94FE\u6D6A\u8D39\u6293\u53D6\u9884\u7B97\u3001\u8BA9\u6743\u91CD\u6D41\u5411\u4E0D\u5B58\u5728\u7684\u9875\u9762\uFF0C\u4E5F\u76F4\u63A5\u635F\u5BB3\u7528\u6237\u4F53\u9A8C\u3002\u8BF7\u4FEE\u6B63\u94FE\u63A5\u5730\u5740\u6216\u8865\u4E0A\u8FD9\u4E2A\u9875\u9762\u3002`,
        nodeIds: [...new Set(hits.map((h) => h.from))]
      });
    }
  }
  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return issues;
}

// packages/silo-core/lib/model/selectors.ts
var isCategoryNode = (n) => !n.system && n.isCategory === true;
var taxonomyForNode = (ws, nodeId) => {
  const byId = new Map(ws.nodes.map((n) => [n.id, n]));
  const guard = /* @__PURE__ */ new Set();
  let cur = byId.get(nodeId) ?? null;
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.taxonomyRestBase) return cur.taxonomyRestBase;
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  return void 0;
};
var getNodePath = (ws, nodeId) => {
  const byId = new Map(ws.nodes.map((n) => [n.id, n]));
  const path = [];
  let cur = byId.get(nodeId) ?? null;
  const guard = /* @__PURE__ */ new Set();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  return path;
};
var focusKeywords = (seo) => [...seo.coreKeywords.slice(0, CORE_KEYWORDS_MAX), ...seo.longTailKeywords.slice(0, LONGTAIL_KEYWORDS_MAX)].map((s) => s.trim()).filter(Boolean);
var getPendingContents = (ws) => ws.contents.filter((c) => c.wpPostId === null);
var getDirtyContents = (ws) => ws.contents.filter((c) => c.dirtyAt != null);

// packages/silo-core/lib/model/mutations.ts
var addNode = (ws, term, kind, parentId, intent) => {
  const node = createNode(term, kind, parentId, intent ? { intent } : void 0);
  return { ws: { ...ws, nodes: [...ws.nodes, node] }, node };
};
var addContent = (ws, siloNodeId, title, postType = "post") => {
  const content = createContent(siloNodeId, title, postType);
  return { ws: { ...ws, contents: [...ws.contents, content] }, content };
};
var updateNode = (ws, nodeId, patch) => ({
  ...ws,
  nodes: ws.nodes.map((n) => n.id === nodeId ? { ...n, ...patch } : n)
});
var updateContent = (ws, contentId, patch) => ({
  ...ws,
  contents: ws.contents.map((c) => c.id === contentId ? { ...c, ...patch } : c)
});
var setContentLinks = (ws, fromId, internalTargetIds, externalUrls) => {
  const prior = ws.edges.filter((e) => e.from === fromId);
  const priorInternal = new Map(prior.filter((e) => e.type === "internal-link").map((e) => [e.to, e]));
  const priorExternal = new Map(prior.filter((e) => e.type === "external-link").map((e) => [e.to, e]));
  const kept = ws.edges.filter((e) => e.from !== fromId || e.type !== "internal-link" && e.type !== "external-link");
  const nextInternal = Array.from(new Set(internalTargetIds)).filter((to) => to && to !== fromId).map((to) => priorInternal.get(to) ?? { from: fromId, to, type: "internal-link" });
  const nextExternal = Array.from(new Set(externalUrls)).filter(Boolean).map((to) => priorExternal.get(to) ?? { from: fromId, to, type: "external-link" });
  return { ...ws, edges: [...kept, ...nextInternal, ...nextExternal] };
};
var addKeyword = (ws, term, extra) => {
  const t = term.trim();
  const key = normalizeTerm(t);
  const found = ws.keywords.find((k) => normalizeTerm(k.term) === key);
  if (!key || found) return { ws, keyword: found ?? { id: "", term: t, source: "local" } };
  const keyword = { id: newId("k"), term: t, source: "local", ...extra };
  return { ws: { ...ws, keywords: [...ws.keywords, keyword] }, keyword };
};

// packages/silo-core/lib/ports/network.ts
var WpHttpError = class extends Error {
  constructor(status, code, message, body) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
    this.name = "WpHttpError";
  }
};
var AUTH_ERROR_CODES = /* @__PURE__ */ new Set([
  "incorrect_password",
  "invalid_username",
  "rest_cookie_invalid_nonce",
  "rest_not_logged_in",
  "rest_forbidden"
]);
function isAuthError(e) {
  if (!(e instanceof WpHttpError)) return false;
  if (e.status === 401) return true;
  return e.status === 403 && AUTH_ERROR_CODES.has(e.code);
}

// packages/silo-core/lib/store/layout.ts
var PUFFERGO_STATE_DIR = ".puffergo";
var SITES_DIR = `${PUFFERGO_STATE_DIR}/sites`;
var STATE_PATH = `${PUFFERGO_STATE_DIR}/state.json`;
var siteDir = (domain) => `${SITES_DIR}/${domain}`;
var workspacePath = (domain) => `${siteDir(domain)}/workspace.json`;
var syncedPath = (domain) => `${siteDir(domain)}/synced.json`;
var siteConfigPath = (domain) => `${siteDir(domain)}/config.json`;
var siteStatePath = (domain, file) => `${siteDir(domain)}/${file}`;

// packages/silo-core/lib/wp/client.ts
var decodeTermName = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&");
var DEFAULT_POST_TYPE_ROUTE = {
  post: "posts",
  page: "pages"
};
var CONTENT_FIELDS = [
  "id",
  "link",
  "slug",
  "status",
  "modified",
  "modified_gmt",
  "title",
  "content",
  "meta",
  "yoast_head_json"
];
var READONLY_ABILITIES = /* @__PURE__ */ new Set(["list-post-types", "find-posts", "get-blocks"]);
var WpClient = class {
  constructor(net2, conn) {
    this.net = net2;
    const site2 = conn.siteUrl.replace(/\/$/, "");
    this.base = `${site2}/wp-json`;
    this.abilityBase = `${this.base}/wp-abilities/v1/abilities/puffergo`;
    this.authHeader = `Basic ${btoa(`${conn.username}:${conn.appPassword}`)}`;
    this.typeInfo = new Map((conn.contentTypes ?? []).map((t) => [t.type, t]));
  }
  base;
  abilityBase;
  authHeader;
  /** type slug → discovered info (rest_base + hierarchical taxonomy rest_base). */
  typeInfo;
  /** `${taxonomy}:${termId}` → slug, so a ledger of term ids can push the slugs abilities want
   *  without re-fetching a term per item. Per-client: one client lives for one push/import run. */
  termSlugCache = /* @__PURE__ */ new Map();
  /** Resolve the REST base for a post type: discovered info wins; else the WP-core default for
   *  post/page; else the type slug itself (a reasonable guess for a not-yet-discovered CPT). */
  routeFor(postType) {
    return this.typeInfo.get(postType)?.restBase ?? DEFAULT_POST_TYPE_ROUTE[postType] ?? postType;
  }
  /** Human-readable label for a type (from discovery), falling back to the slug. Used to name the
   *  type-root node (博客/产品/解决方案…) when building the taxonomy backbone on import. */
  typeLabel(postType) {
    return this.typeInfo.get(postType)?.label || postType;
  }
  /** REST base of the type's hierarchical taxonomy (the category-equivalent), or undefined if none. */
  taxRestBaseFor(postType) {
    return this.typeInfo.get(postType)?.taxonomyRestBase;
  }
  async call(req) {
    const res = await this.net.request({
      ...req,
      url: `${this.base}${req.url}`,
      headers: { "Content-Type": "application/json", Authorization: this.authHeader, ...req.headers }
    });
    const body = res.json;
    if (res.status < 200 || res.status >= 300) {
      throw new WpHttpError(res.status, body?.code ?? "wp_error", body?.message ?? `HTTP ${res.status}`, body);
    }
    return body;
  }
  // -------------------------------------------------------------------------
  // Abilities: the plugin's content surface (WordPress ≥ 6.9 + the PufferGo plugin)
  // -------------------------------------------------------------------------
  /**
   * Run one `puffergo/<name>` ability through core's `/wp-abilities/v1` REST route. Readonly abilities
   * go over GET with each input field as `input[field]=value` (core reads the raw query param, no JSON
   * decoding); writes go over POST with `{input}` as the JSON body. A non-2xx becomes a `WpHttpError`
   * carrying the plugin's own `{code, message, data:{status, fix, errors, baseModified}}`, so callers
   * can branch on `code` ('conflict', 'no_seo_plugin', 'prose_unsupported', …) and `isAuthError` keeps
   * working exactly as on the /wp/v2 surface.
   */
  async runAbility(name, input = {}) {
    let req;
    if (READONLY_ABILITIES.has(name)) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(input)) {
        if (v !== void 0 && v !== "" && v !== false) q.set(`input[${k}]`, String(v));
      }
      const qs = q.toString();
      req = { method: "GET", url: `/wp-abilities/v1/abilities/puffergo/${name}/run${qs ? `?${qs}` : ""}` };
    } else {
      req = { method: "POST", url: `/wp-abilities/v1/abilities/puffergo/${name}/run`, body: { input } };
    }
    const res = await this.call(req);
    if (res == null)
      throw new WpHttpError(200, "empty_response", `ability ${name} returned an empty response`, void 0);
    return res;
  }
  /** The site's editable content types with each one's full category tree (id/name/slug/parent). */
  listPostTypes() {
    return this.runAbility("list-post-types");
  }
  /** Find posts by type/status/search/url, newest-modified first, 50 a page. */
  findPosts(params = {}) {
    return this.runAbility("find-posts", params);
  }
  /** One post's blocks + SEO + concurrency token. `full: true` makes every block carry its whole
   *  content (prose → `markdown`, static → `html`, …) — one read of the complete body. */
  getBlocks(id, opts = {}) {
    return this.runAbility("get-blocks", {
      id,
      ...opts.path ? { path: opts.path } : {},
      ...opts.full ? { full: true } : {}
    });
  }
  /** Create a draft. `blocks` may be empty — a body-less shell a later `updateBody` fills in. SEO
   *  fields are optional; what's missing comes back as advice in `seo.checks`. */
  createPost(input) {
    return this.runAbility("create-post", input);
  }
  /** Replace the post's WHOLE body with these blocks; title/slug/SEO/categories untouched. Refused
   *  when the post changed since `baseModified` (409 'conflict') or isn't block content (400). */
  updateBody(input) {
    return this.runAbility("update-body", input);
  }
  /** Change title/slug/SEO/categories/featured image. Same 409 'conflict' guard; a published post's
   *  slug (and, where permalinks carry it, its category) is locked ('slug_locked' / 'category_locked'). */
  updateSeo(input) {
    return this.runAbility("update-seo", input);
  }
  /** Publish a draft (not products). Same guards as the other writes. */
  publishPost(input) {
    return this.runAbility("publish-post", input);
  }
  /** A term's slug by id (cached per client) — the bridge from the ledger's term ids to the slugs the
   *  abilities' `categories` field wants. Null when the term no longer exists on the site. */
  async termSlug(taxRestBase, termId) {
    const key = `${taxRestBase}:${termId}`;
    const hit = this.termSlugCache.get(key);
    if (hit !== void 0) return hit || null;
    const term = await this.fetchTerm(taxRestBase, termId);
    this.termSlugCache.set(key, term?.slug ?? "");
    return term?.slug ?? null;
  }
  /**
   * Discover the site's public content types and each one's hierarchical taxonomy, from `/wp/v2/types`
   * + `/wp/v2/taxonomies`. Fully data-driven: works for WP core, WooCommerce, PufferGo CPTs, or any
   * plugin's types with zero hardcoded slugs. WP-internal types (attachments, blocks, templates, …)
   * are filtered out. Types with no REST base are skipped.
   */
  async discoverContentTypes() {
    const [typesRaw, taxesRaw] = await Promise.all([
      this.call({
        method: "GET",
        url: "/wp/v2/types"
      }),
      this.call({
        method: "GET",
        url: "/wp/v2/taxonomies"
      })
    ]);
    const types = typesRaw && typeof typesRaw === "object" ? typesRaw : {};
    const taxes = taxesRaw && typeof taxesRaw === "object" ? taxesRaw : {};
    const BLOCK = /* @__PURE__ */ new Set([
      "attachment",
      "nav_menu_item",
      "wp_block",
      "wp_template",
      "wp_template_part",
      "wp_navigation",
      "wp_font_family",
      "wp_font_face",
      "wp_global_styles",
      "oembed_cache",
      "user_request",
      "custom_css",
      "customize_changeset"
    ]);
    const CAT_LIKE = /(^category$|_cat$|_category$|categories$)/i;
    const out = [];
    for (const [slug, t] of Object.entries(types)) {
      if (!t.rest_base || BLOCK.has(slug)) continue;
      const hier = (t.taxonomies ?? []).map((s) => taxes[s]?.hierarchical && taxes[s]?.rest_base ? { slug: s, restBase: taxes[s].rest_base } : null).filter((x) => x != null);
      const taxonomyRestBase = (hier.find((x) => CAT_LIKE.test(x.slug)) ?? hier[0])?.restBase;
      if (slug !== "post" && slug !== "page" && !taxonomyRestBase) continue;
      out.push({ type: slug, restBase: t.rest_base, label: t.name || slug, taxonomyRestBase });
    }
    return out;
  }
  /**
   * Upload a binary asset to the WP media library (POST /wp/v2/media) and return its id + public URL.
   * The body is raw bytes; the NetworkPort adapter must pass a Uint8Array through untouched (not JSON).
   * `Content-Disposition` names the file so WP keeps the extension/slug.
   */
  async uploadMedia(bytes, filename, mimeType) {
    const res = await this.call({
      method: "POST",
      url: "/wp/v2/media",
      headers: { "Content-Type": mimeType, "Content-Disposition": `attachment; filename="${filename}"` },
      body: bytes
    });
    return { id: res.id, url: res.source_url };
  }
  /**
   * Make sure a WordPress.org plugin is installed and active (needs `activate_plugins` +
   * `install_plugins`). Goes through the host's NetworkPort like every other call here, so it works in
   * hosts where a plain browser fetch would be blocked by CORS (Obsidian).
   */
  async ensurePluginActive(slug) {
    const plugins = await this.call({
      method: "GET",
      url: "/wp/v2/plugins?_fields=plugin,textdomain,status"
    });
    const existing = plugins.find(
      (p) => p.textdomain === slug || p.plugin === slug || (p.plugin ?? "").startsWith(`${slug}/`)
    );
    if (existing?.plugin) {
      if (existing.status === "active") return { action: "already_active" };
      const id = existing.plugin.split("/").map(encodeURIComponent).join("/");
      await this.call({ method: "POST", url: `/wp/v2/plugins/${id}`, body: { status: "active" } });
      return { action: "activated" };
    }
    await this.call({ method: "POST", url: "/wp/v2/plugins", body: { slug, status: "active" } });
    return { action: "installed" };
  }
  /** True if the Application Password authenticates. Uses GET /wp/v2/users/me. */
  async verifyConnection() {
    try {
      await this.call({ method: "GET", url: "/wp/v2/users/me?_fields=id" });
      return true;
    } catch {
      return false;
    }
  }
  /** Fetch ONE content item's importer fields (for single-item refresh from the cloud). Returns null
   *  when the post is gone (404). Normalizes the per-type taxonomy field into `termIds` like the list. */
  async fetchContentItem(postType, id) {
    const route = this.routeFor(postType);
    const tax = this.taxRestBaseFor(postType);
    const fields = [...CONTENT_FIELDS];
    if (tax) fields.push(tax);
    const res = await this.net.request({
      method: "GET",
      url: `${this.base}/wp/v2/${route}/${id}?_fields=${fields.join(",")}`,
      headers: { "Content-Type": "application/json", Authorization: this.authHeader }
    });
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) {
      const body = res.json;
      throw new WpHttpError(res.status, body?.code ?? "wp_error", body?.message ?? `HTTP ${res.status}`, body);
    }
    const row = res.json;
    if (!row) return null;
    const raw = tax ? row[tax] : void 0;
    const termIds = Array.isArray(raw) ? raw.filter((n) => typeof n === "number") : [];
    return { ...row, termIds };
  }
  /**
   * Fetch a single post's RENDERED body HTML on demand — for PREVIEW only. The extension never stores
   * bodies; this pulls the current WP content when the user opens a preview, to be held in memory and
   * discarded. Returns '' when the post has no content.
   */
  async fetchRendered(postType, id) {
    const res = await this.call({
      method: "GET",
      url: `/wp/v2/${this.routeFor(postType)}/${id}?_fields=content`
    });
    return res.content?.rendered ?? "";
  }
  /**
   * Fetch the FULL themed front-end page HTML at a permalink — for PREVIEW only. Unlike `fetchRendered`
   * (just the post body), this returns the whole `<html>` document including header/footer and the
   * theme's `<link>` stylesheets, so a srcdoc iframe preview looks like the real site. Sent WITHOUT the
   * Basic-auth header (it's a public page), so it only works for published content; drafts have no
   * public permalink — callers should fall back to `fetchRendered`. Returns '' on a non-2xx.
   */
  async fetchRenderedPage(link2) {
    const res = await this.net.request({ method: "GET", url: link2 });
    if (res.status < 200 || res.status >= 300) return "";
    return res.text ?? "";
  }
  /**
   * HTTP status of a front-end URL, for telling a genuinely broken internal link (404) apart from one
   * that merely points at content this import didn't pull. Unauthenticated on purpose — we want what a
   * crawler would see, not what an admin can reach. Returns 0 when the request itself failed (offline,
   * DNS, CORS), which callers must treat as "unknown", never as broken.
   */
  async probeUrlStatus(url) {
    try {
      const res = await this.net.request({ method: "GET", url });
      return res.status;
    } catch {
      return 0;
    }
  }
  /**
   * Write a taxonomy TERM's archive-page SEO (title / description / focus keywords) through the
   * PufferGo plugin's own route — abilities address posts only, so a category archive keeps this path.
   * Post SEO travels inside `updateSeo` (the ability) instead. Blank fields are left out; nothing is
   * sent when all are blank. Requires the PufferGo plugin; a site without it (or without any SEO
   * plugin) fails with the site's own error — there is no second write path.
   */
  async writeTermSeo(termId, seo) {
    const title = seo.title.trim();
    const description = seo.description.trim();
    const keywords = focusKeywords(seo);
    if (!title && !description && !keywords.length) return;
    await this.call({
      method: "POST",
      url: "/puffergo/v1/seo-meta",
      body: {
        objectType: "term",
        id: termId,
        ...title ? { title } : {},
        ...description ? { description } : {},
        ...keywords.length ? { keywords } : {}
      }
    });
  }
  /** The SEO limits the site's PufferGo plugin publishes, or null without the plugin. */
  async fetchSeoLimits() {
    const res = await this.net.request({
      method: "GET",
      url: `${this.base}/puffergo/v1/seo-limits`,
      headers: { "Content-Type": "application/json", Authorization: this.authHeader }
    });
    const body = res.json;
    return res.status >= 200 && res.status < 300 && body?.limits ? body.limits : null;
  }
  /**
   * Pull existing content of one abstract type from WordPress, one page at a time. Returns the raw
   * posts plus the total page count (from the `X-WP-TotalPages` header) so the caller can loop.
   * Reads the minimal field set the importer needs (notably `content.rendered`, which carries the
   * links we parse back out). `status=any` so drafts already in WP are included.
   */
  async listContentType(postType, page = 1, perPage = 50) {
    const route = this.routeFor(postType);
    const tax = this.taxRestBaseFor(postType);
    const fieldList = [...CONTENT_FIELDS];
    if (tax) fieldList.push(tax);
    const res = await this.net.request({
      method: "GET",
      url: `${this.base}/wp/v2/${route}?status=any&per_page=${perPage}&page=${page}&_fields=${fieldList.join(",")}`,
      headers: { "Content-Type": "application/json", Authorization: this.authHeader }
    });
    if (res.status < 200 || res.status >= 300) {
      const body = res.json;
      throw new WpHttpError(res.status, body?.code ?? "wp_error", body?.message ?? `HTTP ${res.status}`, body);
    }
    const totalPages = Number(res.headers?.["x-wp-totalpages"] ?? res.headers?.["X-WP-TotalPages"] ?? 1) || 1;
    const rows = res.json ?? [];
    const posts = rows.map((row) => {
      const raw = tax ? row[tax] : void 0;
      const termIds = Array.isArray(raw) ? raw.filter((n) => typeof n === "number") : [];
      return { ...row, termIds };
    });
    return { posts, totalPages };
  }
  /**
   * Batch-read SEO meta (title / description / focusKeyword) for the given post ids via the PufferGo
   * plugin's read-only route `/puffergo/v1/seo-meta`. This is the ONLY way to read Rank Math meta back
   * (core `/wp/v2` never exposes it). Returns `null` when the route isn't there — i.e. the PufferGo
   * plugin isn't installed/active — so the caller can degrade gracefully and prompt installation.
   * Probed lazily each import (never cached), so installing the plugin later "just works" next import.
   */
  async fetchSeoMeta(ids) {
    if (!ids.length) return { provider: "none", items: [] };
    const include = Array.from(new Set(ids)).join(",");
    const res = await this.net.request({
      method: "GET",
      url: `${this.base}/puffergo/v1/seo-meta?include=${include}`,
      headers: { "Content-Type": "application/json", Authorization: this.authHeader }
    });
    if (res.status === 404) return null;
    const body = res.json;
    if (body?.code === "rest_no_route") return null;
    if (res.status < 200 || res.status >= 300) {
      throw new WpHttpError(
        res.status,
        body?.code ?? "wp_error",
        body?.message ?? `HTTP ${res.status}`,
        body
      );
    }
    return { provider: body?.provider ?? "none", items: body?.items ?? [] };
  }
  /** Pull ALL content of one abstract type, following pagination. */
  async listAllContentType(postType, perPage = 50) {
    const first = await this.listContentType(postType, 1, perPage);
    const all = [...first.posts];
    for (let page = 2; page <= first.totalPages; page++) {
      const next = await this.listContentType(postType, page, perPage);
      all.push(...next.posts);
    }
    return all;
  }
  /**
   * Resolve a keyword-hierarchy path to terms in ANY hierarchical taxonomy, creating missing terms
   * (with the correct parent) so the keyword tree mirrors the taxonomy tree. Returns the leaf
   * `{id, slug}` — both, because the ledger stores ids while the abilities' `categories` field takes
   * slugs. `taxRestBase` is the taxonomy's REST base ('categories', 'product_cat', …).
   */
  async ensureTermPath(taxRestBase, terms, startParent = 0) {
    let parent = startParent;
    let leaf = null;
    for (const term of terms) {
      const name = term.trim();
      if (!name) continue;
      const want = name.toLowerCase();
      let match;
      for (let page = 1; ; page++) {
        let rows;
        try {
          rows = await this.call({
            method: "GET",
            url: `/wp/v2/${taxRestBase}?per_page=100&page=${page}&parent=${parent}&search=${encodeURIComponent(name)}&_fields=id,name,slug`
          });
        } catch (e) {
          if (e instanceof WpHttpError && e.status === 400) break;
          throw e;
        }
        const hit = rows.find((t) => decodeTermName(t.name).trim().toLowerCase() === want);
        if (hit) {
          match = { id: hit.id, slug: hit.slug };
          break;
        }
        if (rows.length < 100) break;
      }
      if (match) {
        leaf = match;
      } else {
        const created2 = await this.call({
          method: "POST",
          url: `/wp/v2/${taxRestBase}`,
          body: { name, parent }
        });
        leaf = { id: created2.id, slug: created2.slug };
      }
      this.termSlugCache.set(`${taxRestBase}:${leaf.id}`, leaf.slug);
      parent = leaf.id;
    }
    return leaf;
  }
  /** Fetch ONE taxonomy term (name/slug/parent + front-end archive `link`) for a single-category
   *  refresh. Returns null when the term no longer exists on WP (404). */
  async fetchTerm(taxRestBase, id) {
    const res = await this.net.request({
      method: "GET",
      url: `${this.base}/wp/v2/${taxRestBase}/${id}?_fields=id,name,slug,parent,link`,
      headers: { "Content-Type": "application/json", Authorization: this.authHeader }
    });
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) {
      const body = res.json;
      throw new WpHttpError(res.status, body?.code ?? "wp_error", body?.message ?? `HTTP ${res.status}`, body);
    }
    return res.json ?? null;
  }
  /**
   * Pull ALL terms of a hierarchical taxonomy (id/name/slug/parent), following pagination — the raw
   * material for mirroring a WP category tree into Silo nodes on import. Empty taxonomies return [].
   */
  async listAllTerms(taxRestBase, perPage = 100) {
    const out = [];
    for (let page = 1; ; page++) {
      const res = await this.net.request({
        method: "GET",
        // `link` is the term's front-end archive URL — needed to resolve menu/body links that point at
        // a category archive rather than a post. Without it those links can't be matched to anything.
        url: `${this.base}/wp/v2/${taxRestBase}?per_page=${perPage}&page=${page}&_fields=id,name,slug,parent,link`,
        headers: { "Content-Type": "application/json", Authorization: this.authHeader }
      });
      if (res.status < 200 || res.status >= 300) {
        if (page === 1 && (res.status === 401 || res.status === 403)) {
          const body = res.json;
          throw new WpHttpError(res.status, body?.code ?? "wp_error", body?.message ?? `HTTP ${res.status}`, body);
        }
        break;
      }
      const rows = res.json ?? [];
      out.push(...rows);
      const totalPages = Number(res.headers?.["x-wp-totalpages"] ?? res.headers?.["X-WP-TotalPages"] ?? 1) || 1;
      if (page >= totalPages || rows.length === 0) break;
    }
    return out;
  }
};

// packages/silo-core/lib/vault/frontmatter.ts
var import_yaml = __toESM(require_dist(), 1);
var slugify = (s) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
function contentDirSegments(ws, content) {
  return getNodePath(ws, content.siloNodeId).map((n) => slugify(n.term));
}
var FILENAME_CHAR_MAP = {
  "\\": "\uFF3C",
  "/": "\uFF0F",
  ":": "\uFF1A",
  "*": "\uFF0A",
  "?": "\uFF1F",
  '"': "\uFF02",
  "<": "\uFF1C",
  ">": "\uFF1E",
  "|": "\uFF5C",
  "#": "\uFF03",
  "^": "\uFF3E",
  "[": "\uFF3B",
  "]": "\uFF3D"
};
var decodeEntities = (s) => s.replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
function titleToFileName(title) {
  return decodeEntities(title ?? "").replace(/[\\/:*?"<>|#^[\]]/g, (ch) => FILENAME_CHAR_MAP[ch] ?? "-").replace(/[\x00-\x1f\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 120).trim();
}
function contentFileFallbackName(content) {
  return content.slug ? slugify(content.slug) : content.id;
}
function contentFileBaseName(content) {
  return titleToFileName(content.title) || contentFileFallbackName(content);
}
var esc = (s) => String(s ?? "").replace(/"/g, '\\"');
var yamlList = (items) => items.length ? "\n" + items.map((i) => `  - "${esc(i)}"`).join("\n") : " []";
function renderFrontmatter(ws, content, internalLinks, externalLinks, purpose = "") {
  const nodePath = getNodePath(ws, content.siloNodeId).map((n) => n.term).join(" / ");
  const s = content.seo;
  return [
    "---",
    "silo:",
    // system-owned, read-only in Obsidian (nested)
    `  id: ${content.id}`,
    `  node: "${esc(nodePath)}"`,
    `  postType: ${content.postType}`,
    `title: "${esc(content.title)}"`,
    content.slug ? `slug: ${slugify(content.slug)}` : "slug:",
    // Lets Obsidian resolve `[[slug]]` / `[[slug|text]]` even though the file is named after the title.
    ...content.slug ? ["aliases:", `  - "${esc(slugify(content.slug))}"`] : [],
    `purpose: "${esc(purpose)}"`,
    // 这篇的目的（对齐 Step3），可编辑，不推送到 WP
    `seoTitle: "${esc(s.title)}"`,
    `seoDescription: "${esc(s.description)}"`,
    `coreKeywords:${yamlList(s.coreKeywords)}`,
    `longTailKeywords:${yamlList(s.longTailKeywords)}`,
    `internalLinks:${yamlList(internalLinks)}`,
    `externalLinks:${yamlList(externalLinks)}`,
    `status: ${content.wpStatus ?? "draft"}`,
    "wp:",
    // system-owned, read-only in Obsidian (nested)
    `  postId: ${content.wpPostId ?? "null"}`,
    `  link: ${content.wpLink ? `"${esc(content.wpLink)}"` : "null"}`,
    "---",
    ""
  ].join("\n");
}
function parseFrontmatterEdits(fm) {
  let doc;
  try {
    doc = (0, import_yaml.parse)(fm);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;
  const d = doc;
  const str = (v) => typeof v === "string" ? v : v == null ? void 0 : String(v);
  const list2 = (v) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : void 0;
  return {
    title: str(d.title),
    slug: str(d.slug),
    purpose: str(d.purpose),
    seoTitle: str(d.seoTitle),
    seoDescription: str(d.seoDescription),
    coreKeywords: list2(d.coreKeywords),
    longTailKeywords: list2(d.longTailKeywords),
    internalLinks: list2(d.internalLinks),
    externalLinks: list2(d.externalLinks)
  };
}
function wikilinkTarget(raw) {
  return raw.replace(/^\[\[|\]\]$/g, "").split(/[#|]/)[0].trim();
}
function splitFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: "", body: raw };
  return { fm: m[1], body: m[2] };
}
function siloIdOf(fm) {
  const m = fm.match(/\n {2}id:\s*(c_\w+)/) ?? fm.match(/^ {2}id:\s*(c_\w+)/);
  return m ? m[1] : null;
}
var norm = (s) => s.trim().toLowerCase();
function applyFrontmatterEdits(ws, scanned) {
  const links = buildNoteLinkIndex(ws, noteNamesFromScan(scanned));
  let next = ws;
  let changed = 0;
  for (const c of ws.contents) {
    const scan = scanned.get(c.id);
    if (!scan) continue;
    const e = parseFrontmatterEdits(scan.fm);
    if (!e) continue;
    let touched = false;
    const seo = { ...c.seo };
    if (e.seoTitle !== void 0 && e.seoTitle !== seo.title) seo.title = e.seoTitle, touched = true;
    if (e.seoDescription !== void 0 && e.seoDescription !== seo.description)
      seo.description = e.seoDescription, touched = true;
    const eqList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    if (e.coreKeywords && !eqList(e.coreKeywords, seo.coreKeywords))
      seo.coreKeywords = e.coreKeywords, touched = true;
    if (e.longTailKeywords && !eqList(e.longTailKeywords, seo.longTailKeywords))
      seo.longTailKeywords = e.longTailKeywords, touched = true;
    const patch = {};
    if (touched) patch.seo = seo;
    if (e.title !== void 0 && e.title !== c.title) patch.title = e.title, touched = true;
    if (e.slug !== void 0 && norm(e.slug) !== norm(c.slug ?? "")) patch.slug = e.slug, touched = true;
    if (Object.keys(patch).length) next = updateContent(next, c.id, patch);
    if (e.internalLinks || e.externalLinks) {
      const desiredInternal = (e.internalLinks ?? []).map((raw) => links.idFor(wikilinkTarget(raw))).filter((x) => !!x);
      const desiredExternal = e.externalLinks ?? [];
      const curInternal = next.edges.filter((g) => g.from === c.id && g.type === "internal-link").map((g) => g.to);
      const curExternal = next.edges.filter((g) => g.from === c.id && g.type === "external-link").map((g) => g.to);
      if (!eqList(desiredInternal, curInternal) || !eqList(desiredExternal, curExternal)) {
        next = setContentLinks(next, c.id, desiredInternal, desiredExternal);
        touched = true;
      }
    }
    if (touched) changed++;
  }
  return { ws: next, changed };
}

// packages/silo-core/lib/vault/note-links.ts
var norm2 = (s) => s.trim().toLowerCase();
function noteNameFromPath(path) {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.md$/i, "");
}
function noteNamesFromScan(scanned) {
  const out = /* @__PURE__ */ new Map();
  for (const [id, s] of scanned) if (s.path) out.set(id, noteNameFromPath(s.path));
  return out;
}
function buildNoteLinkIndex(ws, noteNames) {
  const nameById = /* @__PURE__ */ new Map();
  for (const c of ws.contents) nameById.set(c.id, noteNames?.get(c.id) ?? contentFileBaseName(c));
  const byName = /* @__PURE__ */ new Map();
  const bySlug = /* @__PURE__ */ new Map();
  const byId = /* @__PURE__ */ new Map();
  for (const c of ws.contents) {
    const name = nameById.get(c.id);
    if (name && !byName.has(norm2(name))) byName.set(norm2(name), c.id);
    if (c.slug && !bySlug.has(norm2(c.slug))) bySlug.set(norm2(c.slug), c.id);
    byId.set(norm2(c.id), c.id);
  }
  return {
    idFor: (target) => {
      const k = norm2(target);
      return byName.get(k) ?? bySlug.get(k) ?? byId.get(k);
    },
    nameFor: (id) => nameById.get(id)
  };
}
function formatWikilink(name, text) {
  return text && text !== name ? `[[${name}|${text}]]` : `[[${name}]]`;
}

// packages/silo-core/lib/content/body-codec.ts
var isLocalAssetRef = (ref) => !/^(https?:)?\/\//i.test(ref.trim()) && !/^data:/i.test(ref.trim());
var MD_IMAGE_RE = /(!\[[^\]]*\]\(\s*)([^)\s]+)((?:\s+"[^"]*")?\s*\))/g;
var EMBED_IMAGE_RE = /!\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
function extractLocalImageRefs(md) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const add = (ref) => {
    const r = ref.trim();
    if (r && isLocalAssetRef(r) && !seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  };
  for (const m of md.matchAll(MD_IMAGE_RE)) add(m[2]);
  for (const m of md.matchAll(EMBED_IMAGE_RE)) add(m[1]);
  return out;
}
function rewriteImageRefs(md, map) {
  const mapped = (ref) => map.get(ref.trim());
  return md.replace(MD_IMAGE_RE, (whole, pre, path, post) => {
    const url = mapped(path);
    return url ? `${pre}${url}${post}` : whole;
  }).replace(EMBED_IMAGE_RE, (whole, path) => {
    const url = mapped(path);
    return url ? `![](${url})` : whole;
  });
}
async function resolveBodyAssets(md, uploader) {
  const refs = extractLocalImageRefs(md);
  if (!refs.length) return { md, uploaded: 0 };
  const map = /* @__PURE__ */ new Map();
  for (const ref of refs) {
    const url = await uploader.upload(ref);
    if (url) map.set(ref, url);
  }
  return { md: rewriteImageRefs(md, map), uploaded: map.size };
}
function rootRelativePermalink(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    return url;
  }
}
function buildLinkResolver(ws, noteNames) {
  const index = buildNoteLinkIndex(ws, noteNames);
  const wpLinkById = /* @__PURE__ */ new Map();
  const idByUrl = /* @__PURE__ */ new Map();
  for (const c of ws.contents) {
    if (c.wpLink) {
      wpLinkById.set(c.id, c.wpLink);
      idByUrl.set(c.wpLink, c.id);
    }
  }
  return {
    permalinkFor: (target) => {
      const id = index.idFor(target);
      return id ? wpLinkById.get(id) : void 0;
    },
    targetForUrl: (url) => {
      const id = idByUrl.get(url);
      return id ? index.nameFor(id) : void 0;
    }
  };
}
var WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
function resolveWikilinks(md, resolver) {
  const trimmed = md.trim();
  if (!trimmed) return { md: "", unresolved: [] };
  const unresolved = [];
  const resolved = trimmed.replace(WIKILINK_RE, (_m, rawTarget, alias) => {
    const target = rawTarget.trim();
    const text = (alias ?? target).trim();
    const permalink = resolver.permalinkFor(target);
    if (!permalink) {
      unresolved.push(target);
      return text;
    }
    return `[${text}](${rootRelativePermalink(permalink)})`;
  });
  return { md: resolved, unresolved };
}
var MD_LINK_RE = /(?<!!)\[([^\]]*)\]\(\s*([^)\s]+)((?:\s+"[^"]*")?\s*\))/g;
function restoreWikilinks(md, resolveInternalLink) {
  const trimmed = md.trim();
  if (!trimmed) return "";
  return trimmed.replace(MD_LINK_RE, (whole, text, href) => {
    const name = resolveInternalLink(href);
    return name ? formatWikilink(name, text) : whole;
  });
}

// node_modules/.pnpm/marked@14.1.4/node_modules/marked/lib/marked.esm.js
function _getDefaults() {
  return {
    async: false,
    breaks: false,
    extensions: null,
    gfm: true,
    hooks: null,
    pedantic: false,
    renderer: null,
    silent: false,
    tokenizer: null,
    walkTokens: null
  };
}
var _defaults = _getDefaults();
function changeDefaults(newDefaults) {
  _defaults = newDefaults;
}
var escapeTest = /[&<>"']/;
var escapeReplace = new RegExp(escapeTest.source, "g");
var escapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
var escapeReplaceNoEncode = new RegExp(escapeTestNoEncode.source, "g");
var escapeReplacements = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
var getEscapeReplacement = (ch) => escapeReplacements[ch];
function escape$1(html2, encode) {
  if (encode) {
    if (escapeTest.test(html2)) {
      return html2.replace(escapeReplace, getEscapeReplacement);
    }
  } else {
    if (escapeTestNoEncode.test(html2)) {
      return html2.replace(escapeReplaceNoEncode, getEscapeReplacement);
    }
  }
  return html2;
}
var caret = /(^|[^\[])\^/g;
function edit(regex, opt) {
  let source = typeof regex === "string" ? regex : regex.source;
  opt = opt || "";
  const obj = {
    replace: (name, val) => {
      let valSource = typeof val === "string" ? val : val.source;
      valSource = valSource.replace(caret, "$1");
      source = source.replace(name, valSource);
      return obj;
    },
    getRegex: () => {
      return new RegExp(source, opt);
    }
  };
  return obj;
}
function cleanUrl(href) {
  try {
    href = encodeURI(href).replace(/%25/g, "%");
  } catch {
    return null;
  }
  return href;
}
var noopTest = { exec: () => null };
function splitCells(tableRow, count) {
  const row = tableRow.replace(/\|/g, (match, offset, str) => {
    let escaped = false;
    let curr = offset;
    while (--curr >= 0 && str[curr] === "\\")
      escaped = !escaped;
    if (escaped) {
      return "|";
    } else {
      return " |";
    }
  }), cells = row.split(/ \|/);
  let i = 0;
  if (!cells[0].trim()) {
    cells.shift();
  }
  if (cells.length > 0 && !cells[cells.length - 1].trim()) {
    cells.pop();
  }
  if (count) {
    if (cells.length > count) {
      cells.splice(count);
    } else {
      while (cells.length < count)
        cells.push("");
    }
  }
  for (; i < cells.length; i++) {
    cells[i] = cells[i].trim().replace(/\\\|/g, "|");
  }
  return cells;
}
function rtrim(str, c, invert) {
  const l = str.length;
  if (l === 0) {
    return "";
  }
  let suffLen = 0;
  while (suffLen < l) {
    const currChar = str.charAt(l - suffLen - 1);
    if (currChar === c && !invert) {
      suffLen++;
    } else if (currChar !== c && invert) {
      suffLen++;
    } else {
      break;
    }
  }
  return str.slice(0, l - suffLen);
}
function findClosingBracket(str, b) {
  if (str.indexOf(b[1]) === -1) {
    return -1;
  }
  let level = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\\") {
      i++;
    } else if (str[i] === b[0]) {
      level++;
    } else if (str[i] === b[1]) {
      level--;
      if (level < 0) {
        return i;
      }
    }
  }
  return -1;
}
function outputLink(cap, link2, raw, lexer2) {
  const href = link2.href;
  const title = link2.title ? escape$1(link2.title) : null;
  const text = cap[1].replace(/\\([\[\]])/g, "$1");
  if (cap[0].charAt(0) !== "!") {
    lexer2.state.inLink = true;
    const token = {
      type: "link",
      raw,
      href,
      title,
      text,
      tokens: lexer2.inlineTokens(text)
    };
    lexer2.state.inLink = false;
    return token;
  }
  return {
    type: "image",
    raw,
    href,
    title,
    text: escape$1(text)
  };
}
function indentCodeCompensation(raw, text) {
  const matchIndentToCode = raw.match(/^(\s+)(?:```)/);
  if (matchIndentToCode === null) {
    return text;
  }
  const indentToCode = matchIndentToCode[1];
  return text.split("\n").map((node) => {
    const matchIndentInNode = node.match(/^\s+/);
    if (matchIndentInNode === null) {
      return node;
    }
    const [indentInNode] = matchIndentInNode;
    if (indentInNode.length >= indentToCode.length) {
      return node.slice(indentToCode.length);
    }
    return node;
  }).join("\n");
}
var _Tokenizer = class {
  options;
  rules;
  // set by the lexer
  lexer;
  // set by the lexer
  constructor(options2) {
    this.options = options2 || _defaults;
  }
  space(src) {
    const cap = this.rules.block.newline.exec(src);
    if (cap && cap[0].length > 0) {
      return {
        type: "space",
        raw: cap[0]
      };
    }
  }
  code(src) {
    const cap = this.rules.block.code.exec(src);
    if (cap) {
      const text = cap[0].replace(/^(?: {1,4}| {0,3}\t)/gm, "");
      return {
        type: "code",
        raw: cap[0],
        codeBlockStyle: "indented",
        text: !this.options.pedantic ? rtrim(text, "\n") : text
      };
    }
  }
  fences(src) {
    const cap = this.rules.block.fences.exec(src);
    if (cap) {
      const raw = cap[0];
      const text = indentCodeCompensation(raw, cap[3] || "");
      return {
        type: "code",
        raw,
        lang: cap[2] ? cap[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : cap[2],
        text
      };
    }
  }
  heading(src) {
    const cap = this.rules.block.heading.exec(src);
    if (cap) {
      let text = cap[2].trim();
      if (/#$/.test(text)) {
        const trimmed = rtrim(text, "#");
        if (this.options.pedantic) {
          text = trimmed.trim();
        } else if (!trimmed || / $/.test(trimmed)) {
          text = trimmed.trim();
        }
      }
      return {
        type: "heading",
        raw: cap[0],
        depth: cap[1].length,
        text,
        tokens: this.lexer.inline(text)
      };
    }
  }
  hr(src) {
    const cap = this.rules.block.hr.exec(src);
    if (cap) {
      return {
        type: "hr",
        raw: rtrim(cap[0], "\n")
      };
    }
  }
  blockquote(src) {
    const cap = this.rules.block.blockquote.exec(src);
    if (cap) {
      let lines = rtrim(cap[0], "\n").split("\n");
      let raw = "";
      let text = "";
      const tokens = [];
      while (lines.length > 0) {
        let inBlockquote = false;
        const currentLines = [];
        let i;
        for (i = 0; i < lines.length; i++) {
          if (/^ {0,3}>/.test(lines[i])) {
            currentLines.push(lines[i]);
            inBlockquote = true;
          } else if (!inBlockquote) {
            currentLines.push(lines[i]);
          } else {
            break;
          }
        }
        lines = lines.slice(i);
        const currentRaw = currentLines.join("\n");
        const currentText = currentRaw.replace(/\n {0,3}((?:=+|-+) *)(?=\n|$)/g, "\n    $1").replace(/^ {0,3}>[ \t]?/gm, "");
        raw = raw ? `${raw}
${currentRaw}` : currentRaw;
        text = text ? `${text}
${currentText}` : currentText;
        const top = this.lexer.state.top;
        this.lexer.state.top = true;
        this.lexer.blockTokens(currentText, tokens, true);
        this.lexer.state.top = top;
        if (lines.length === 0) {
          break;
        }
        const lastToken = tokens[tokens.length - 1];
        if (lastToken?.type === "code") {
          break;
        } else if (lastToken?.type === "blockquote") {
          const oldToken = lastToken;
          const newText = oldToken.raw + "\n" + lines.join("\n");
          const newToken = this.blockquote(newText);
          tokens[tokens.length - 1] = newToken;
          raw = raw.substring(0, raw.length - oldToken.raw.length) + newToken.raw;
          text = text.substring(0, text.length - oldToken.text.length) + newToken.text;
          break;
        } else if (lastToken?.type === "list") {
          const oldToken = lastToken;
          const newText = oldToken.raw + "\n" + lines.join("\n");
          const newToken = this.list(newText);
          tokens[tokens.length - 1] = newToken;
          raw = raw.substring(0, raw.length - lastToken.raw.length) + newToken.raw;
          text = text.substring(0, text.length - oldToken.raw.length) + newToken.raw;
          lines = newText.substring(tokens[tokens.length - 1].raw.length).split("\n");
          continue;
        }
      }
      return {
        type: "blockquote",
        raw,
        tokens,
        text
      };
    }
  }
  list(src) {
    let cap = this.rules.block.list.exec(src);
    if (cap) {
      let bull = cap[1].trim();
      const isordered = bull.length > 1;
      const list2 = {
        type: "list",
        raw: "",
        ordered: isordered,
        start: isordered ? +bull.slice(0, -1) : "",
        loose: false,
        items: []
      };
      bull = isordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
      if (this.options.pedantic) {
        bull = isordered ? bull : "[*+-]";
      }
      const itemRegex = new RegExp(`^( {0,3}${bull})((?:[	 ][^\\n]*)?(?:\\n|$))`);
      let endsWithBlankLine = false;
      while (src) {
        let endEarly = false;
        let raw = "";
        let itemContents = "";
        if (!(cap = itemRegex.exec(src))) {
          break;
        }
        if (this.rules.block.hr.test(src)) {
          break;
        }
        raw = cap[0];
        src = src.substring(raw.length);
        let line = cap[2].split("\n", 1)[0].replace(/^\t+/, (t) => " ".repeat(3 * t.length));
        let nextLine = src.split("\n", 1)[0];
        let blankLine = !line.trim();
        let indent = 0;
        if (this.options.pedantic) {
          indent = 2;
          itemContents = line.trimStart();
        } else if (blankLine) {
          indent = cap[1].length + 1;
        } else {
          indent = cap[2].search(/[^ ]/);
          indent = indent > 4 ? 1 : indent;
          itemContents = line.slice(indent);
          indent += cap[1].length;
        }
        if (blankLine && /^[ \t]*$/.test(nextLine)) {
          raw += nextLine + "\n";
          src = src.substring(nextLine.length + 1);
          endEarly = true;
        }
        if (!endEarly) {
          const nextBulletRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`);
          const hrRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`);
          const fencesBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:\`\`\`|~~~)`);
          const headingBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}#`);
          const htmlBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}<(?:[a-z].*>|!--)`, "i");
          while (src) {
            const rawLine = src.split("\n", 1)[0];
            let nextLineWithoutTabs;
            nextLine = rawLine;
            if (this.options.pedantic) {
              nextLine = nextLine.replace(/^ {1,4}(?=( {4})*[^ ])/g, "  ");
              nextLineWithoutTabs = nextLine;
            } else {
              nextLineWithoutTabs = nextLine.replace(/\t/g, "    ");
            }
            if (fencesBeginRegex.test(nextLine)) {
              break;
            }
            if (headingBeginRegex.test(nextLine)) {
              break;
            }
            if (htmlBeginRegex.test(nextLine)) {
              break;
            }
            if (nextBulletRegex.test(nextLine)) {
              break;
            }
            if (hrRegex.test(nextLine)) {
              break;
            }
            if (nextLineWithoutTabs.search(/[^ ]/) >= indent || !nextLine.trim()) {
              itemContents += "\n" + nextLineWithoutTabs.slice(indent);
            } else {
              if (blankLine) {
                break;
              }
              if (line.replace(/\t/g, "    ").search(/[^ ]/) >= 4) {
                break;
              }
              if (fencesBeginRegex.test(line)) {
                break;
              }
              if (headingBeginRegex.test(line)) {
                break;
              }
              if (hrRegex.test(line)) {
                break;
              }
              itemContents += "\n" + nextLine;
            }
            if (!blankLine && !nextLine.trim()) {
              blankLine = true;
            }
            raw += rawLine + "\n";
            src = src.substring(rawLine.length + 1);
            line = nextLineWithoutTabs.slice(indent);
          }
        }
        if (!list2.loose) {
          if (endsWithBlankLine) {
            list2.loose = true;
          } else if (/\n[ \t]*\n[ \t]*$/.test(raw)) {
            endsWithBlankLine = true;
          }
        }
        let istask = null;
        let ischecked;
        if (this.options.gfm) {
          istask = /^\[[ xX]\] /.exec(itemContents);
          if (istask) {
            ischecked = istask[0] !== "[ ] ";
            itemContents = itemContents.replace(/^\[[ xX]\] +/, "");
          }
        }
        list2.items.push({
          type: "list_item",
          raw,
          task: !!istask,
          checked: ischecked,
          loose: false,
          text: itemContents,
          tokens: []
        });
        list2.raw += raw;
      }
      list2.items[list2.items.length - 1].raw = list2.items[list2.items.length - 1].raw.trimEnd();
      list2.items[list2.items.length - 1].text = list2.items[list2.items.length - 1].text.trimEnd();
      list2.raw = list2.raw.trimEnd();
      for (let i = 0; i < list2.items.length; i++) {
        this.lexer.state.top = false;
        list2.items[i].tokens = this.lexer.blockTokens(list2.items[i].text, []);
        if (!list2.loose) {
          const spacers = list2.items[i].tokens.filter((t) => t.type === "space");
          const hasMultipleLineBreaks = spacers.length > 0 && spacers.some((t) => /\n.*\n/.test(t.raw));
          list2.loose = hasMultipleLineBreaks;
        }
      }
      if (list2.loose) {
        for (let i = 0; i < list2.items.length; i++) {
          list2.items[i].loose = true;
        }
      }
      return list2;
    }
  }
  html(src) {
    const cap = this.rules.block.html.exec(src);
    if (cap) {
      const token = {
        type: "html",
        block: true,
        raw: cap[0],
        pre: cap[1] === "pre" || cap[1] === "script" || cap[1] === "style",
        text: cap[0]
      };
      return token;
    }
  }
  def(src) {
    const cap = this.rules.block.def.exec(src);
    if (cap) {
      const tag2 = cap[1].toLowerCase().replace(/\s+/g, " ");
      const href = cap[2] ? cap[2].replace(/^<(.*)>$/, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "";
      const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : cap[3];
      return {
        type: "def",
        tag: tag2,
        raw: cap[0],
        href,
        title
      };
    }
  }
  table(src) {
    const cap = this.rules.block.table.exec(src);
    if (!cap) {
      return;
    }
    if (!/[:|]/.test(cap[2])) {
      return;
    }
    const headers = splitCells(cap[1]);
    const aligns = cap[2].replace(/^\||\| *$/g, "").split("|");
    const rows = cap[3] && cap[3].trim() ? cap[3].replace(/\n[ \t]*$/, "").split("\n") : [];
    const item = {
      type: "table",
      raw: cap[0],
      header: [],
      align: [],
      rows: []
    };
    if (headers.length !== aligns.length) {
      return;
    }
    for (const align of aligns) {
      if (/^ *-+: *$/.test(align)) {
        item.align.push("right");
      } else if (/^ *:-+: *$/.test(align)) {
        item.align.push("center");
      } else if (/^ *:-+ *$/.test(align)) {
        item.align.push("left");
      } else {
        item.align.push(null);
      }
    }
    for (let i = 0; i < headers.length; i++) {
      item.header.push({
        text: headers[i],
        tokens: this.lexer.inline(headers[i]),
        header: true,
        align: item.align[i]
      });
    }
    for (const row of rows) {
      item.rows.push(splitCells(row, item.header.length).map((cell, i) => {
        return {
          text: cell,
          tokens: this.lexer.inline(cell),
          header: false,
          align: item.align[i]
        };
      }));
    }
    return item;
  }
  lheading(src) {
    const cap = this.rules.block.lheading.exec(src);
    if (cap) {
      return {
        type: "heading",
        raw: cap[0],
        depth: cap[2].charAt(0) === "=" ? 1 : 2,
        text: cap[1],
        tokens: this.lexer.inline(cap[1])
      };
    }
  }
  paragraph(src) {
    const cap = this.rules.block.paragraph.exec(src);
    if (cap) {
      const text = cap[1].charAt(cap[1].length - 1) === "\n" ? cap[1].slice(0, -1) : cap[1];
      return {
        type: "paragraph",
        raw: cap[0],
        text,
        tokens: this.lexer.inline(text)
      };
    }
  }
  text(src) {
    const cap = this.rules.block.text.exec(src);
    if (cap) {
      return {
        type: "text",
        raw: cap[0],
        text: cap[0],
        tokens: this.lexer.inline(cap[0])
      };
    }
  }
  escape(src) {
    const cap = this.rules.inline.escape.exec(src);
    if (cap) {
      return {
        type: "escape",
        raw: cap[0],
        text: escape$1(cap[1])
      };
    }
  }
  tag(src) {
    const cap = this.rules.inline.tag.exec(src);
    if (cap) {
      if (!this.lexer.state.inLink && /^<a /i.test(cap[0])) {
        this.lexer.state.inLink = true;
      } else if (this.lexer.state.inLink && /^<\/a>/i.test(cap[0])) {
        this.lexer.state.inLink = false;
      }
      if (!this.lexer.state.inRawBlock && /^<(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
        this.lexer.state.inRawBlock = true;
      } else if (this.lexer.state.inRawBlock && /^<\/(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
        this.lexer.state.inRawBlock = false;
      }
      return {
        type: "html",
        raw: cap[0],
        inLink: this.lexer.state.inLink,
        inRawBlock: this.lexer.state.inRawBlock,
        block: false,
        text: cap[0]
      };
    }
  }
  link(src) {
    const cap = this.rules.inline.link.exec(src);
    if (cap) {
      const trimmedUrl = cap[2].trim();
      if (!this.options.pedantic && /^</.test(trimmedUrl)) {
        if (!/>$/.test(trimmedUrl)) {
          return;
        }
        const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), "\\");
        if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) {
          return;
        }
      } else {
        const lastParenIndex = findClosingBracket(cap[2], "()");
        if (lastParenIndex > -1) {
          const start = cap[0].indexOf("!") === 0 ? 5 : 4;
          const linkLen = start + cap[1].length + lastParenIndex;
          cap[2] = cap[2].substring(0, lastParenIndex);
          cap[0] = cap[0].substring(0, linkLen).trim();
          cap[3] = "";
        }
      }
      let href = cap[2];
      let title = "";
      if (this.options.pedantic) {
        const link2 = /^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(href);
        if (link2) {
          href = link2[1];
          title = link2[3];
        }
      } else {
        title = cap[3] ? cap[3].slice(1, -1) : "";
      }
      href = href.trim();
      if (/^</.test(href)) {
        if (this.options.pedantic && !/>$/.test(trimmedUrl)) {
          href = href.slice(1);
        } else {
          href = href.slice(1, -1);
        }
      }
      return outputLink(cap, {
        href: href ? href.replace(this.rules.inline.anyPunctuation, "$1") : href,
        title: title ? title.replace(this.rules.inline.anyPunctuation, "$1") : title
      }, cap[0], this.lexer);
    }
  }
  reflink(src, links) {
    let cap;
    if ((cap = this.rules.inline.reflink.exec(src)) || (cap = this.rules.inline.nolink.exec(src))) {
      const linkString = (cap[2] || cap[1]).replace(/\s+/g, " ");
      const link2 = links[linkString.toLowerCase()];
      if (!link2) {
        const text = cap[0].charAt(0);
        return {
          type: "text",
          raw: text,
          text
        };
      }
      return outputLink(cap, link2, cap[0], this.lexer);
    }
  }
  emStrong(src, maskedSrc, prevChar = "") {
    let match = this.rules.inline.emStrongLDelim.exec(src);
    if (!match)
      return;
    if (match[3] && prevChar.match(/[\p{L}\p{N}]/u))
      return;
    const nextChar = match[1] || match[2] || "";
    if (!nextChar || !prevChar || this.rules.inline.punctuation.exec(prevChar)) {
      const lLength = [...match[0]].length - 1;
      let rDelim, rLength, delimTotal = lLength, midDelimTotal = 0;
      const endReg = match[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      endReg.lastIndex = 0;
      maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
      while ((match = endReg.exec(maskedSrc)) != null) {
        rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        if (!rDelim)
          continue;
        rLength = [...rDelim].length;
        if (match[3] || match[4]) {
          delimTotal += rLength;
          continue;
        } else if (match[5] || match[6]) {
          if (lLength % 3 && !((lLength + rLength) % 3)) {
            midDelimTotal += rLength;
            continue;
          }
        }
        delimTotal -= rLength;
        if (delimTotal > 0)
          continue;
        rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
        const lastCharLength = [...match[0]][0].length;
        const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
        if (Math.min(lLength, rLength) % 2) {
          const text2 = raw.slice(1, -1);
          return {
            type: "em",
            raw,
            text: text2,
            tokens: this.lexer.inlineTokens(text2)
          };
        }
        const text = raw.slice(2, -2);
        return {
          type: "strong",
          raw,
          text,
          tokens: this.lexer.inlineTokens(text)
        };
      }
    }
  }
  codespan(src) {
    const cap = this.rules.inline.code.exec(src);
    if (cap) {
      let text = cap[2].replace(/\n/g, " ");
      const hasNonSpaceChars = /[^ ]/.test(text);
      const hasSpaceCharsOnBothEnds = /^ /.test(text) && / $/.test(text);
      if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
        text = text.substring(1, text.length - 1);
      }
      text = escape$1(text, true);
      return {
        type: "codespan",
        raw: cap[0],
        text
      };
    }
  }
  br(src) {
    const cap = this.rules.inline.br.exec(src);
    if (cap) {
      return {
        type: "br",
        raw: cap[0]
      };
    }
  }
  del(src) {
    const cap = this.rules.inline.del.exec(src);
    if (cap) {
      return {
        type: "del",
        raw: cap[0],
        text: cap[2],
        tokens: this.lexer.inlineTokens(cap[2])
      };
    }
  }
  autolink(src) {
    const cap = this.rules.inline.autolink.exec(src);
    if (cap) {
      let text, href;
      if (cap[2] === "@") {
        text = escape$1(cap[1]);
        href = "mailto:" + text;
      } else {
        text = escape$1(cap[1]);
        href = text;
      }
      return {
        type: "link",
        raw: cap[0],
        text,
        href,
        tokens: [
          {
            type: "text",
            raw: text,
            text
          }
        ]
      };
    }
  }
  url(src) {
    let cap;
    if (cap = this.rules.inline.url.exec(src)) {
      let text, href;
      if (cap[2] === "@") {
        text = escape$1(cap[0]);
        href = "mailto:" + text;
      } else {
        let prevCapZero;
        do {
          prevCapZero = cap[0];
          cap[0] = this.rules.inline._backpedal.exec(cap[0])?.[0] ?? "";
        } while (prevCapZero !== cap[0]);
        text = escape$1(cap[0]);
        if (cap[1] === "www.") {
          href = "http://" + cap[0];
        } else {
          href = cap[0];
        }
      }
      return {
        type: "link",
        raw: cap[0],
        text,
        href,
        tokens: [
          {
            type: "text",
            raw: text,
            text
          }
        ]
      };
    }
  }
  inlineText(src) {
    const cap = this.rules.inline.text.exec(src);
    if (cap) {
      let text;
      if (this.lexer.state.inRawBlock) {
        text = cap[0];
      } else {
        text = escape$1(cap[0]);
      }
      return {
        type: "text",
        raw: cap[0],
        text
      };
    }
  }
};
var newline = /^(?:[ \t]*(?:\n|$))+/;
var blockCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var fences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var hr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var heading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var bullet = /(?:[*+-]|\d{1,9}[.)])/;
var lheading = edit(/^(?!bull |blockCode|fences|blockquote|heading|html)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html))+?)\n {0,3}(=+|-+) *(?:\n+|$)/).replace(/bull/g, bullet).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).getRegex();
var _paragraph = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var blockText = /^[^\n]+/;
var _blockLabel = /(?!\s*\])(?:\\.|[^\[\]\\])+/;
var def = edit(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", _blockLabel).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var list = edit(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, bullet).getRegex();
var _tag = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var _comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var html = edit("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", _comment).replace("tag", _tag).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var paragraph = edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
var blockquote = edit(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", paragraph).getRegex();
var blockNormal = {
  blockquote,
  code: blockCode,
  def,
  fences,
  heading,
  hr,
  html,
  lheading,
  list,
  newline,
  paragraph,
  table: noopTest,
  text: blockText
};
var gfmTable = edit("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
var blockGfm = {
  ...blockNormal,
  table: gfmTable,
  paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", gfmTable).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex()
};
var blockPedantic = {
  ...blockNormal,
  html: edit(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", _comment).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),
  def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
  heading: /^(#{1,6})(.*)(?:\n+|$)/,
  fences: noopTest,
  // fences not supported
  lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
  paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " *#{1,6} *[^\n]").replace("lheading", lheading).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex()
};
var escape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var inlineCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var br = /^( {2,}|\\)\n(?!\s*$)/;
var inlineText = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var _punctuation = "\\p{P}\\p{S}";
var punctuation = edit(/^((?![*_])[\spunctuation])/, "u").replace(/punctuation/g, _punctuation).getRegex();
var blockSkip = /\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g;
var emStrongLDelim = edit(/^(?:\*+(?:((?!\*)[punct])|[^\s*]))|^_+(?:((?!_)[punct])|([^\s_]))/, "u").replace(/punct/g, _punctuation).getRegex();
var emStrongRDelimAst = edit("^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)[punct](\\*+)(?=[\\s]|$)|[^punct\\s](\\*+)(?!\\*)(?=[punct\\s]|$)|(?!\\*)[punct\\s](\\*+)(?=[^punct\\s])|[\\s](\\*+)(?!\\*)(?=[punct])|(?!\\*)[punct](\\*+)(?!\\*)(?=[punct])|[^punct\\s](\\*+)(?=[^punct\\s])", "gu").replace(/punct/g, _punctuation).getRegex();
var emStrongRDelimUnd = edit("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)[punct](_+)(?=[\\s]|$)|[^punct\\s](_+)(?!_)(?=[punct\\s]|$)|(?!_)[punct\\s](_+)(?=[^punct\\s])|[\\s](_+)(?!_)(?=[punct])|(?!_)[punct](_+)(?!_)(?=[punct])", "gu").replace(/punct/g, _punctuation).getRegex();
var anyPunctuation = edit(/\\([punct])/, "gu").replace(/punct/g, _punctuation).getRegex();
var autolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var _inlineComment = edit(_comment).replace("(?:-->|$)", "-->").getRegex();
var tag = edit("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", _inlineComment).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var _inlineLabel = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/;
var link = edit(/^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/).replace("label", _inlineLabel).replace("href", /<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var reflink = edit(/^!?\[(label)\]\[(ref)\]/).replace("label", _inlineLabel).replace("ref", _blockLabel).getRegex();
var nolink = edit(/^!?\[(ref)\](?:\[\])?/).replace("ref", _blockLabel).getRegex();
var reflinkSearch = edit("reflink|nolink(?!\\()", "g").replace("reflink", reflink).replace("nolink", nolink).getRegex();
var inlineNormal = {
  _backpedal: noopTest,
  // only used for GFM url
  anyPunctuation,
  autolink,
  blockSkip,
  br,
  code: inlineCode,
  del: noopTest,
  emStrongLDelim,
  emStrongRDelimAst,
  emStrongRDelimUnd,
  escape,
  link,
  nolink,
  punctuation,
  reflink,
  reflinkSearch,
  tag,
  text: inlineText,
  url: noopTest
};
var inlinePedantic = {
  ...inlineNormal,
  link: edit(/^!?\[(label)\]\((.*?)\)/).replace("label", _inlineLabel).getRegex(),
  reflink: edit(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", _inlineLabel).getRegex()
};
var inlineGfm = {
  ...inlineNormal,
  escape: edit(escape).replace("])", "~|])").getRegex(),
  url: edit(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/, "i").replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),
  _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
  del: /^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,
  text: /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/
};
var inlineBreaks = {
  ...inlineGfm,
  br: edit(br).replace("{2,}", "*").getRegex(),
  text: edit(inlineGfm.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex()
};
var block = {
  normal: blockNormal,
  gfm: blockGfm,
  pedantic: blockPedantic
};
var inline = {
  normal: inlineNormal,
  gfm: inlineGfm,
  breaks: inlineBreaks,
  pedantic: inlinePedantic
};
var _Lexer = class __Lexer {
  tokens;
  options;
  state;
  tokenizer;
  inlineQueue;
  constructor(options2) {
    this.tokens = [];
    this.tokens.links = /* @__PURE__ */ Object.create(null);
    this.options = options2 || _defaults;
    this.options.tokenizer = this.options.tokenizer || new _Tokenizer();
    this.tokenizer = this.options.tokenizer;
    this.tokenizer.options = this.options;
    this.tokenizer.lexer = this;
    this.inlineQueue = [];
    this.state = {
      inLink: false,
      inRawBlock: false,
      top: true
    };
    const rules = {
      block: block.normal,
      inline: inline.normal
    };
    if (this.options.pedantic) {
      rules.block = block.pedantic;
      rules.inline = inline.pedantic;
    } else if (this.options.gfm) {
      rules.block = block.gfm;
      if (this.options.breaks) {
        rules.inline = inline.breaks;
      } else {
        rules.inline = inline.gfm;
      }
    }
    this.tokenizer.rules = rules;
  }
  /**
   * Expose Rules
   */
  static get rules() {
    return {
      block,
      inline
    };
  }
  /**
   * Static Lex Method
   */
  static lex(src, options2) {
    const lexer2 = new __Lexer(options2);
    return lexer2.lex(src);
  }
  /**
   * Static Lex Inline Method
   */
  static lexInline(src, options2) {
    const lexer2 = new __Lexer(options2);
    return lexer2.inlineTokens(src);
  }
  /**
   * Preprocessing
   */
  lex(src) {
    src = src.replace(/\r\n|\r/g, "\n");
    this.blockTokens(src, this.tokens);
    for (let i = 0; i < this.inlineQueue.length; i++) {
      const next = this.inlineQueue[i];
      this.inlineTokens(next.src, next.tokens);
    }
    this.inlineQueue = [];
    return this.tokens;
  }
  blockTokens(src, tokens = [], lastParagraphClipped = false) {
    if (this.options.pedantic) {
      src = src.replace(/\t/g, "    ").replace(/^ +$/gm, "");
    }
    let token;
    let lastToken;
    let cutSrc;
    while (src) {
      if (this.options.extensions && this.options.extensions.block && this.options.extensions.block.some((extTokenizer) => {
        if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          return true;
        }
        return false;
      })) {
        continue;
      }
      if (token = this.tokenizer.space(src)) {
        src = src.substring(token.raw.length);
        if (token.raw.length === 1 && tokens.length > 0) {
          tokens[tokens.length - 1].raw += "\n";
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.code(src)) {
        src = src.substring(token.raw.length);
        lastToken = tokens[tokens.length - 1];
        if (lastToken && (lastToken.type === "paragraph" || lastToken.type === "text")) {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.fences(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.heading(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.hr(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.blockquote(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.list(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.html(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.def(src)) {
        src = src.substring(token.raw.length);
        lastToken = tokens[tokens.length - 1];
        if (lastToken && (lastToken.type === "paragraph" || lastToken.type === "text")) {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.raw;
          this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
        } else if (!this.tokens.links[token.tag]) {
          this.tokens.links[token.tag] = {
            href: token.href,
            title: token.title
          };
        }
        continue;
      }
      if (token = this.tokenizer.table(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.lheading(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      cutSrc = src;
      if (this.options.extensions && this.options.extensions.startBlock) {
        let startIndex = Infinity;
        const tempSrc = src.slice(1);
        let tempStart;
        this.options.extensions.startBlock.forEach((getStartIndex) => {
          tempStart = getStartIndex.call({ lexer: this }, tempSrc);
          if (typeof tempStart === "number" && tempStart >= 0) {
            startIndex = Math.min(startIndex, tempStart);
          }
        });
        if (startIndex < Infinity && startIndex >= 0) {
          cutSrc = src.substring(0, startIndex + 1);
        }
      }
      if (this.state.top && (token = this.tokenizer.paragraph(cutSrc))) {
        lastToken = tokens[tokens.length - 1];
        if (lastParagraphClipped && lastToken?.type === "paragraph") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue.pop();
          this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
        } else {
          tokens.push(token);
        }
        lastParagraphClipped = cutSrc.length !== src.length;
        src = src.substring(token.raw.length);
        continue;
      }
      if (token = this.tokenizer.text(src)) {
        src = src.substring(token.raw.length);
        lastToken = tokens[tokens.length - 1];
        if (lastToken && lastToken.type === "text") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue.pop();
          this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (src) {
        const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
        if (this.options.silent) {
          console.error(errMsg);
          break;
        } else {
          throw new Error(errMsg);
        }
      }
    }
    this.state.top = true;
    return tokens;
  }
  inline(src, tokens = []) {
    this.inlineQueue.push({ src, tokens });
    return tokens;
  }
  /**
   * Lexing/Compiling
   */
  inlineTokens(src, tokens = []) {
    let token, lastToken, cutSrc;
    let maskedSrc = src;
    let match;
    let keepPrevChar, prevChar;
    if (this.tokens.links) {
      const links = Object.keys(this.tokens.links);
      if (links.length > 0) {
        while ((match = this.tokenizer.rules.inline.reflinkSearch.exec(maskedSrc)) != null) {
          if (links.includes(match[0].slice(match[0].lastIndexOf("[") + 1, -1))) {
            maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex);
          }
        }
      }
    }
    while ((match = this.tokenizer.rules.inline.blockSkip.exec(maskedSrc)) != null) {
      maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    }
    while ((match = this.tokenizer.rules.inline.anyPunctuation.exec(maskedSrc)) != null) {
      maskedSrc = maskedSrc.slice(0, match.index) + "++" + maskedSrc.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    }
    while (src) {
      if (!keepPrevChar) {
        prevChar = "";
      }
      keepPrevChar = false;
      if (this.options.extensions && this.options.extensions.inline && this.options.extensions.inline.some((extTokenizer) => {
        if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          return true;
        }
        return false;
      })) {
        continue;
      }
      if (token = this.tokenizer.escape(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.tag(src)) {
        src = src.substring(token.raw.length);
        lastToken = tokens[tokens.length - 1];
        if (lastToken && token.type === "text" && lastToken.type === "text") {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.link(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.reflink(src, this.tokens.links)) {
        src = src.substring(token.raw.length);
        lastToken = tokens[tokens.length - 1];
        if (lastToken && token.type === "text" && lastToken.type === "text") {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.emStrong(src, maskedSrc, prevChar)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.codespan(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.br(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.del(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.autolink(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (!this.state.inLink && (token = this.tokenizer.url(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      cutSrc = src;
      if (this.options.extensions && this.options.extensions.startInline) {
        let startIndex = Infinity;
        const tempSrc = src.slice(1);
        let tempStart;
        this.options.extensions.startInline.forEach((getStartIndex) => {
          tempStart = getStartIndex.call({ lexer: this }, tempSrc);
          if (typeof tempStart === "number" && tempStart >= 0) {
            startIndex = Math.min(startIndex, tempStart);
          }
        });
        if (startIndex < Infinity && startIndex >= 0) {
          cutSrc = src.substring(0, startIndex + 1);
        }
      }
      if (token = this.tokenizer.inlineText(cutSrc)) {
        src = src.substring(token.raw.length);
        if (token.raw.slice(-1) !== "_") {
          prevChar = token.raw.slice(-1);
        }
        keepPrevChar = true;
        lastToken = tokens[tokens.length - 1];
        if (lastToken && lastToken.type === "text") {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (src) {
        const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
        if (this.options.silent) {
          console.error(errMsg);
          break;
        } else {
          throw new Error(errMsg);
        }
      }
    }
    return tokens;
  }
};
var _Renderer = class {
  options;
  parser;
  // set by the parser
  constructor(options2) {
    this.options = options2 || _defaults;
  }
  space(token) {
    return "";
  }
  code({ text, lang, escaped }) {
    const langString = (lang || "").match(/^\S*/)?.[0];
    const code = text.replace(/\n$/, "") + "\n";
    if (!langString) {
      return "<pre><code>" + (escaped ? code : escape$1(code, true)) + "</code></pre>\n";
    }
    return '<pre><code class="language-' + escape$1(langString) + '">' + (escaped ? code : escape$1(code, true)) + "</code></pre>\n";
  }
  blockquote({ tokens }) {
    const body = this.parser.parse(tokens);
    return `<blockquote>
${body}</blockquote>
`;
  }
  html({ text }) {
    return text;
  }
  heading({ tokens, depth }) {
    return `<h${depth}>${this.parser.parseInline(tokens)}</h${depth}>
`;
  }
  hr(token) {
    return "<hr>\n";
  }
  list(token) {
    const ordered = token.ordered;
    const start = token.start;
    let body = "";
    for (let j = 0; j < token.items.length; j++) {
      const item = token.items[j];
      body += this.listitem(item);
    }
    const type = ordered ? "ol" : "ul";
    const startAttr = ordered && start !== 1 ? ' start="' + start + '"' : "";
    return "<" + type + startAttr + ">\n" + body + "</" + type + ">\n";
  }
  listitem(item) {
    let itemBody = "";
    if (item.task) {
      const checkbox = this.checkbox({ checked: !!item.checked });
      if (item.loose) {
        if (item.tokens.length > 0 && item.tokens[0].type === "paragraph") {
          item.tokens[0].text = checkbox + " " + item.tokens[0].text;
          if (item.tokens[0].tokens && item.tokens[0].tokens.length > 0 && item.tokens[0].tokens[0].type === "text") {
            item.tokens[0].tokens[0].text = checkbox + " " + item.tokens[0].tokens[0].text;
          }
        } else {
          item.tokens.unshift({
            type: "text",
            raw: checkbox + " ",
            text: checkbox + " "
          });
        }
      } else {
        itemBody += checkbox + " ";
      }
    }
    itemBody += this.parser.parse(item.tokens, !!item.loose);
    return `<li>${itemBody}</li>
`;
  }
  checkbox({ checked }) {
    return "<input " + (checked ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
  }
  paragraph({ tokens }) {
    return `<p>${this.parser.parseInline(tokens)}</p>
`;
  }
  table(token) {
    let header = "";
    let cell = "";
    for (let j = 0; j < token.header.length; j++) {
      cell += this.tablecell(token.header[j]);
    }
    header += this.tablerow({ text: cell });
    let body = "";
    for (let j = 0; j < token.rows.length; j++) {
      const row = token.rows[j];
      cell = "";
      for (let k = 0; k < row.length; k++) {
        cell += this.tablecell(row[k]);
      }
      body += this.tablerow({ text: cell });
    }
    if (body)
      body = `<tbody>${body}</tbody>`;
    return "<table>\n<thead>\n" + header + "</thead>\n" + body + "</table>\n";
  }
  tablerow({ text }) {
    return `<tr>
${text}</tr>
`;
  }
  tablecell(token) {
    const content = this.parser.parseInline(token.tokens);
    const type = token.header ? "th" : "td";
    const tag2 = token.align ? `<${type} align="${token.align}">` : `<${type}>`;
    return tag2 + content + `</${type}>
`;
  }
  /**
   * span level renderer
   */
  strong({ tokens }) {
    return `<strong>${this.parser.parseInline(tokens)}</strong>`;
  }
  em({ tokens }) {
    return `<em>${this.parser.parseInline(tokens)}</em>`;
  }
  codespan({ text }) {
    return `<code>${text}</code>`;
  }
  br(token) {
    return "<br>";
  }
  del({ tokens }) {
    return `<del>${this.parser.parseInline(tokens)}</del>`;
  }
  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const cleanHref = cleanUrl(href);
    if (cleanHref === null) {
      return text;
    }
    href = cleanHref;
    let out = '<a href="' + href + '"';
    if (title) {
      out += ' title="' + title + '"';
    }
    out += ">" + text + "</a>";
    return out;
  }
  image({ href, title, text }) {
    const cleanHref = cleanUrl(href);
    if (cleanHref === null) {
      return text;
    }
    href = cleanHref;
    let out = `<img src="${href}" alt="${text}"`;
    if (title) {
      out += ` title="${title}"`;
    }
    out += ">";
    return out;
  }
  text(token) {
    return "tokens" in token && token.tokens ? this.parser.parseInline(token.tokens) : token.text;
  }
};
var _TextRenderer = class {
  // no need for block level renderers
  strong({ text }) {
    return text;
  }
  em({ text }) {
    return text;
  }
  codespan({ text }) {
    return text;
  }
  del({ text }) {
    return text;
  }
  html({ text }) {
    return text;
  }
  text({ text }) {
    return text;
  }
  link({ text }) {
    return "" + text;
  }
  image({ text }) {
    return "" + text;
  }
  br() {
    return "";
  }
};
var _Parser = class __Parser {
  options;
  renderer;
  textRenderer;
  constructor(options2) {
    this.options = options2 || _defaults;
    this.options.renderer = this.options.renderer || new _Renderer();
    this.renderer = this.options.renderer;
    this.renderer.options = this.options;
    this.renderer.parser = this;
    this.textRenderer = new _TextRenderer();
  }
  /**
   * Static Parse Method
   */
  static parse(tokens, options2) {
    const parser2 = new __Parser(options2);
    return parser2.parse(tokens);
  }
  /**
   * Static Parse Inline Method
   */
  static parseInline(tokens, options2) {
    const parser2 = new __Parser(options2);
    return parser2.parseInline(tokens);
  }
  /**
   * Parse Loop
   */
  parse(tokens, top = true) {
    let out = "";
    for (let i = 0; i < tokens.length; i++) {
      const anyToken = tokens[i];
      if (this.options.extensions && this.options.extensions.renderers && this.options.extensions.renderers[anyToken.type]) {
        const genericToken = anyToken;
        const ret = this.options.extensions.renderers[genericToken.type].call({ parser: this }, genericToken);
        if (ret !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "paragraph", "text"].includes(genericToken.type)) {
          out += ret || "";
          continue;
        }
      }
      const token = anyToken;
      switch (token.type) {
        case "space": {
          out += this.renderer.space(token);
          continue;
        }
        case "hr": {
          out += this.renderer.hr(token);
          continue;
        }
        case "heading": {
          out += this.renderer.heading(token);
          continue;
        }
        case "code": {
          out += this.renderer.code(token);
          continue;
        }
        case "table": {
          out += this.renderer.table(token);
          continue;
        }
        case "blockquote": {
          out += this.renderer.blockquote(token);
          continue;
        }
        case "list": {
          out += this.renderer.list(token);
          continue;
        }
        case "html": {
          out += this.renderer.html(token);
          continue;
        }
        case "paragraph": {
          out += this.renderer.paragraph(token);
          continue;
        }
        case "text": {
          let textToken = token;
          let body = this.renderer.text(textToken);
          while (i + 1 < tokens.length && tokens[i + 1].type === "text") {
            textToken = tokens[++i];
            body += "\n" + this.renderer.text(textToken);
          }
          if (top) {
            out += this.renderer.paragraph({
              type: "paragraph",
              raw: body,
              text: body,
              tokens: [{ type: "text", raw: body, text: body }]
            });
          } else {
            out += body;
          }
          continue;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          if (this.options.silent) {
            console.error(errMsg);
            return "";
          } else {
            throw new Error(errMsg);
          }
        }
      }
    }
    return out;
  }
  /**
   * Parse Inline Tokens
   */
  parseInline(tokens, renderer) {
    renderer = renderer || this.renderer;
    let out = "";
    for (let i = 0; i < tokens.length; i++) {
      const anyToken = tokens[i];
      if (this.options.extensions && this.options.extensions.renderers && this.options.extensions.renderers[anyToken.type]) {
        const ret = this.options.extensions.renderers[anyToken.type].call({ parser: this }, anyToken);
        if (ret !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(anyToken.type)) {
          out += ret || "";
          continue;
        }
      }
      const token = anyToken;
      switch (token.type) {
        case "escape": {
          out += renderer.text(token);
          break;
        }
        case "html": {
          out += renderer.html(token);
          break;
        }
        case "link": {
          out += renderer.link(token);
          break;
        }
        case "image": {
          out += renderer.image(token);
          break;
        }
        case "strong": {
          out += renderer.strong(token);
          break;
        }
        case "em": {
          out += renderer.em(token);
          break;
        }
        case "codespan": {
          out += renderer.codespan(token);
          break;
        }
        case "br": {
          out += renderer.br(token);
          break;
        }
        case "del": {
          out += renderer.del(token);
          break;
        }
        case "text": {
          out += renderer.text(token);
          break;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          if (this.options.silent) {
            console.error(errMsg);
            return "";
          } else {
            throw new Error(errMsg);
          }
        }
      }
    }
    return out;
  }
};
var _Hooks = class {
  options;
  block;
  constructor(options2) {
    this.options = options2 || _defaults;
  }
  static passThroughHooks = /* @__PURE__ */ new Set([
    "preprocess",
    "postprocess",
    "processAllTokens"
  ]);
  /**
   * Process markdown before marked
   */
  preprocess(markdown) {
    return markdown;
  }
  /**
   * Process HTML after marked is finished
   */
  postprocess(html2) {
    return html2;
  }
  /**
   * Process all tokens before walk tokens
   */
  processAllTokens(tokens) {
    return tokens;
  }
  /**
   * Provide function to tokenize markdown
   */
  provideLexer() {
    return this.block ? _Lexer.lex : _Lexer.lexInline;
  }
  /**
   * Provide function to parse tokens
   */
  provideParser() {
    return this.block ? _Parser.parse : _Parser.parseInline;
  }
};
var Marked = class {
  defaults = _getDefaults();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = _Parser;
  Renderer = _Renderer;
  TextRenderer = _TextRenderer;
  Lexer = _Lexer;
  Tokenizer = _Tokenizer;
  Hooks = _Hooks;
  constructor(...args) {
    this.use(...args);
  }
  /**
   * Run callback for every token
   */
  walkTokens(tokens, callback) {
    let values = [];
    for (const token of tokens) {
      values = values.concat(callback.call(this, token));
      switch (token.type) {
        case "table": {
          const tableToken = token;
          for (const cell of tableToken.header) {
            values = values.concat(this.walkTokens(cell.tokens, callback));
          }
          for (const row of tableToken.rows) {
            for (const cell of row) {
              values = values.concat(this.walkTokens(cell.tokens, callback));
            }
          }
          break;
        }
        case "list": {
          const listToken = token;
          values = values.concat(this.walkTokens(listToken.items, callback));
          break;
        }
        default: {
          const genericToken = token;
          if (this.defaults.extensions?.childTokens?.[genericToken.type]) {
            this.defaults.extensions.childTokens[genericToken.type].forEach((childTokens) => {
              const tokens2 = genericToken[childTokens].flat(Infinity);
              values = values.concat(this.walkTokens(tokens2, callback));
            });
          } else if (genericToken.tokens) {
            values = values.concat(this.walkTokens(genericToken.tokens, callback));
          }
        }
      }
    }
    return values;
  }
  use(...args) {
    const extensions = this.defaults.extensions || { renderers: {}, childTokens: {} };
    args.forEach((pack) => {
      const opts = { ...pack };
      opts.async = this.defaults.async || opts.async || false;
      if (pack.extensions) {
        pack.extensions.forEach((ext) => {
          if (!ext.name) {
            throw new Error("extension name required");
          }
          if ("renderer" in ext) {
            const prevRenderer = extensions.renderers[ext.name];
            if (prevRenderer) {
              extensions.renderers[ext.name] = function(...args2) {
                let ret = ext.renderer.apply(this, args2);
                if (ret === false) {
                  ret = prevRenderer.apply(this, args2);
                }
                return ret;
              };
            } else {
              extensions.renderers[ext.name] = ext.renderer;
            }
          }
          if ("tokenizer" in ext) {
            if (!ext.level || ext.level !== "block" && ext.level !== "inline") {
              throw new Error("extension level must be 'block' or 'inline'");
            }
            const extLevel = extensions[ext.level];
            if (extLevel) {
              extLevel.unshift(ext.tokenizer);
            } else {
              extensions[ext.level] = [ext.tokenizer];
            }
            if (ext.start) {
              if (ext.level === "block") {
                if (extensions.startBlock) {
                  extensions.startBlock.push(ext.start);
                } else {
                  extensions.startBlock = [ext.start];
                }
              } else if (ext.level === "inline") {
                if (extensions.startInline) {
                  extensions.startInline.push(ext.start);
                } else {
                  extensions.startInline = [ext.start];
                }
              }
            }
          }
          if ("childTokens" in ext && ext.childTokens) {
            extensions.childTokens[ext.name] = ext.childTokens;
          }
        });
        opts.extensions = extensions;
      }
      if (pack.renderer) {
        const renderer = this.defaults.renderer || new _Renderer(this.defaults);
        for (const prop in pack.renderer) {
          if (!(prop in renderer)) {
            throw new Error(`renderer '${prop}' does not exist`);
          }
          if (["options", "parser"].includes(prop)) {
            continue;
          }
          const rendererProp = prop;
          const rendererFunc = pack.renderer[rendererProp];
          const prevRenderer = renderer[rendererProp];
          renderer[rendererProp] = (...args2) => {
            let ret = rendererFunc.apply(renderer, args2);
            if (ret === false) {
              ret = prevRenderer.apply(renderer, args2);
            }
            return ret || "";
          };
        }
        opts.renderer = renderer;
      }
      if (pack.tokenizer) {
        const tokenizer = this.defaults.tokenizer || new _Tokenizer(this.defaults);
        for (const prop in pack.tokenizer) {
          if (!(prop in tokenizer)) {
            throw new Error(`tokenizer '${prop}' does not exist`);
          }
          if (["options", "rules", "lexer"].includes(prop)) {
            continue;
          }
          const tokenizerProp = prop;
          const tokenizerFunc = pack.tokenizer[tokenizerProp];
          const prevTokenizer = tokenizer[tokenizerProp];
          tokenizer[tokenizerProp] = (...args2) => {
            let ret = tokenizerFunc.apply(tokenizer, args2);
            if (ret === false) {
              ret = prevTokenizer.apply(tokenizer, args2);
            }
            return ret;
          };
        }
        opts.tokenizer = tokenizer;
      }
      if (pack.hooks) {
        const hooks = this.defaults.hooks || new _Hooks();
        for (const prop in pack.hooks) {
          if (!(prop in hooks)) {
            throw new Error(`hook '${prop}' does not exist`);
          }
          if (["options", "block"].includes(prop)) {
            continue;
          }
          const hooksProp = prop;
          const hooksFunc = pack.hooks[hooksProp];
          const prevHook = hooks[hooksProp];
          if (_Hooks.passThroughHooks.has(prop)) {
            hooks[hooksProp] = (arg) => {
              if (this.defaults.async) {
                return Promise.resolve(hooksFunc.call(hooks, arg)).then((ret2) => {
                  return prevHook.call(hooks, ret2);
                });
              }
              const ret = hooksFunc.call(hooks, arg);
              return prevHook.call(hooks, ret);
            };
          } else {
            hooks[hooksProp] = (...args2) => {
              let ret = hooksFunc.apply(hooks, args2);
              if (ret === false) {
                ret = prevHook.apply(hooks, args2);
              }
              return ret;
            };
          }
        }
        opts.hooks = hooks;
      }
      if (pack.walkTokens) {
        const walkTokens2 = this.defaults.walkTokens;
        const packWalktokens = pack.walkTokens;
        opts.walkTokens = function(token) {
          let values = [];
          values.push(packWalktokens.call(this, token));
          if (walkTokens2) {
            values = values.concat(walkTokens2.call(this, token));
          }
          return values;
        };
      }
      this.defaults = { ...this.defaults, ...opts };
    });
    return this;
  }
  setOptions(opt) {
    this.defaults = { ...this.defaults, ...opt };
    return this;
  }
  lexer(src, options2) {
    return _Lexer.lex(src, options2 ?? this.defaults);
  }
  parser(tokens, options2) {
    return _Parser.parse(tokens, options2 ?? this.defaults);
  }
  parseMarkdown(blockType) {
    const parse2 = (src, options2) => {
      const origOpt = { ...options2 };
      const opt = { ...this.defaults, ...origOpt };
      const throwError = this.onError(!!opt.silent, !!opt.async);
      if (this.defaults.async === true && origOpt.async === false) {
        return throwError(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      }
      if (typeof src === "undefined" || src === null) {
        return throwError(new Error("marked(): input parameter is undefined or null"));
      }
      if (typeof src !== "string") {
        return throwError(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(src) + ", string expected"));
      }
      if (opt.hooks) {
        opt.hooks.options = opt;
        opt.hooks.block = blockType;
      }
      const lexer2 = opt.hooks ? opt.hooks.provideLexer() : blockType ? _Lexer.lex : _Lexer.lexInline;
      const parser2 = opt.hooks ? opt.hooks.provideParser() : blockType ? _Parser.parse : _Parser.parseInline;
      if (opt.async) {
        return Promise.resolve(opt.hooks ? opt.hooks.preprocess(src) : src).then((src2) => lexer2(src2, opt)).then((tokens) => opt.hooks ? opt.hooks.processAllTokens(tokens) : tokens).then((tokens) => opt.walkTokens ? Promise.all(this.walkTokens(tokens, opt.walkTokens)).then(() => tokens) : tokens).then((tokens) => parser2(tokens, opt)).then((html2) => opt.hooks ? opt.hooks.postprocess(html2) : html2).catch(throwError);
      }
      try {
        if (opt.hooks) {
          src = opt.hooks.preprocess(src);
        }
        let tokens = lexer2(src, opt);
        if (opt.hooks) {
          tokens = opt.hooks.processAllTokens(tokens);
        }
        if (opt.walkTokens) {
          this.walkTokens(tokens, opt.walkTokens);
        }
        let html2 = parser2(tokens, opt);
        if (opt.hooks) {
          html2 = opt.hooks.postprocess(html2);
        }
        return html2;
      } catch (e) {
        return throwError(e);
      }
    };
    return parse2;
  }
  onError(silent, async) {
    return (e) => {
      e.message += "\nPlease report this to https://github.com/markedjs/marked.";
      if (silent) {
        const msg = "<p>An error occurred:</p><pre>" + escape$1(e.message + "", true) + "</pre>";
        if (async) {
          return Promise.resolve(msg);
        }
        return msg;
      }
      if (async) {
        return Promise.reject(e);
      }
      throw e;
    };
  }
};
var markedInstance = new Marked();
function marked(src, opt) {
  return markedInstance.parse(src, opt);
}
marked.options = marked.setOptions = function(options2) {
  markedInstance.setOptions(options2);
  marked.defaults = markedInstance.defaults;
  changeDefaults(marked.defaults);
  return marked;
};
marked.getDefaults = _getDefaults;
marked.defaults = _defaults;
marked.use = function(...args) {
  markedInstance.use(...args);
  marked.defaults = markedInstance.defaults;
  changeDefaults(marked.defaults);
  return marked;
};
marked.walkTokens = function(tokens, callback) {
  return markedInstance.walkTokens(tokens, callback);
};
marked.parseInline = markedInstance.parseInline;
marked.Parser = _Parser;
marked.parser = _Parser.parse;
marked.Renderer = _Renderer;
marked.TextRenderer = _TextRenderer;
marked.Lexer = _Lexer;
marked.lexer = _Lexer.lex;
marked.Tokenizer = _Tokenizer;
marked.Hooks = _Hooks;
marked.parse = marked;
var options = marked.options;
var setOptions = marked.setOptions;
var use = marked.use;
var walkTokens = marked.walkTokens;
var parseInline = marked.parseInline;
var parser = _Parser.parse;
var lexer = _Lexer.lex;

// packages/silo-core/lib/sync/sync-content.ts
var baseOf = (gmt) => gmt.replace(" ", "T");
function seoInput(seo) {
  if (!seo) return {};
  const title = seo.title.trim();
  const description = seo.description.trim();
  const kws = focusKeywords(seo);
  return {
    ...title ? { seoTitle: title } : {},
    ...description ? { seoDescription: description } : {},
    ...kws.length ? { focusKeyword: kws[0], keywords: kws.slice(1) } : {}
  };
}
var hasSeoFields = (input) => input.seoTitle !== void 0 || input.seoDescription !== void 0 || input.focusKeyword !== void 0;
function describeSeoFailure(e) {
  const body = e instanceof WpHttpError ? e.body : void 0;
  const noPlugin = body?.data?.errors?.some((err) => err.code === "no_seo_plugin") || e instanceof WpHttpError && /no SEO plugin/i.test(e.message);
  if (noPlugin) return "\u7AD9\u70B9\u672A\u5B89\u88C5\u6216\u672A\u542F\u7528 Rank Math/Yoast\uFF0CSEO \u5B57\u6BB5\u672A\u5199\u5165";
  return `SEO \u5B57\u6BB5\u5199\u5165\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`;
}
async function syncContent(client2, ws, item, opts = {}) {
  const { force = false, syncCategories: syncCategories2 = true, seoBestEffort = false } = opts;
  try {
    let remote;
    if (item.wpPostId) {
      remote = await client2.getBlocks(item.wpPostId);
      if (!force) {
        if (item.lastModifiedRemote && remote.baseModified !== baseOf(item.lastModifiedRemote)) {
          return { ok: false, conflict: true, reason: "modified", remoteModified: remote.baseModified };
        }
        if (remote.status === "publish") {
          return { ok: false, conflict: true, reason: "published" };
        }
      }
    }
    const markdown = opts.resolveContent ? await opts.resolveContent(item) : opts.content;
    const body = markdown?.trim() ? markdown : void 0;
    if (body && remote?.editor) {
      return {
        ok: false,
        conflict: false,
        error: "\u8FD9\u7BC7\u5728 WordPress \u91CC\u662F\u7528\u522B\u7684\u7F16\u8F91\u5668\u505A\u7684\uFF0C\u63A8\u9001\u6B63\u6587\u4F1A\u6BC1\u6389\u5B83\u7684\u6392\u7248\uFF0C\u5DF2\u8DF3\u8FC7\u3002\u8BF7\u5728 WordPress \u7F16\u8F91\u5668\u91CC\u6539\uFF0C\u6216\u6E05\u7A7A\u8FD9\u7BC7\u7B14\u8BB0\u7684\u6B63\u6587\u53EA\u63A8\u9001 SEO \u548C\u5206\u7C7B\u3002"
      };
    }
    const taxonomyRestBase = client2.taxRestBaseFor(item.postType) ?? taxonomyForNode(ws, item.siloNodeId);
    let termIds;
    let categories;
    if (syncCategories2 && taxonomyRestBase) {
      const home = await resolvePlacementTerm(client2, ws, item.siloNodeId, taxonomyRestBase);
      const known = item.termIds ?? [];
      const merged = home && !known.includes(home.id) ? [...known, home.id] : known;
      if (merged.length) {
        termIds = merged;
        const slugs = [];
        for (const id of merged) {
          const slug = home && id === home.id ? home.slug : await client2.termSlug(taxonomyRestBase, id);
          if (slug && !slugs.includes(slug)) slugs.push(slug);
        }
        if (slugs.length) categories = slugs;
      }
    }
    const seo = seoInput(item.seo);
    let pushed;
    let seoWarning;
    if (!item.wpPostId) {
      const input = {
        type: item.postType,
        title: item.title,
        ...item.slug ? { slug: item.slug } : {},
        ...body ? { blocks: [{ type: "prose", markdown: body }] } : {},
        ...categories ? { categories } : {},
        ...seo
      };
      try {
        pushed = await client2.createPost(input);
      } catch (e) {
        if (!seoBestEffort || !hasSeoFields(seo) || !(e instanceof WpHttpError) || e.code !== "invalid_seo") throw e;
        seoWarning = describeSeoFailure(e);
        const { seoTitle: _t, seoDescription: _d, focusKeyword: _f, keywords: _k, ...rest } = input;
        pushed = await client2.createPost(rest);
      }
    } else {
      const id = item.wpPostId;
      let bm = remote.baseModified;
      if (body) {
        const r = await client2.updateBody({ id, baseModified: bm, blocks: [{ type: "prose", markdown: body }] });
        bm = r.baseModified;
      }
      const seoCall = {
        id,
        baseModified: bm,
        title: item.title,
        ...item.slug ? { slug: item.slug } : {},
        ...categories ? { categories } : {},
        ...seo
      };
      try {
        pushed = await client2.updateSeo(seoCall);
      } catch (e) {
        if (!seoBestEffort || !hasSeoFields(seo) || !(e instanceof WpHttpError) || e.code !== "invalid_seo") throw e;
        seoWarning = describeSeoFailure(e);
        const { seoTitle: _t, seoDescription: _d, focusKeyword: _f, keywords: _k, ...rest } = seoCall;
        try {
          pushed = await client2.updateSeo(rest);
        } catch (retry) {
          if (!body || !(retry instanceof WpHttpError) || retry.code !== "invalid_seo") throw retry;
          seoWarning = describeSeoFailure(retry);
          return {
            ok: true,
            seoWarning,
            patch: { wpPostId: id, lastModifiedRemote: bm, wpLink: remote.permalink ?? item.wpLink }
          };
        }
      }
    }
    return {
      ok: true,
      ...seoWarning ? { seoWarning } : {},
      patch: {
        wpPostId: pushed.id,
        ...seoWarning ? {} : { seoSyncedAt: (/* @__PURE__ */ new Date()).toISOString() },
        lastModifiedRemote: pushed.baseModified,
        dirtyAt: null,
        // pushed → local is in sync again
        ...pushed.permalink ? { wpLink: pushed.permalink } : {},
        // Record the categories we actually assigned, so the content shows under them and re-pushes
        // stay idempotent (a planned item's membership was resolved from its tree placement).
        ...termIds ? { termIds } : {},
        ...pushed.status ? { wpStatus: pushed.status } : {}
      }
    };
  } catch (e) {
    return {
      ok: false,
      conflict: false,
      error: e instanceof Error ? e.message : String(e),
      ...isAuthError(e) ? { authError: true } : {}
    };
  }
}
async function resolvePlacementTerm(client2, ws, nodeId, tax) {
  const path = getNodePath(ws, nodeId).filter(isCategoryNode);
  if (!path.length) return void 0;
  let known = -1;
  for (let i = path.length - 1; i >= 0 && known < 0; i--) if (path[i].wpCategoryId != null) known = i;
  if (known === path.length - 1) {
    const id = path[known].wpCategoryId;
    const slug = await client2.termSlug(tax, id);
    return slug ? { id, slug } : void 0;
  }
  const parent = known >= 0 ? path[known].wpCategoryId : 0;
  const leaf = await client2.ensureTermPath(
    tax,
    path.slice(known + 1).map((n) => n.term),
    parent
  );
  return leaf ?? void 0;
}

// packages/silo-core/lib/sync/import-content.ts
var NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\xA0",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  laquo: "\xAB",
  raquo: "\xBB",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D"
};
function decodeEntities2(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 1114111 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}
var stripHtml = (s) => decodeEntities2(s.replace(/<[^>]*>/g, "")).trim();
function seoFromMeta(meta) {
  if (!meta) return null;
  const fk = typeof meta.rank_math_focus_keyword === "string" ? meta.rank_math_focus_keyword : "";
  const title = typeof meta.rank_math_title === "string" ? meta.rank_math_title : "";
  const description = typeof meta.rank_math_description === "string" ? meta.rank_math_description : "";
  const kws = fk.split(",").map((s) => s.trim()).filter(Boolean);
  if (!kws.length && !title && !description) return null;
  return {
    title,
    description,
    coreKeywords: kws.slice(0, 1),
    longTailKeywords: kws.slice(1)
  };
}
function seoFromYoastHead(head) {
  if (!head || typeof head !== "object") return null;
  const title = typeof head.title === "string" ? head.title : "";
  const description = typeof head.description === "string" ? head.description : "";
  if (!title && !description) return null;
  return { title, description, coreKeywords: [], longTailKeywords: [] };
}
var UNCATEGORIZED_TERM = "\u672A\u5206\u7C7B";
async function importFromWp(client2, ws, postTypes, opts = {}) {
  const siteUrl = ws.profile.url;
  const raw = [];
  for (let i = 0; i < postTypes.length; i++) {
    const pt = postTypes[i];
    opts.onProgress?.(i, postTypes.length, `\u62C9\u53D6 ${pt}`);
    const posts = await client2.listAllContentType(pt);
    posts.forEach((post) => {
      if (!opts.onlyIds || opts.onlyIds.includes(post.id)) raw.push({ postType: pt, post });
    });
  }
  opts.onProgress?.(postTypes.length, postTypes.length, "\u8BFB\u53D6 SEO");
  const allIds = raw.map((r) => r.post.id);
  let seoProvider = null;
  let seoLimits;
  const seoById = /* @__PURE__ */ new Map();
  try {
    const seo = await client2.fetchSeoMeta(allIds);
    if (seo) {
      seoProvider = seo.provider;
      seo.items.forEach((it) => seoById.set(it.id, it));
      seoLimits = seo.limits ?? void 0;
      applySeoLimits(seoLimits);
    }
  } catch {
    seoProvider = null;
  }
  opts.onProgress?.(postTypes.length, postTypes.length, "\u62C9\u53D6\u5206\u7C7B");
  const nodes = [...ws.nodes];
  const archiveUrlByNodeId = /* @__PURE__ */ new Map();
  const findTypeRoot = (pt) => nodes.find((n) => n.system && n.parentId === null && n.postType === pt && n.wpCategoryId == null);
  const findTermNode = (tax, termId) => nodes.find((n) => n.taxonomyRestBase === tax && n.wpCategoryId === termId);
  const typeRootId = /* @__PURE__ */ new Map();
  const termNodeIdByType = /* @__PURE__ */ new Map();
  const uncategorizedId = /* @__PURE__ */ new Map();
  const usedTypes = new Set(raw.map((r) => r.postType));
  for (const pt of postTypes) {
    if (opts.onlyIds && !usedTypes.has(pt)) continue;
    const tax = client2.taxRestBaseFor(pt);
    let root = findTypeRoot(pt);
    if (!root) {
      root = createNode(client2.typeLabel(pt), "pillar", null, {
        system: true,
        postType: pt,
        ...tax ? { taxonomyRestBase: tax } : {}
      });
      nodes.push(root);
    }
    typeRootId.set(pt, root.id);
    if (!tax) continue;
    let terms = await client2.listAllTerms(tax);
    if (opts.onlyIds) {
      const keep = new Set(raw.filter((r) => r.postType === pt).flatMap((r) => r.post.termIds ?? []));
      for (let grew = true; grew; ) {
        grew = false;
        for (const t of terms)
          if (keep.has(t.id) && t.parent && !keep.has(t.parent)) {
            keep.add(t.parent);
            grew = true;
          }
      }
      terms = terms.filter((t) => keep.has(t.id));
    }
    const nodeIdByTerm = /* @__PURE__ */ new Map();
    const placeTerm = (termId, name, parentId, archiveUrl) => {
      let node = findTermNode(tax, termId);
      if (!node) {
        node = createNode(name, "cluster", parentId, {
          postType: pt,
          taxonomyRestBase: tax,
          wpCategoryId: termId,
          isCategory: true
        });
        nodes.push(node);
      } else {
        node.term = name;
        node.parentId = parentId;
        node.postType = pt;
        node.isCategory = true;
      }
      nodeIdByTerm.set(termId, node.id);
      if (archiveUrl) archiveUrlByNodeId.set(node.id, archiveUrl);
    };
    const remaining = [...terms];
    let guard = remaining.length + 1;
    while (remaining.length && guard-- > 0) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        const t = remaining[i];
        if (t.parent !== 0 && !nodeIdByTerm.has(t.parent)) continue;
        placeTerm(t.id, t.name, t.parent === 0 ? root.id : nodeIdByTerm.get(t.parent), t.link);
        remaining.splice(i, 1);
      }
    }
    remaining.forEach((t) => placeTerm(t.id, t.name, root.id, t.link));
    termNodeIdByType.set(pt, nodeIdByTerm);
  }
  const ensureUncategorized = (pt) => {
    const cached = uncategorizedId.get(pt);
    if (cached) return cached;
    const rootId = typeRootId.get(pt);
    let node = nodes.find((n) => n.system && n.parentId === rootId && n.term === UNCATEGORIZED_TERM);
    if (!node) {
      node = createNode(UNCATEGORIZED_TERM, "cluster", rootId, { system: true, postType: pt });
      nodes.push(node);
    }
    uncategorizedId.set(pt, node.id);
    return node.id;
  };
  const resolveNodeId = (pt, termIds) => {
    const rootId = typeRootId.get(pt);
    if (!client2.taxRestBaseFor(pt)) return rootId;
    const map = termNodeIdByType.get(pt);
    const tid = (termIds ?? []).find((id) => map?.has(id));
    return tid != null ? map.get(tid) : ensureUncategorized(pt);
  };
  opts.onProgress?.(postTypes.length, postTypes.length, "\u89E3\u6790\u5173\u7CFB");
  const byWpId = new Map(
    ws.contents.filter((c) => c.wpPostId != null).map((c) => [c.wpPostId, c])
  );
  const contents = [...ws.contents];
  const upsert = (item) => {
    const idx = contents.findIndex((c) => c.id === item.id);
    if (idx >= 0) contents[idx] = item;
    else contents.push(item);
  };
  const seoPatchFor = (post) => {
    const fromRoute = seoById.get(post.id);
    if (fromRoute) {
      const kws = fromRoute.focusKeyword.split(",").map((s) => s.trim()).filter(Boolean);
      if (kws.length || fromRoute.title || fromRoute.description) {
        return {
          title: fromRoute.title,
          description: fromRoute.description,
          coreKeywords: kws.slice(0, 1),
          longTailKeywords: kws.slice(1)
        };
      }
    }
    return seoFromMeta(post.meta) ?? seoFromYoastHead(post.yoast_head_json);
  };
  const imported = [];
  for (const { postType, post } of raw) {
    const existing = byWpId.get(post.id);
    const seoPatch = seoPatchFor(post);
    const title = stripHtml(post.title?.rendered ?? "");
    const nodeId = resolveNodeId(postType, post.termIds);
    const base = existing ?? createContent(nodeId, title, postType);
    const item = {
      ...base,
      siloNodeId: nodeId,
      termIds: post.termIds ?? [],
      postType,
      title: title || base.title,
      slug: post.slug || base.slug,
      wpPostId: post.id,
      // Not `post.link` verbatim: for a draft that is a nonce'd preview URL (see canonicalPostLink).
      wpLink: canonicalPostLink(post.link),
      wpStatus: post.status ?? base.wpStatus,
      lastModifiedRemote: post.modified_gmt ?? post.modified,
      dirtyAt: null,
      // freshly pulled from WP → in sync
      seo: seoPatch ? { ...base.seo, ...seoPatch } : base.seo
    };
    upsert(item);
    imported.push({ item, post });
  }
  const byUrl = /* @__PURE__ */ new Map();
  const canon = (u) => {
    try {
      const url = new URL(u, siteUrl);
      return `${canonicalHost(url.toString())}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
    } catch {
      return u.toLowerCase();
    }
  };
  contents.forEach((c) => {
    if (c.wpLink && !isFallbackPermalink(c.wpLink)) byUrl.set(canon(c.wpLink), c.id);
  });
  const pathSegments = (u) => {
    try {
      return new URL(u).pathname.split("/").filter(Boolean);
    } catch {
      return [];
    }
  };
  for (const [pt, rootId] of typeRootId) {
    const links = imported.filter((x) => x.item.postType === pt && x.item.wpLink).map((x) => x.item.wpLink);
    if (!links.length) continue;
    const firsts = new Set(links.map((l) => pathSegments(l)[0] ?? ""));
    const seg = firsts.size === 1 ? [...firsts][0] : "";
    if (!seg || /^\d+$/.test(seg) || links.some((l) => pathSegments(l).length < 2)) continue;
    try {
      archiveUrlByNodeId.set(rootId, new URL(`/${seg}`, siteUrl).toString());
    } catch {
    }
  }
  for (const [nodeId, url] of archiveUrlByNodeId) {
    const key = canon(url);
    if (!byUrl.has(key)) byUrl.set(key, nodeId);
  }
  const importedIds = new Set(imported.map((x) => x.item.id));
  const edges = ws.edges.filter(
    (e) => !(importedIds.has(e.from) && (e.type === "internal-link" || e.type === "external-link"))
  );
  const reports = [];
  const homeUrl = canon(siteUrl);
  const homeDoc = imported.find(
    ({ item }) => item.wpLink && !isFallbackPermalink(item.wpLink) && canon(item.wpLink) === homeUrl
  );
  let homeHtml = null;
  if (homeDoc?.item.wpLink) {
    homeHtml = await client2.fetchRenderedPage(homeDoc.item.wpLink).catch(() => "") || null;
  }
  const byWpPostId = new Map(
    contents.filter((c) => c.wpPostId != null).map((c) => [c.wpPostId, c.id])
  );
  const byId = (url) => {
    try {
      const params = new URL(url, siteUrl).searchParams;
      const idStr = params.get("page_id") ?? params.get("p");
      const id = idStr ? Number(idStr) : NaN;
      return Number.isFinite(id) ? byWpPostId.get(id) : void 0;
    } catch {
      return void 0;
    }
  };
  const resolveInternalTarget = (url) => isFallbackPermalink(url, siteUrl) ? byId(url) : byUrl.get(canon(url));
  const noteLinks = buildNoteLinkIndex({ ...ws, contents }, opts.noteNames);
  const resolveWikilinkName = (url) => {
    const targetId = resolveInternalTarget(url);
    return targetId ? noteLinks.nameFor(targetId) : void 0;
  };
  const bodies = /* @__PURE__ */ new Map();
  for (const { item, post } of imported) {
    if (opts.wantBodies) {
      try {
        const read = await client2.getBlocks(post.id, { full: true });
        const allProse = read.blocks.every((b) => b.kind === "prose");
        const md = read.blocks.map((b) => (b.markdown ?? "").trim()).filter(Boolean).join("\n\n");
        if (allProse && md) bodies.set(item.id, restoreWikilinks(md, resolveWikilinkName));
      } catch {
      }
    }
    const bodyHtml = post.content?.rendered ?? "";
    const html2 = item.id === homeDoc?.item.id && homeHtml || bodyHtml;
    const { internal, external } = parseLinks(html2, siteUrl, post.link);
    const internalUnresolved = [];
    let internalResolved = 0;
    for (const link2 of internal) {
      const targetId = link2.url ? resolveInternalTarget(link2.url) : void 0;
      if (targetId && targetId !== item.id) {
        edges.push({
          from: item.id,
          to: targetId,
          type: "internal-link",
          anchor: link2.anchor,
          dofollow: link2.dofollow,
          placement: link2.placement
        });
        internalResolved++;
      } else {
        internalUnresolved.push(link2);
      }
    }
    for (const link2 of external) {
      if (link2.url)
        edges.push({
          from: item.id,
          to: link2.url,
          type: "external-link",
          anchor: link2.anchor,
          dofollow: link2.dofollow,
          placement: link2.placement
        });
    }
    reports.push({
      contentId: item.id,
      title: item.title,
      wpPostId: post.id,
      internalResolved,
      internalUnresolved,
      external,
      keywords: [...item.seo.coreKeywords, ...item.seo.longTailKeywords]
    });
  }
  const PROBE_LIMIT = 60;
  const unresolvedByUrl = /* @__PURE__ */ new Map();
  for (const r of reports) {
    for (const l of r.internalUnresolved) {
      if (!l.url || unresolvedByUrl.has(l.url)) continue;
      unresolvedByUrl.set(l.url, { from: r.contentId, href: l.href, anchor: l.anchor, placement: l.placement });
    }
  }
  const brokenLinks = [];
  const probeTargets = [...unresolvedByUrl.entries()].slice(0, PROBE_LIMIT);
  for (let i = 0; i < probeTargets.length; i++) {
    const [url, meta] = probeTargets[i];
    opts.onProgress?.(i, probeTargets.length, "\u68C0\u67E5\u7AD9\u5185\u6B7B\u94FE");
    const status = await client2.probeUrlStatus(url);
    if (status >= 400) brokenLinks.push({ ...meta, url, status });
  }
  if (seoProvider == null) {
    if (raw.some((r) => seoFromMeta(r.post.meta))) seoProvider = "rank-math";
    else if (raw.some((r) => seoFromYoastHead(r.post.yoast_head_json))) seoProvider = "yoast";
  }
  const keptNodes = nodes.filter((n) => {
    if (!n.system) return true;
    const hasChildren = nodes.some((m) => m.parentId === n.id);
    const hasContent = contents.some((c) => c.siloNodeId === n.id);
    return hasChildren || hasContent;
  });
  const keptIds = new Set(keptNodes.map((n) => n.id));
  const mergedWs = { ...ws, nodes: keptNodes, contents, edges, brokenLinks };
  const keywords = reconcileKeywords(mergedWs);
  return {
    ws: { ...mergedWs, keywords, ...seoLimits ? { seoLimits } : {} },
    rootNodeIds: [...typeRootId.values()].filter((id) => keptIds.has(id)),
    reports,
    imported: imported.length,
    bodies,
    seoProvider
  };
}

// packages/cli/src/index.ts
import { dirname as dirname11 } from "node:path";

// packages/cli/src/adapters/fileStore.ts
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
var parse = async (p) => {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return null;
  }
};
async function listSites(dir2) {
  const d = join(dir2, SITES_DIR);
  if (!existsSync(d)) return [];
  try {
    const ents = await readdir(d, { withFileTypes: true });
    return ents.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
async function readActiveDomain(dir2) {
  const state = await parse(join(dir2, STATE_PATH));
  return typeof state?.activeDomain === "string" && state.activeDomain ? state.activeDomain : null;
}
async function writeActiveDomain(dir2, siteUrl) {
  const p = join(dir2, STATE_PATH);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify({ activeDomain: siteKey(siteUrl) }, null, 2), "utf8");
}
async function resolveSite(dir2, wanted) {
  const keys = await listSites(dir2);
  if (!keys.length) return null;
  if (wanted) {
    const key = siteKey(wanted);
    return keys.includes(key) ? key : null;
  }
  const active = await readActiveDomain(dir2);
  if (active && keys.includes(active)) return active;
  return keys.length === 1 ? keys[0] : null;
}
async function readWorkspace(dir2, site2) {
  const key = await resolveSite(dir2, site2);
  return key ? parse(join(dir2, workspacePath(key))) : null;
}
async function writeWorkspace(dir2, ws) {
  const url = ws.connection?.siteUrl ?? ws.profile?.url ?? "";
  const key = siteKey(url);
  const p = join(dir2, workspacePath(key));
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(ws, null, 2), "utf8");
  if (url) await writeActiveDomain(dir2, url);
}

// packages/cli/src/adapters/assetUploader.ts
import { readFile as readFile2 } from "node:fs/promises";
import { existsSync as existsSync2 } from "node:fs";
import { resolve, basename, extname } from "node:path";
var MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml"
};
var mimeOf = (filename) => MIME_BY_EXT[extname(filename).toLowerCase()];
function wpAssetUploader(client2, baseDirs) {
  const cache2 = /* @__PURE__ */ new Map();
  return {
    async upload(ref) {
      if (cache2.has(ref)) return cache2.get(ref) ?? null;
      let url = null;
      try {
        const rel = decodeURIComponent(ref);
        const abs = baseDirs.map((d) => resolve(d, rel)).find(existsSync2);
        const mime = abs && mimeOf(abs);
        if (abs && mime) {
          const bytes = await readFile2(abs);
          const { url: hosted } = await client2.uploadMedia(new Uint8Array(bytes), basename(abs), mime);
          url = hosted;
        }
      } catch {
        url = null;
      }
      cache2.set(ref, url);
      return url;
    }
  };
}

// packages/cli/src/adapters/nodeNetwork.ts
var nodeNetwork = {
  async request(req) {
    try {
      const body = req.body === void 0 ? void 0 : req.body instanceof Uint8Array || typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const res = await fetch(req.url, { method: req.method, headers: req.headers, body });
      const headers = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      if (res.status === 204) return { status: res.status, json: void 0, headers };
      const text = await res.text();
      let json = void 0;
      try {
        json = text ? JSON.parse(text) : void 0;
      } catch {
        json = { code: "invalid_json", message: text.slice(0, 300) };
      }
      return { status: res.status, json, text, headers };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { status: 0, json: { code: "network_error", message }, text: message, headers: {} };
    }
  }
};

// packages/cli/src/adapters/credentials.ts
import { readFile as readFile3, writeFile as writeFile2, mkdir as mkdir2, chmod } from "node:fs/promises";
import { existsSync as existsSync3 } from "node:fs";
import { homedir } from "node:os";
import { join as join2, dirname as dirname2 } from "node:path";
var normUrl = (u) => u.trim().replace(/\/+$/, "");
var PUFFERGO_DIR = join2(homedir(), ".puffergo");
var GLOBAL_CREDENTIALS = join2(PUFFERGO_DIR, "credentials.json");
var storePath = () => process.env.PUFFERGO_CONFIG || GLOBAL_CREDENTIALS;
var isSite = (v) => !!v && typeof v === "object" && typeof v.username === "string" && typeof v.appPassword === "string";
async function readStore(path) {
  if (!existsSync3(path)) return null;
  try {
    const raw = JSON.parse(await readFile3(path, "utf8"));
    if (raw.sites && typeof raw.sites === "object") {
      const sites = {};
      for (const [url, v] of Object.entries(raw.sites)) if (isSite(v)) sites[url] = v;
      return { sites };
    }
    if (typeof raw.siteUrl === "string" && isSite(raw)) {
      return { sites: { [raw.siteUrl]: { username: raw.username, appPassword: raw.appPassword } } };
    }
    return null;
  } catch {
    return null;
  }
}
async function resolveCredential(siteUrl, explicitPath) {
  const store = await readStore(explicitPath ?? storePath());
  if (!store) return null;
  const urls = Object.keys(store.sites);
  const byNorm = new Map(urls.map((u) => [normUrl(u), u]));
  const pick = siteUrl ? byNorm.get(normUrl(siteUrl)) ?? urls.find((u) => siteKey(u) === siteKey(siteUrl)) : urls.length === 1 ? urls[0] : void 0;
  if (!pick) return null;
  return { siteUrl: pick, ...store.sites[pick] };
}
async function listCredentialSites() {
  const store = await readStore(storePath());
  return store ? Object.keys(store.sites) : [];
}
async function upsertCredential(cfg, path = storePath()) {
  const existing = await readStore(path) ?? { sites: {} };
  existing.sites[cfg.siteUrl] = { username: cfg.username, appPassword: cfg.appPassword };
  await mkdir2(dirname2(path), { recursive: true });
  await writeFile2(path, JSON.stringify(existing, null, 2), { encoding: "utf8", mode: 384 });
  await chmod(path, 384).catch(() => void 0);
}

// packages/cli/src/lib/site.ts
import { readFile as readFile4, writeFile as writeFile3, mkdir as mkdir3 } from "node:fs/promises";
import { existsSync as existsSync4 } from "node:fs";
import { dirname as dirname3, join as join3 } from "node:path";
async function readSiteConfig(dir2, siteUrl) {
  const p = join3(dir2, siteConfigPath(siteKey(siteUrl)));
  if (!existsSync4(p)) return {};
  try {
    const raw = JSON.parse(await readFile4(p, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}
async function writeSiteConfig(dir2, siteUrl, cfg) {
  const p = join3(dir2, siteConfigPath(siteKey(siteUrl)));
  await mkdir3(dirname3(p), { recursive: true });
  await writeFile3(p, JSON.stringify(cfg, null, 2), "utf8");
}
var NoSiteError = class extends Error {
  constructor(sites) {
    super("no_site");
    this.sites = sites;
  }
  code = "no_site";
};
var NotLoggedInError = class extends Error {
  constructor(siteUrl) {
    super("not_logged_in");
    this.siteUrl = siteUrl;
  }
  code = "not_logged_in";
};
async function resolveSite2(dir2, siteFlag) {
  if (siteFlag) {
    const cred2 = await resolveCredential(siteFlag);
    if (!cred2) throw new NotLoggedInError(siteFlag);
    await writeActiveDomain(dir2, cred2.siteUrl);
    return { config: cred2 };
  }
  const active = await readActiveDomain(dir2);
  if (active) {
    const cred2 = await resolveCredential(active);
    if (!cred2) throw new NotLoggedInError(active);
    return { config: cred2 };
  }
  const cred = await resolveCredential(void 0);
  if (cred) return { config: cred };
  throw new NoSiteError(await listCredentialSites());
}
async function editLiveAllowed(dir2, siteUrl) {
  return !!(await readSiteConfig(dir2, siteUrl)).editLive?.on;
}

// packages/cli/src/lib/wp.ts
async function connect(dir2, opts = {}) {
  const ws = await readWorkspace(dir2, opts.site);
  const siteUrl = ws?.profile?.url;
  const resolved = await resolveCredential(siteUrl, opts.configPath);
  if (!resolved) throw new NotLoggedInError(siteUrl ?? "");
  const baseConn = {
    siteUrl: resolved.siteUrl,
    username: resolved.username,
    appPassword: resolved.appPassword
  };
  const probe2 = new WpClient(nodeNetwork, baseConn);
  const contentTypes = await probe2.discoverContentTypes();
  const conn = { ...baseConn, contentTypes };
  return { client: new WpClient(nodeNetwork, conn), conn, siteUrl: resolved.siteUrl };
}

// packages/cli/src/lib/plan.ts
var norm3 = (s) => s.trim().toLowerCase();
function applyPlan(ws, plan) {
  let next = ws;
  const counts = { keywords: 0, nodes: 0, contents: 0, nodesReused: 0, contentsReused: 0 };
  for (const k of plan.keywords ?? []) {
    if (!k.term?.trim()) continue;
    const r = addKeyword(next, k.term, { intent: k.intent, plannedTier: k.plannedTier, note: k.note });
    next = r.ws;
    counts.keywords++;
  }
  const nodeIds = /* @__PURE__ */ new Map();
  const pending = [...plan.nodes ?? []];
  let guard = pending.length * pending.length + 1;
  while (pending.length && guard-- > 0) {
    const n = pending.shift();
    const parentKey = n.parent ?? null;
    const existingParent = parentKey !== null && !nodeIds.has(parentKey) ? next.nodes.find((nd) => norm3(nd.term) === norm3(parentKey)) : void 0;
    if (parentKey !== null && !nodeIds.has(parentKey) && !existingParent) {
      pending.push(n);
      continue;
    }
    const parentId = parentKey === null ? null : nodeIds.get(parentKey) ?? existingParent.id;
    const existing = next.nodes.find(
      (nd) => !nd.system && (nd.parentId ?? null) === parentId && norm3(nd.term) === norm3(n.term)
    );
    let nodeId;
    if (existing) {
      nodeId = existing.id;
      const patch = {};
      if (n.intent) patch.intent = n.intent;
      if (n.isCategory) patch.isCategory = true;
      if (n.postType) patch.postType = n.postType;
      if (n.taxonomyRestBase) patch.taxonomyRestBase = n.taxonomyRestBase;
      if (n.seo) patch.seo = { title: "", description: "", coreKeywords: [], longTailKeywords: [], ...n.seo };
      if (Object.keys(patch).length) next = updateNode(next, nodeId, patch);
      counts.nodesReused++;
    } else {
      const r = addNode(next, n.term, n.kind, parentId, n.intent);
      const patch = {};
      if (n.isCategory) patch.isCategory = true;
      if (n.postType) patch.postType = n.postType;
      if (n.taxonomyRestBase) patch.taxonomyRestBase = n.taxonomyRestBase;
      if (n.seo) patch.seo = { title: "", description: "", coreKeywords: [], longTailKeywords: [], ...n.seo };
      next = Object.keys(patch).length ? updateNode(r.ws, r.node.id, patch) : r.ws;
      nodeId = r.node.id;
      counts.nodes++;
    }
    nodeIds.set(n.key, nodeId);
  }
  if (pending.length) {
    throw new Error(`plan.nodes: unresolved parent references: ${pending.map((p) => p.key).join(", ")}`);
  }
  const contentIds = /* @__PURE__ */ new Map();
  const purposes = /* @__PURE__ */ new Map();
  const linkIntents = [];
  for (const c of plan.contents ?? []) {
    const nodeId = nodeIds.get(c.node);
    if (!nodeId) throw new Error(`plan.contents: unknown node key "${c.node}" for "${c.title}"`);
    const seo = {
      title: c.seo?.title ?? "",
      description: c.seo?.description ?? "",
      coreKeywords: c.seo?.coreKeywords ?? [],
      longTailKeywords: c.seo?.longTailKeywords ?? []
    };
    const existing = next.contents.find(
      (ct) => ct.siloNodeId === nodeId && (c.slug ? norm3(ct.slug ?? "") === norm3(c.slug) : norm3(ct.title) === norm3(c.title))
    );
    let contentId;
    if (existing) {
      contentId = existing.id;
      next = updateContent(next, contentId, { title: c.title, slug: c.slug, seo });
      counts.contentsReused++;
    } else {
      const r = addContent(next, nodeId, c.title, c.postType ?? "post");
      next = updateContent(r.ws, r.content.id, { slug: c.slug, seo });
      contentId = r.content.id;
      counts.contents++;
    }
    if (c.key) contentIds.set(c.key, contentId);
    if (c.purpose) purposes.set(contentId, c.purpose);
    linkIntents.push({ id: contentId, internal: c.internalLinks ?? [], external: c.externalLinks ?? [] });
  }
  for (const li of linkIntents) {
    const internalIds = li.internal.map((k) => contentIds.get(k)).filter((x) => !!x);
    if (internalIds.length || li.external.length) {
      next = setContentLinks(next, li.id, internalIds, li.external);
    }
  }
  return { ws: next, contentIds, purposes, counts };
}

// packages/cli/src/lib/vault.ts
import { readFile as readFile5, writeFile as writeFile4, mkdir as mkdir4, readdir as readdir2, rename } from "node:fs/promises";
import { existsSync as existsSync5 } from "node:fs";
import { join as join4, dirname as dirname4, basename as basename2 } from "node:path";
function contentDir(dir2, ws, content) {
  return join4(dir2, ...contentDirSegments(ws, content));
}
function contentFilePath(dir2, ws, content) {
  return join4(contentDir(dir2, ws, content), `${contentFileBaseName(content)}.md`);
}
async function writeContentFile(dir2, ws, content, internalLinks, externalLinks, purpose, knownPath) {
  let p = knownPath ? join4(contentDir(dir2, ws, content), basename2(knownPath)) : contentFilePath(dir2, ws, content);
  if (!knownPath && existsSync5(p) && siloIdOf(splitFrontmatter(await readFile5(p, "utf8")).fm) !== content.id) {
    p = join4(contentDir(dir2, ws, content), `${contentFileFallbackName(content)}.md`);
  }
  if (knownPath && knownPath !== p) {
    await mkdir4(dirname4(p), { recursive: true });
    await rename(knownPath, p);
  }
  let body = "\n";
  let existingPurpose;
  if (existsSync5(p)) {
    const split = splitFrontmatter(await readFile5(p, "utf8"));
    body = split.body || body;
    existingPurpose = parseFrontmatterEdits(split.fm)?.purpose;
  }
  const finalPurpose = existingPurpose || purpose || "";
  await mkdir4(dirname4(p), { recursive: true });
  await writeFile4(p, renderFrontmatter(ws, content, internalLinks, externalLinks, finalPurpose) + body, "utf8");
  return p;
}
async function scaffoldVault(dir2, ws, purposes) {
  const existing = await scanVault(dir2);
  const links = buildNoteLinkIndex(ws, noteNamesFromScan(existing));
  let files = 0;
  for (const c of ws.contents) {
    const outbound = ws.edges.filter((e) => e.from === c.id);
    const internalWikilinks = outbound.filter((e) => e.type === "internal-link").map((e) => ws.contents.find((x) => x.id === e.to)).filter((x) => !!x).map((x) => formatWikilink(links.nameFor(x.id) ?? x.slug ?? x.id));
    const external = outbound.filter((e) => e.type === "external-link").map((e) => e.to);
    await writeContentFile(dir2, ws, c, internalWikilinks, external, purposes?.get(c.id), existing.get(c.id)?.path);
    files++;
  }
  return files;
}
async function updateNoteBody(path, newBody) {
  const { fm } = splitFrontmatter(await readFile5(path, "utf8"));
  await writeFile4(path, `---
${fm}
---
${newBody}`, "utf8");
}
async function scanVault(dir2) {
  const out = /* @__PURE__ */ new Map();
  async function walk(d) {
    for (const ent of await readdir2(d, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      const full = join4(d, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile() && ent.name.endsWith(".md")) {
        const { fm, body } = splitFrontmatter(await readFile5(full, "utf8"));
        const id = siloIdOf(fm);
        if (id) out.set(id, { path: full, fm, body });
      }
    }
  }
  if (existsSync5(dir2)) await walk(dir2);
  return out;
}

// packages/cli/src/lib/siloSync.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync6 } from "node:fs";
import { mkdir as mkdir5, readFile as readFile6, writeFile as writeFile5 } from "node:fs/promises";
import { basename as basename3, dirname as dirname5, join as join5, resolve as resolve2 } from "node:path";
var pathFor = (dir2, siteUrl) => join5(dir2, syncedPath(siteKey(siteUrl)));
async function readSynced(dir2, siteUrl) {
  const p = pathFor(dir2, siteUrl);
  return existsSync6(p) ? JSON.parse(await readFile6(p, "utf8")) : {};
}
async function writeSynced(dir2, siteUrl, synced) {
  const p = pathFor(dir2, siteUrl);
  await mkdir5(dirname5(p), { recursive: true });
  await writeFile5(p, JSON.stringify(synced, null, 2) + "\n", "utf8");
}
function noteHash(note) {
  return createHash("sha256").update(`${note.fm}
---
${note.body}`).digest("hex");
}
function isEdited(id, scan, synced) {
  const note = scan.get(id);
  if (!note) return false;
  return synced[id] ? noteHash(note) !== synced[id] : !!note.body.trim();
}
function changedIds(ws, scan, synced) {
  return ws.contents.filter((c) => c.wpPostId == null || isEdited(c.id, scan, synced)).map((c) => c.id);
}
function matchTargets(targets, ws, scan, dir2) {
  const ids = [];
  const unknown = [];
  for (const t of targets) {
    const name = t.replace(/\.md$/i, "");
    const c = ws.contents.find((c2) => {
      const note = scan.get(c2.id);
      return c2.id === t || c2.slug === t || String(c2.wpPostId) === t || c2.wpLink && c2.wpLink.replace(/\/$/, "") === t.replace(/\/$/, "") || note && (resolve2(dir2, t) === note.path || basename3(note.path, ".md") === name);
    });
    if (c) ids.push(c.id);
    else unknown.push(t);
  }
  return { ids, unknown };
}
function recordSynced(synced, before, after, syncedIds) {
  const out = { ...synced };
  const done = new Set(syncedIds);
  for (const [id, note] of after) {
    const was = before.get(id);
    if (done.has(id) || was && synced[id] && noteHash(was) === synced[id]) out[id] = noteHash(note);
  }
  return out;
}

// packages/cli/src/lib/previewCmd.ts
import { writeFile as writeFile6, mkdir as mkdir6, readFile as readFile7 } from "node:fs/promises";
import { existsSync as existsSync7 } from "node:fs";
import { spawn } from "node:child_process";
import { basename as basename4, dirname as dirname6, join as join6, resolve as resolve3 } from "node:path";
import { tmpdir } from "node:os";
import { createHash as createHash2 } from "node:crypto";
import { fileURLToPath } from "node:url";
var previewPath = (dir2) => {
  const abs = resolve3(dir2);
  const hash = createHash2("sha1").update(abs).digest("hex").slice(0, 8);
  const safe = basename4(abs).replace(/[^\w.-]+/g, "-").slice(0, 40) || "vault";
  return join6(tmpdir(), "puffergo-silo-preview", `${safe}-${hash}.html`);
};
function bundleDir() {
  const here = dirname6(fileURLToPath(import.meta.url));
  const candidates = [
    here,
    join6(here, "preview"),
    // dev: running from packages/silo-cli/src/lib via tsx
    resolve3(here, "..", "..", "..", "..", "dist", "silo-preview")
  ];
  return candidates.find((d) => existsSync7(join6(d, "preview.js"))) ?? null;
}
function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function renderPreviewHtml(ws, sourceLabel, js, css) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(ws.profile?.name || "Silo")} \xB7 Silo \u9884\u89C8</title>
<style>${css}</style>
</head>
<body style="margin:0">
<div id="app-container"></div>
<script>window.__SILO_PREVIEW__=${inlineJson({ workspace: ws, sourceLabel })};</script>
<script>${js}</script>
</body>
</html>
`;
}
var escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function openInBrowser(file) {
  const cmd2 = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const child = spawn(cmd2, [file], {
      stdio: "ignore",
      detached: true,
      ...process.platform === "win32" ? { shell: true } : {}
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
async function writePreview(ws, dir2, noOpen, outPath) {
  const bundle = bundleDir();
  if (!bundle) {
    throw new Error("preview_bundle_missing");
  }
  const [js, css] = await Promise.all([
    readFile7(join6(bundle, "preview.js"), "utf8"),
    readFile7(join6(bundle, "preview.css"), "utf8").catch(() => "")
  ]);
  const file = outPath ? resolve3(outPath) : previewPath(dir2);
  await mkdir6(dirname6(file), { recursive: true });
  await writeFile6(file, renderPreviewHtml(ws, basename4(resolve3(dir2)) || dir2, js, css), "utf8");
  return { file, opened: noOpen ? false : openInBrowser(file) };
}

// packages/cli/src/lib/productsCmd.ts
import { resolve as resolve6, join as join10, relative } from "node:path";
import { readFile as readFile13, readdir as readdir4, stat as stat2 } from "node:fs/promises";

// packages/cli/src/lib/imageSniff.ts
var MAX_BYTES = 10 * 1024 * 1024;
function readUInt16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function readUInt32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function sniffFormat(buf) {
  if (buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return "jpeg";
  if (buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71 && buf[4] === 13 && buf[5] === 10 && buf[6] === 26 && buf[7] === 10)
    return "png";
  if (buf.length >= 12 && buf[0] === 82 && buf[1] === 73 && buf[2] === 70 && buf[3] === 70 && buf[8] === 87 && buf[9] === 69 && buf[10] === 66 && buf[11] === 80)
    return "webp";
  if (buf.length >= 6 && buf[0] === 71 && buf[1] === 73 && buf[2] === 70 && buf[3] === 56 && (buf[4] === 55 || buf[4] === 57) && buf[5] === 97)
    return "gif";
  return null;
}
function pngDims(buf) {
  if (buf.length < 24) return null;
  return { width: readUInt32BE(buf, 16), height: readUInt32BE(buf, 20) };
}
function gifDims(buf) {
  if (buf.length < 10) return null;
  return { width: buf[6] | buf[7] << 8, height: buf[8] | buf[9] << 8 };
}
function jpegDims(buf) {
  let off = 2;
  const SOF_MARKERS = /* @__PURE__ */ new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);
  while (off + 9 < buf.length) {
    if (buf[off] !== 255) {
      off++;
      continue;
    }
    const marker = buf[off + 1];
    if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) {
      off += 2;
      continue;
    }
    if (marker === 217) break;
    const len = readUInt16BE(buf, off + 2);
    if (SOF_MARKERS.has(marker)) {
      const height = readUInt16BE(buf, off + 5);
      const width = readUInt16BE(buf, off + 7);
      return { width, height };
    }
    off += 2 + len;
  }
  return null;
}
function webpDims(buf) {
  if (buf.length < 30) return null;
  const chunkId = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
  if (chunkId === "VP8 ") {
    const width = (buf[26] | buf[27] << 8) & 16383;
    const height = (buf[28] | buf[29] << 8) & 16383;
    return { width, height };
  }
  if (chunkId === "VP8L") {
    const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
    const width = 1 + ((b1 & 63) << 8 | b0);
    const height = 1 + ((b3 & 15) << 10 | b2 << 2 | (b1 & 192) >> 6);
    return { width, height };
  }
  if (chunkId === "VP8X") {
    const width = 1 + (buf[24] | buf[25] << 8 | buf[26] << 16);
    const height = 1 + (buf[27] | buf[28] << 8 | buf[29] << 16);
    return { width, height };
  }
  return null;
}
function sniffImage(buf) {
  const format = sniffFormat(buf);
  let dims = null;
  try {
    if (format === "jpeg") dims = jpegDims(buf);
    else if (format === "png") dims = pngDims(buf);
    else if (format === "gif") dims = gifDims(buf);
    else if (format === "webp") dims = webpDims(buf);
  } catch {
    dims = null;
  }
  return { format, width: dims?.width ?? null, height: dims?.height ?? null };
}

// packages/cli/src/lib/agentClient.ts
var PRODUCT_TYPE = "puffergo_product";
var AgentHttpError = class extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
};
var AgentClient = class {
  constructor(cfg) {
    this.cfg = cfg;
    this.base = `${cfg.siteUrl.replace(/\/+$/, "")}/wp-json/wp-abilities/v1/abilities/puffergo`;
    this.authHeader = `Basic ${Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString("base64")}`;
  }
  base;
  authHeader;
  get siteUrl() {
    return this.cfg.siteUrl;
  }
  async call(method, path, body, base = this.base) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader
      },
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : void 0;
    } catch {
      json = { code: "invalid_json", message: text.slice(0, 300) };
    }
    if (!res.ok) throw new AgentHttpError(res.status, json);
    return json;
  }
  /** Readonly abilities run over GET. Core reads the raw `input` query param (no JSON decoding), so each
   *  field goes as `input[field]=value`; empty fields are left out. */
  read(ability, input = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(input)) {
      if (v !== void 0 && v !== "") q.set(`input[${k}]`, String(v));
    }
    const qs = q.toString();
    return this.call("GET", `/${ability}/run${qs ? `?${qs}` : ""}`);
  }
  write(ability, input) {
    return this.call("POST", `/${ability}/run`, { input });
  }
  schema() {
    return this.read("get-product-schema");
  }
  /** Products are found through the generic find-posts ability, limited to the product type. */
  listProducts(params = {}) {
    return this.findPosts({ ...params, type: PRODUCT_TYPE });
  }
  postTypes() {
    return this.read("list-post-types");
  }
  findPosts(params = {}) {
    return this.read("find-posts", params);
  }
  getBlocks(id, path) {
    return this.read("get-blocks", { id, path });
  }
  /** With `inPage`, the one block is previewed in place of that block on the post's own page. */
  previewBlocks(blocks, title, inPage) {
    return this.write("preview-blocks", {
      ...blocks.length ? { blocks } : {},
      ...title ? { title } : {},
      ...inPage ?? {}
    });
  }
  /**
   * Creates a draft. The SEO fields are all optional: the plugin creates the draft without them and reports
   * what is missing as advice in the result's `seo.checks`, so a draft can exist before its SEO is agreed
   * (`updateSeo` fills them in later).
   */
  createPost(input) {
    return this.write("create-post", input);
  }
  publishPost(input) {
    return this.write("publish-post", input);
  }
  updateSeo(input) {
    return this.write("update-seo", input);
  }
  /** The block that takes its place: body text as Markdown, a static block as HTML, a component as its data. */
  replaceBlock(input) {
    return this.write("replace-block", input);
  }
  /** Replace the post's WHOLE body with these blocks (title/slug/SEO/categories untouched). */
  updateBody(input) {
    return this.write("update-body", input);
  }
  getProduct(id) {
    return this.read("get-product", { id });
  }
  validate(products2) {
    return this.write("validate-products", { products: products2 });
  }
  upsert(products2) {
    return this.write("upsert-products", { products: products2 });
  }
  /** The product's page as upserting this file would make it, without writing it. */
  previewProduct(product) {
    return this.write("preview-product", { product });
  }
  mediaLookup(sha256) {
    return this.read("find-media", { sha256 });
  }
  /** Product category terms via WordPress's own `/wp/v2/puffergo_product_cat` route; `lang` filters under Polylang. */
  /** @param restBase The taxonomy's own route: `puffergo_product_cat`, `categories`, `docs_category`… */
  async listCategoryTerms(restBase, lang = "") {
    const out = [];
    for (let page = 1; ; page++) {
      const batch = await this.call(
        "GET",
        `/${restBase}?per_page=100&page=${page}&hide_empty=false&context=edit${lang ? `&lang=${encodeURIComponent(lang)}` : ""}`,
        void 0,
        this.wpBase
      );
      out.push(...batch);
      if (batch.length < 100) return out;
    }
  }
  saveCategoryTerm(restBase, id, body) {
    return this.call("POST", `/${restBase}${id ? `/${id}` : ""}`, body, this.wpBase);
  }
  get wpBase() {
    return `${this.cfg.siteUrl.replace(/\/+$/, "")}/wp-json/wp/v2`;
  }
  /** POST /wp/v2/media — outside the puffergo/v1 namespace, so bypasses `base`. */
  async uploadMedia(bytes, filename, mimeType) {
    const url = `${this.cfg.siteUrl.replace(/\/+$/, "")}/wp-json/wp/v2/media`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        Authorization: this.authHeader
      },
      body: bytes
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) throw new AgentHttpError(res.status, json);
    return { id: json.id ?? 0, url: json.source_url ?? "" };
  }
};

// packages/cli/src/skillName.ts
var SKILL_NAME = "puffergo-wordpress-products";

// packages/cli/src/lib/siteSchema.ts
var SUPPORTED_SCHEMA_VERSION = 6;
var MIN_SCHEMA_VERSION = 6;
var SchemaVersionError = class extends Error {
  constructor(siteVersion) {
    super(
      `The site's PufferGo plugin uses product-file version ${siteVersion}; this Skill understands up to ${SUPPORTED_SCHEMA_VERSION}. Update the Skill (download the latest ${SKILL_NAME}) and try again.`
    );
    this.siteVersion = siteVersion;
  }
};
var PluginOutdatedError = class extends Error {
  constructor() {
    super(
      "This site's PufferGo plugin (or WordPress) is too old for this Skill. In wp-admin, update the PufferGo plugin to the latest version and WordPress to 6.9 or newer, then try again."
    );
  }
};
var ABILITIES_MISSING = /* @__PURE__ */ new Set(["rest_no_route", "rest_ability_not_found"]);
var cache = /* @__PURE__ */ new WeakMap();
function loadSiteSchema(c) {
  if (!cache.has(c)) {
    cache.set(
      c,
      c.schema().catch((e) => {
        const code = e instanceof AgentHttpError ? e.body?.code : void 0;
        throw code && ABILITIES_MISSING.has(code) ? new PluginOutdatedError() : e;
      }).then((raw) => {
        if (raw.schemaVersion > SUPPORTED_SCHEMA_VERSION) throw new SchemaVersionError(raw.schemaVersion);
        if (!(raw.schemaVersion >= MIN_SCHEMA_VERSION)) throw new PluginOutdatedError();
        return raw;
      })
    );
  }
  return cache.get(c);
}
function optionalFactPaths(schema) {
  return [...schema.tradeFields.map((f) => f.path), "specs"];
}
function getPath(obj, path) {
  return path.split(".").reduce((o, k) => o && typeof o === "object" ? o[k] : void 0, obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== "object") o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}
function isEmptyValue(v) {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

// packages/cli/src/lib/siteCmd.ts
async function client(ctx) {
  const cred = await resolveSite2(ctx.dir, ctx.flags.get("site"));
  const c = new AgentClient(cred.config);
  await loadSiteSchema(c);
  return c;
}
function siteErrorOutput(e) {
  if (e instanceof NoSiteError) return { ok: false, code: "no_site", sites: e.sites };
  if (e instanceof NotLoggedInError) return { ok: false, code: "not_logged_in" };
  if (e instanceof SchemaVersionError) return { ok: false, code: "update_skill", fix: "user", message: e.message };
  if (e instanceof PluginOutdatedError) return { ok: false, code: "update_plugin", fix: "user", message: e.message };
  return null;
}
function abilityError(e) {
  const body = e.body ?? {};
  return {
    ok: false,
    code: body.code ?? `http_${e.status}`,
    message: body.message ?? `HTTP ${e.status}`,
    ...body.data?.errors ? { errors: body.data.errors } : {},
    fix: body.data?.fix ?? (e.status === 400 ? "ai" : void 0)
  };
}
var UsageError = class extends Error {
};
var CodedError = class extends Error {
  constructor(code, message, fix) {
    super(message);
    this.code = code;
    this.fix = fix;
  }
};
async function runWith(connect3, ctx, body) {
  try {
    return await body(await connect3(ctx));
  } catch (e) {
    return errorOutput(e);
  }
}
function errorOutput(e) {
  const siteErr = siteErrorOutput(e);
  if (siteErr) return siteErr;
  if (e instanceof UsageError) return { ok: false, code: "usage", message: e.message };
  if (e instanceof CodedError) return { ok: false, code: e.code, fix: e.fix ?? "ai", message: e.message };
  if (e instanceof AgentHttpError) return abilityError(e);
  return { ok: false, code: "error", message: e instanceof Error ? e.message : String(e) };
}
function isLive(status) {
  return status === "publish" || status === "future";
}
var PUBLISH_INTENT = /发布|上线|公开|publish|go live|make (it|them|.+) live|put (it|them|.+) live/i;
function customerSaid(ctx) {
  return ctx.flags.get("customer-said")?.trim() || void 0;
}
function publishRefusal(ctx, kind) {
  if (PUBLISH_INTENT.test(customerSaid(ctx) ?? "")) return null;
  return {
    ok: false,
    code: "needs_publish_request",
    fix: "user",
    message: `Publishing makes this ${kind} public. Only publish when the customer explicitly asked to publish (\u53D1\u5E03/\u4E0A\u7EBF/publish) \u2014 "\u6539"/"\u63A8"/"\u4E0A\u4F20"/"\u66F4\u65B0" do not. Ask the customer; if they say to publish, pass their exact words with --customer-said.`
  };
}
function conflictOutput(e, reread) {
  const conflict = e instanceof AgentHttpError && e.body?.code === "conflict";
  if (!conflict) return null;
  return {
    ok: false,
    code: "conflict",
    fix: "ai",
    message: `It changed on the site since you read it (maybe edited in wp-admin). Run \`${reread}\` again and redo the change on the fresh version.`
  };
}
function liveLockedMessage(kind, group2) {
  const show = kind === "page" ? "Show the customer the preview (for SEO, the current and new values)" : "Show the customer the change";
  return `This ${kind} is published, so it was left unchanged. ${show}; once they agree, run the same command again with --customer-said "<their exact words>". To change many live ${group2} in a row, use \`${group2} edit-live on --customer-said "\u2026"\` and \`edit-live off\` when done.`;
}
async function cmdEditLive(ctx) {
  const sub = ctx.positional[0];
  try {
    const { config } = await resolveSite2(ctx.dir, ctx.flags.get("site"));
    const siteUrl = config.siteUrl;
    if (sub === "on") {
      const said = (ctx.flags.get("customer-said") ?? "").trim();
      if (!said)
        return {
          ok: false,
          code: "needs_customer_request",
          fix: "user",
          message: "Turn this on only when the customer asks to change published products, pages or posts, or existing categories. Pass their exact words with --customer-said."
        };
      await writeSiteConfig(ctx.dir, siteUrl, {
        ...await readSiteConfig(ctx.dir, siteUrl),
        editLive: { on: true, customerSaid: said, at: (/* @__PURE__ */ new Date()).toISOString() }
      });
      return {
        ok: true,
        editLive: true,
        note: "products push and pages replace now change live pages directly. Turn it off with `edit-live off` when done."
      };
    }
    if (sub === "off") {
      await writeSiteConfig(ctx.dir, siteUrl, { ...await readSiteConfig(ctx.dir, siteUrl), editLive: void 0 });
      return { ok: true, editLive: false };
    }
    if (sub === void 0) return { ok: true, editLive: await editLiveAllowed(ctx.dir, siteUrl) };
    return {
      ok: false,
      code: "usage",
      message: 'usage: puffergo <products|pages> edit-live [on --customer-said "\u2026" | off]'
    };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    return { ok: false, code: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

// packages/cli/src/lib/productFiles.ts
import { readFile as readFile9, writeFile as writeFile8, readdir as readdir3, mkdir as mkdir8 } from "node:fs/promises";
import { existsSync as existsSync9 } from "node:fs";

// packages/cli/src/lib/workdirState.ts
import { existsSync as existsSync8 } from "node:fs";
import { mkdir as mkdir7, readFile as readFile8, writeFile as writeFile7 } from "node:fs/promises";
import { dirname as dirname7, join as join7 } from "node:path";
function siteState(fileName) {
  const path = (dir2, siteUrl) => join7(dir2, siteStatePath(siteKey(siteUrl), fileName));
  const readOne = async (dir2, siteUrl) => {
    const p = path(dir2, siteUrl);
    if (!existsSync8(p)) return {};
    try {
      return JSON.parse(await readFile8(p, "utf8"));
    } catch {
      return {};
    }
  };
  const writeOne = async (dir2, siteUrl, value) => {
    const p = path(dir2, siteUrl);
    await mkdir7(dirname7(p), { recursive: true });
    await writeFile7(p, JSON.stringify(value, null, 2) + "\n", "utf8");
  };
  return {
    read: readOne,
    write: writeOne,
    async remember(dir2, siteUrl, key, entry) {
      const cur = await readOne(dir2, siteUrl);
      await writeOne(dir2, siteUrl, { ...cur, [key]: entry });
    }
  };
}

// packages/cli/src/lib/productFiles.ts
import { join as join8 } from "node:path";
function productsDir(dir2) {
  return join8(dir2, "products");
}
function productFilePath(dir2, key) {
  return join8(productsDir(dir2), `${key}.json`);
}
async function loadProducts(dir2, only) {
  const dirPath = productsDir(dir2);
  if (!existsSync9(dirPath)) return [];
  let files;
  if (only && only.length) {
    files = only.map((k) => `${k}.json`);
  } else {
    files = (await readdir3(dirPath)).filter((f) => f.endsWith(".json"));
  }
  const out = [];
  for (const f of files) {
    const path = join8(dirPath, f);
    if (!existsSync9(path)) continue;
    const raw = await readFile9(path, "utf8");
    const fileKey = f.replace(/\.json$/, "");
    try {
      out.push({ fileKey, path, product: JSON.parse(raw) });
    } catch (e) {
      out.push({ fileKey, path, product: { title: "" }, parseError: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
async function writeProduct(dir2, key, product) {
  await mkdir8(productsDir(dir2), { recursive: true });
  await writeFile8(productFilePath(dir2, key), JSON.stringify(product, null, 2) + "\n", "utf8");
}
var uploadsState = siteState("uploads.json");
async function readUploadsCache(dir2, siteUrl) {
  return uploadsState.read(dir2, siteUrl);
}
async function writeUploadsCache(dir2, siteUrl, cache2) {
  return uploadsState.write(dir2, siteUrl, cache2);
}

// packages/cli/src/lib/localCheck.ts
import { stat, readFile as readFile10 } from "node:fs/promises";
import { existsSync as existsSync10 } from "node:fs";
import { resolve as resolve4 } from "node:path";

// packages/cli/src/lib/detailBlocks.ts
function detailBlocks(product, ident) {
  return (product.detail?.blocks ?? []).map((block2, i) => ({ path: `${ident}.detail.blocks[${i}]`, block: block2 }));
}
function htmlText(html2) {
  return html2.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function blockSignature(blocks) {
  return blocks.map((b) => {
    if (b.type === "config") return `config:${b.component}`;
    return b.type === "static" ? "static" : "native";
  });
}
function mergedBlockSignature(blocks) {
  const out = [];
  for (const kind of blockSignature(blocks)) {
    if (kind === "native" && out[out.length - 1] === "native") continue;
    out.push(kind);
  }
  return out;
}
function detailWarnings(product, ident) {
  if (product.id || detailBlocks(product, ident).some((b) => b.block.type === "config")) return [];
  return [
    {
      path: `${ident}.detail`,
      code: "no_detail_component",
      message: "The detail has no component. Suggest the customer one (see the Skill), unless they want it this way.",
      fix: "user"
    }
  ];
}

// packages/cli/src/lib/imageRefs.ts
function identOf(product) {
  if (product.key) return product.key;
  if (product.id) return `#${product.id}`;
  return "?";
}
function walkImageRefs(product) {
  const ident = identOf(product);
  const out = [];
  (product.gallery ?? []).forEach((ref, i) => {
    out.push({
      path: `${ident}.gallery[${i}]`,
      place: "productGallery",
      ref,
      set: (next) => {
        product.gallery[i] = next;
      }
    });
  });
  for (const { path, block: block2 } of detailBlocks(product, ident)) {
    if (block2.type !== "image" || !block2.image) continue;
    out.push({
      path: `${path}.image`,
      place: "detailImage",
      ref: block2.image,
      set: (next) => {
        block2.image = next;
      }
    });
  }
  return out;
}

// packages/cli/src/lib/configData.ts
var TEXT_TYPES = /* @__PURE__ */ new Set(["text", "textarea", "richtext"]);
var IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif)$/i;
var isUrl = (v) => /^(https?:)?\/\//i.test(v);
var isLocalImage = (v) => IMAGE_FILE.test(v) && !isUrl(v);
function configLeaves(data, schema, path = "data") {
  const out = [];
  const walk = (obj, fields, at) => {
    for (const [key, value] of Object.entries(obj)) {
      const field = fields?.[key];
      if (typeof value === "string") {
        out.push({ path: `${at}.${key}`, value, field, row: obj, set: (next) => obj[key] = next });
      } else if (Array.isArray(value)) {
        value.forEach((row, i) => {
          if (row && typeof row === "object")
            walk(row, field?.itemSchema, `${at}.${key}[${i}]`);
        });
      } else if (value && typeof value === "object") {
        walk(value, field?.itemSchema, `${at}.${key}`);
      }
    }
  };
  if (data && typeof data === "object" && !Array.isArray(data)) walk(data, schema, path);
  return out;
}
function configTexts(data, schema, path) {
  return configLeaves(data, schema, path).filter(
    (l) => l.field ? TEXT_TYPES.has(l.field.type ?? "") : !isUrl(l.value) && !isLocalImage(l.value)
  );
}
function configImages(data, schema, path) {
  return configLeaves(data, schema, path).filter((l) => l.field ? l.field.type === "image" : isLocalImage(l.value));
}
function slotClass(leaf) {
  return leaf.field?.slotWhen?.find(
    (rule) => Object.entries(rule.when ?? {}).every(([k, allowed]) => allowed.includes(String(leaf.row[k] ?? "")))
  )?.slotClass;
}
function walkConfigImages(product, ident, components) {
  return detailBlocks(product, ident).flatMap(({ path, block: block2 }) => {
    if (block2.type !== "config") return [];
    return configImages(block2.data, components?.[block2.component]?.schema, `${path}.data`).map((leaf) => ({
      ...leaf,
      place: `${block2.component}|${slotClass(leaf) ?? ""}`
    }));
  });
}

// packages/cli/src/lib/claims.ts
var CLAIMS = [
  "world-class",
  "world class",
  "leading",
  "industry-leading",
  "market-leading",
  "state-of-the-art",
  "cutting-edge",
  "best-in-class",
  "top-rated",
  "top-quality",
  "unmatched",
  "unrivaled",
  "unparalleled",
  "second to none",
  "superior",
  "outstanding",
  "exceptional",
  "premium",
  "guaranteed?"
];
var CLAIM_RE = CLAIMS.length ? new RegExp(`\\b(${CLAIMS.join("|")})\\b`, "gi") : null;
function given(p) {
  const specs = (p.specs ?? []).flatMap((s) => [s?.key, s?.value]);
  const trade = Object.values(p.trade ?? {});
  return [...specs, ...trade].filter((v) => typeof v === "string").join(" ");
}
function texts(p) {
  const id = identOf(p);
  const out = [
    [`${id}.title`, p.title],
    [`${id}.excerpt`, p.excerpt],
    [`${id}.seo.title`, p.seo?.title],
    [`${id}.seo.description`, p.seo?.description]
  ];
  for (const { path, block: block2 } of detailBlocks(p, id)) {
    if (block2.type === "static") out.push([`${path}.html`, htmlText(block2.html)]);
    if (block2.type === "config")
      for (const t of configTexts(block2.data, void 0, `${path}.data`)) out.push([t.path, t.value]);
  }
  return out;
}
function claimWarning(path, text, before = "") {
  if (!CLAIM_RE) return null;
  const had = new Set(before.match(CLAIM_RE)?.map((w) => w.toLowerCase()) ?? []);
  const found = [...new Set((text ?? "").match(CLAIM_RE)?.map((w) => w.toLowerCase()) ?? [])].filter((w) => !had.has(w));
  if (!found.length) return null;
  return {
    path,
    code: "unsupported_claim",
    message: `Says ${found.map((w) => `"${w}"`).join(", ")}. This is a reminder, not a block: check it against what the customer said \u2014 if they said it in their own words, or they approve it, keep it; otherwise reword to the facts they gave.`,
    fix: "user"
  };
}
function claimWarnings(p) {
  const facts = given(p);
  return texts(p).map(([path, text]) => claimWarning(path, text, facts)).filter((w) => w !== null);
}

// packages/cli/src/lib/imageAdvice.ts
var RATIO_TOLERANCE = 0.05;
var TOO_LARGE_FACTOR = 1.5;
var PLACE_LABELS = {
  productGallery: "product gallery"
};
function ratioValue(ratio) {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio);
  return m ? Number(m[1]) / Number(m[2]) : null;
}
function ratioFits(info, spec) {
  const target = spec.ratio ? ratioValue(spec.ratio) : null;
  if (!target || !info.height) return true;
  return Math.abs(info.width / info.height / target - 1) <= RATIO_TOLERANCE;
}
function placeProblems(info, place, spec, maxBytes) {
  const out = [];
  if (info.bytes > maxBytes) out.push(`${Math.round(info.bytes / 1024)}KB, over ${Math.round(maxBytes / 1024)}KB`);
  if (!ratioFits(info, spec)) {
    out.push(
      place === "productGallery" ? `not ${spec.ratio}, so it shows with blank margins` : `not ${spec.ratio}, so the site crops it to ${spec.ratio}`
    );
  }
  if (spec.width && info.width < spec.width)
    out.push(`${info.width}px wide, smaller than ${spec.width}px, may look blurry`);
  else if (spec.width && spec.ratio && info.width > spec.width * TOO_LARGE_FACTOR)
    out.push(`${info.width}x${info.height}, much larger than needed`);
  return out;
}
function suggestion(spec, maxBytes) {
  const size = spec.height ? `${spec.width}x${spec.height} (${spec.ratio})` : `at least ${spec.width}px wide, any ratio`;
  return `Suggested ${size}, WebP, under ${Math.round(maxBytes / 1024)}KB. Crop and compress here: ${spec.cropUrl}`;
}

// packages/cli/src/lib/localCheck.ts
async function localCheckProduct(product, baseDir, images, components) {
  const errors = [];
  const warnings = [];
  const ident = identOf(product);
  const locals = [
    ...walkImageRefs(product).flatMap(({ path, ref, place }) => ref.file ? [{ path, place, file: ref.file }] : []),
    ...walkConfigImages(product, ident, components).filter((l) => isLocalImage(l.value)).map(({ path, place, value }) => ({ path, place, file: value }))
  ];
  for (const { path, place, file } of locals) {
    const ref = { file };
    const abs = resolve4(baseDir, ref.file);
    if (!existsSync10(abs)) {
      errors.push({ path, code: "not_found", message: `File not found: ${ref.file}`, fix: "ai" });
      continue;
    }
    const st = await stat(abs);
    if (st.size > MAX_BYTES) {
      errors.push({
        path,
        code: "format",
        message: `File too large (${(st.size / 1024 / 1024).toFixed(1)}MB > 10MB): ${ref.file}`,
        fix: "ai"
      });
      continue;
    }
    const bytes = await readFile10(abs);
    const { format, width, height } = sniffImage(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    if (!format) {
      errors.push({
        path,
        code: "format",
        message: `Not a recognized image (jpeg/png/webp/gif) by file content: ${ref.file}`,
        fix: "ai"
      });
      continue;
    }
    const spec = images?.places[place];
    if (spec && width != null && height != null) {
      const problems = placeProblems({ bytes: st.size, width, height }, place, spec, images.maxBytes);
      if (problems.length) {
        warnings.push({
          path,
          code: "image_advice",
          message: `${ref.file} in the ${PLACE_LABELS[place] ?? `${components?.[place.split("|")[0]]?.name ?? place.split("|")[0]} component`}: ${problems.join("; ")}. ${suggestion(spec, images.maxBytes)}`,
          fix: "user"
        });
      }
    } else if (width != null && height != null) {
      const shortest = Math.min(width, height);
      if (shortest < 600) {
        warnings.push({
          path,
          code: "format",
          message: `Image is small (${width}x${height}, shortest edge ${shortest}px < 600px): ${ref.file}`,
          fix: "user"
        });
      }
    }
  }
  warnings.push(
    ...claimWarnings(product),
    ...altWarnings(product, ident, components),
    ...detailWarnings(product, ident)
  );
  return { errors, warnings };
}
function altWarnings(product, ident, components) {
  const out = [];
  const message = (what) => `${what} has no alt text. Add one short English sentence saying what the picture shows, with the product name in it.`;
  for (const { path, ref } of walkImageRefs(product)) {
    if (!ref.alt?.trim())
      out.push({ path: `${path}.alt`, code: "missing_alt", message: message(`The image at ${path}`), fix: "ai" });
  }
  for (const { path, row } of walkConfigImages(product, ident, components)) {
    if (typeof row.imageAlt === "string" && row.imageAlt.trim()) continue;
    const altPath = path.replace(/\.image$/i, ".imageAlt");
    out.push({ path: altPath, code: "missing_alt", message: message(`The image at ${altPath}`), fix: "ai" });
  }
  return out;
}

// packages/cli/src/lib/uploadImage.ts
import { createHash as createHash3 } from "node:crypto";
import { readFile as readFile11 } from "node:fs/promises";
import { basename as basename5 } from "node:path";
function sha256Hex(bytes) {
  return createHash3("sha256").update(bytes).digest("hex");
}
async function resolveUpload(client2, cache2, absPath) {
  const bytes = await readFile11(absPath);
  const sha256 = sha256Hex(bytes);
  const cached = cache2[sha256];
  if (cached) return { mediaId: cached.mediaId, url: cached.url, sha256, reused: true };
  const lookup = await client2.mediaLookup(sha256);
  if (lookup.found && lookup.mediaId) {
    cache2[sha256] = { mediaId: lookup.mediaId, url: lookup.url ?? "" };
    return { mediaId: lookup.mediaId, url: lookup.url ?? "", sha256, reused: true };
  }
  const filename = basename5(absPath);
  const format = sniffImage(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).format ?? "jpeg";
  const mime = `image/${format}`;
  const { id, url } = await client2.uploadMedia(new Uint8Array(bytes), filename, mime);
  cache2[sha256] = { mediaId: id, url };
  return { mediaId: id, url, sha256, reused: false };
}

// packages/cli/src/lib/samples.ts
var samplesState = siteState("samples.json");
async function readSamples(dir2, siteUrl, kind) {
  return (await samplesState.read(dir2, siteUrl))[kind] ?? {};
}
async function writeSamples(dir2, siteUrl, kind, samples) {
  await samplesState.remember(dir2, siteUrl, kind, samples);
}
var TargetError = class extends CodedError {
};
async function resolveProductId(c, target) {
  if (/^\d+$/.test(target)) return Number(target);
  if (/^https?:\/\//i.test(target)) {
    const host = (u) => new URL(u).host.replace(/^www\./, "").toLowerCase();
    if (host(target) !== host(c.siteUrl)) {
      throw new TargetError(
        "other_site",
        `This link is on ${new URL(target).host}, not the connected site ${c.siteUrl}.`
      );
    }
    const list3 = await c.listProducts({ url: target });
    if (!list3.items[0]) throw new TargetError("not_found", `No product found at ${target}`);
    return list3.items[0].id;
  }
  const list2 = await c.listProducts({ key: target });
  if (!list2.items[0]) throw new TargetError("not_found", `No product with key "${target}"`);
  return list2.items[0].id;
}
var FROM_CUSTOMER = "<from customer>";
var TEXT = "<text from customer facts>";
function maskUnitValue(v) {
  if (!v || v.type === "contact") return v;
  const out = {};
  for (const k of ["value", "min", "max"]) if (v[k] !== void 0) out[k] = FROM_CUSTOMER;
  if (v.unit) out.unit = v.unit;
  return out;
}
function sampleReference(remote, schema) {
  const p = JSON.parse(JSON.stringify(remote));
  for (const k of ["id", "key", "baseModified", "status", "link", "editUrl"])
    delete p[k];
  for (const { ref } of walkImageRefs(p)) {
    for (const k of Object.keys(ref)) delete ref[k];
    ref.file = "<customer photo>";
  }
  const out = p;
  for (const f of schema.tradeFields) {
    const v = getPath(out, f.path);
    if (isEmptyValue(v)) continue;
    setPath(out, f.path, f.kind === "unitValue" ? maskUnitValue(v) : FROM_CUSTOMER);
  }
  if (p.specs) out.specs = p.specs.map((s) => ({ key: s.key, value: FROM_CUSTOMER }));
  const shape = (t) => t?.trim() ? TEXT : t;
  p.title = shape(p.title);
  p.excerpt = shape(p.excerpt);
  if (p.seo) {
    p.seo = {
      title: shape(p.seo.title),
      description: shape(p.seo.description),
      focusKeyword: shape(p.seo.focusKeyword),
      keywords: (p.seo.keywords ?? []).map(() => TEXT)
    };
  }
  for (const { block: block2 } of detailBlocks(p, "")) {
    if (block2.type !== "config") continue;
    const fields = schema.blocks?.components?.[block2.component]?.schema;
    for (const t of configTexts(block2.data, fields)) t.set(shape(t.value));
    for (const img of configImages(block2.data, fields)) if (img.value) img.set("<customer photo>");
  }
  if (p.detail?.blocks) {
    p.detail.blocks = p.detail.blocks.map(
      (b) => b.type === "static" ? { type: "static", html: TEXT } : b.type === "native" ? { type: "native", raw: "", name: b.name } : b
    );
  }
  out.notUsed = optionalFactPaths(schema).filter((path) => isEmptyValue(getPath(remote, path)));
  return out;
}

// packages/cli/src/lib/htmlImages.ts
import { existsSync as existsSync11 } from "node:fs";
import { isAbsolute, resolve as resolve5 } from "node:path";
var LOCAL_REF = /(\bsrc\s*=\s*["']|url\(\s*["']?)(?!https?:|\/\/|data:|\/|#)([^"')\s]+)/gi;
function localImageRefs(html2) {
  return [...new Set([...html2.matchAll(LOCAL_REF)].map((m) => m[2]))];
}
var MissingImageError = class extends Error {
  constructor(ref) {
    super(`The image "${ref}" isn't there.`);
    this.ref = ref;
  }
};
async function uploadHtmlImages(c, cache2, html2, baseDir) {
  const urls = /* @__PURE__ */ new Map();
  const uploaded = [];
  let reused = 0;
  for (const ref of localImageRefs(html2)) {
    const abs = isAbsolute(ref) ? ref : resolve5(baseDir, decodeURI(ref));
    if (!existsSync11(abs)) throw new MissingImageError(ref);
    const up = await resolveUpload(c, cache2, abs);
    if (up.reused) reused++;
    else uploaded.push(abs);
    urls.set(ref, up.url);
  }
  return {
    html: html2.replace(LOCAL_REF, (all, pre, ref) => urls.has(ref) ? pre + urls.get(ref) : all),
    uploaded,
    reused
  };
}

// packages/cli/src/lib/categories.ts
import { readFile as readFile12 } from "node:fs/promises";
import { existsSync as existsSync12 } from "node:fs";
import { join as join9 } from "node:path";
var CAT_ORDER_META = "_puffergo_cat_order";
function remoteOrder(term) {
  const raw = term.meta?.[CAT_ORDER_META];
  return typeof raw === "number" ? raw : Number(raw ?? 0) || 0;
}
var CATEGORIES_FILE = "categories.json";
var PRODUCT_CAT_REST_BASE = "puffergo_product_cat";
function categoriesFileFor(type) {
  return `${type}-categories.json`;
}
var MAX_SUGGESTED_DEPTH = 3;
var SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
async function readCategoriesFile(dir2, file = CATEGORIES_FILE) {
  const path = join9(dir2, file);
  if (!existsSync12(path)) return null;
  return JSON.parse(await readFile12(path, "utf8"));
}
function planCategories(tree, remote, opts = {}) {
  const { file = CATEGORIES_FILE, order: takesOrder = true } = opts;
  const errors = [];
  const warnings = [];
  const ops = [];
  const roots = tree?.categories;
  if (!Array.isArray(roots)) return { errors: [`${file} must be { "categories": [ \u2026 ] }`], warnings, ops };
  const bySlug = new Map(remote.map((t) => [t.slug, t]));
  const byId = new Map(remote.map((t) => [t.id, t]));
  const seen = /* @__PURE__ */ new Set();
  const ordersByParent = /* @__PURE__ */ new Map();
  const walk = (nodes, parentSlug, depth, path) => {
    nodes.forEach((raw, i) => {
      const n = raw;
      const at = `${path}[${i}]`;
      const name = typeof n?.name === "string" ? n.name.trim() : "";
      const slug = typeof n?.slug === "string" ? n.slug.trim() : "";
      if (!name) errors.push(`${at}: name is required`);
      if (!SLUG_RE.test(slug))
        errors.push(`${at}: slug "${slug}" must be lowercase English letters, digits and hyphens`);
      else if (seen.has(slug)) errors.push(`${at}: slug "${slug}" is used twice`);
      seen.add(slug);
      if (depth === MAX_SUGGESTED_DEPTH + 1)
        warnings.push(
          `"${name}" is level ${depth}. Suggest the customer keep categories to ${MAX_SUGGESTED_DEPTH} levels.`
        );
      let order;
      if (n?.order !== void 0) {
        if (!takesOrder)
          errors.push(`${at}: order is only for product categories; these are sorted by name. Leave it out.`);
        else if (typeof n.order !== "number" || !Number.isInteger(n.order) || n.order < 1)
          errors.push(`${at}: order must be a whole number \u2265 1 (leave it out to put the category last)`);
        else order = n.order;
      }
      if (order !== void 0) {
        const siblings = ordersByParent.get(parentSlug) ?? /* @__PURE__ */ new Set();
        if (siblings.has(order))
          warnings.push(`Two categories under "${parentSlug || "the top level"}" both have order ${order}.`);
        siblings.add(order);
        ordersByParent.set(parentSlug, siblings);
      }
      if (name && SLUG_RE.test(slug)) {
        const description = typeof n.description === "string" ? n.description : void 0;
        const existing = bySlug.get(slug);
        if (!existing) {
          ops.push({ op: "create", slug, name, description, order, parentSlug });
        } else {
          const currentParent = existing.parent ? byId.get(existing.parent)?.slug ?? "" : "";
          const changed = existing.name !== name || currentParent !== parentSlug || description !== void 0 && existing.description !== description || order !== void 0 && remoteOrder(existing) !== order;
          ops.push(
            changed ? { op: "update", id: existing.id, slug, name, description, order, parentSlug } : { op: "keep", id: existing.id, slug }
          );
        }
      }
      if (n?.children !== void 0) {
        if (Array.isArray(n.children)) walk(n.children, slug, depth + 1, `${at}.children`);
        else errors.push(`${at}.children must be an array`);
      }
    });
  };
  walk(roots, "", 1, "categories");
  return { errors, warnings, ops };
}
async function syncCategories(c, opts) {
  const remote = await c.listCategoryTerms(opts.restBase, opts.language ?? "");
  const sortable = "order" in opts;
  const { errors, warnings, ops } = planCategories(opts.tree, remote, { file: opts.file, order: sortable });
  if (errors.length) return { ok: false, code: "invalid", errors, warnings };
  const wantsOrder = ops.some((o) => o.op !== "keep" && o.order !== void 0);
  if (wantsOrder && opts.order === null)
    return {
      ok: false,
      code: "update_plugin",
      message: "This site's PufferGo plugin is too old to set category order from here. Ask the customer to update the plugin, or to fill in Order on each category in wp-admin."
    };
  if (wantsOrder && opts.order && opts.order.orderby !== "manual")
    warnings.push(
      `Category order is written, but the site sorts these categories by "${opts.order.orderby}", so it has no visible effect yet. Ask the customer to set \u4EA7\u54C1\u8BBE\u7F6E \u2192 \u5206\u7C7B\u6392\u5E8F to \u624B\u52A8 (Manual).`
    );
  const todo = ops.filter((o) => o.op === "create" || o.op === "update" && opts.editLive);
  const leftAlone = opts.editLive ? [] : ops.filter((o) => o.op === "update").map((o) => o.slug);
  const out = {
    ok: true,
    changes: todo.map((o) => ({ op: o.op, slug: o.slug })),
    ...leftAlone.length ? {
      leftAlone,
      leftAloneNote: `These categories already exist on the site and differ from ${opts.file}; they were not changed. The customer can change them in wp-admin, or tell you to turn on editing live content (\`${opts.editLiveHint}\`).`
    } : {},
    warnings
  };
  if (!opts.push) return out;
  const idBySlug = new Map(remote.map((t) => [t.slug, t.id]));
  for (const o of todo) {
    if (o.op === "keep") continue;
    const body = {
      name: o.name,
      slug: o.slug,
      parent: o.parentSlug ? idBySlug.get(o.parentSlug) ?? 0 : 0,
      ...o.description !== void 0 ? { description: o.description } : {},
      ...o.order !== void 0 ? { meta: { [CAT_ORDER_META]: o.order } } : {}
    };
    const saved = await c.saveCategoryTerm(opts.restBase, o.op === "update" ? o.id : null, body);
    idBySlug.set(o.slug, saved.id);
  }
  return out;
}

// packages/cli/src/lib/productsCmd.ts
async function cmdSchema(ctx) {
  try {
    const c = await client(ctx);
    const schema = await loadSiteSchema(c);
    const samples = await readSamples(ctx.dir, c.siteUrl, "product");
    return {
      ok: true,
      ...schema,
      samples: Object.entries(samples).map(([name, t]) => ({ name, id: t.id, title: t.title }))
    };
  } catch (e) {
    return errorOutput(e);
  }
}
async function cmdListProducts(ctx) {
  try {
    const c = await client(ctx);
    const res = await c.listProducts({
      search: ctx.flags.get("search"),
      page: Number(ctx.flags.get("page")) || void 0
    });
    return { ok: true, ...res };
  } catch (e) {
    return errorOutput(e);
  }
}
function stripFileRefsForValidate(product) {
  const clone = JSON.parse(JSON.stringify(product));
  const strippedPaths = /* @__PURE__ */ new Set();
  for (const { path, ref } of walkImageRefs(clone)) {
    if (ref.file) {
      strippedPaths.add(path);
      Object.keys(ref).forEach((k) => delete ref[k]);
    }
  }
  for (const leaf of walkConfigImages(clone, identOf(clone))) {
    if (!isLocalImage(leaf.value)) continue;
    strippedPaths.add(leaf.path);
    leaf.set("");
  }
  delete clone.sample;
  return { clone, strippedPaths };
}
function filterStrippedErrors(list2, strippedPaths) {
  return list2.filter((e) => !strippedPaths.has(e.path));
}
var SampleCtx = class _SampleCtx {
  constructor(c, samples, factPaths) {
    this.c = c;
    this.samples = samples;
    this.factPaths = factPaths;
  }
  notUsed = /* @__PURE__ */ new Map();
  static async load(c, dir2) {
    const schema = await loadSiteSchema(c);
    return new _SampleCtx(c, await readSamples(dir2, c.siteUrl, "product"), optionalFactPaths(schema));
  }
  /** Fields the named sample doesn't use; null when no such sample is saved. */
  async fieldsNotUsed(name) {
    const entry = this.samples[name];
    if (!entry) return null;
    if (!this.notUsed.has(name)) {
      const remote = await this.c.getProduct(entry.id);
      this.notUsed.set(name, new Set(this.factPaths.filter((path) => isEmptyValue(getPath(remote, path)))));
    }
    return this.notUsed.get(name);
  }
};
async function applySample(product, tpl, warnings) {
  const names = Object.keys(tpl.samples);
  if (!product.sample) return { errors: [], warnings };
  const notUsed = await tpl.fieldsNotUsed(product.sample);
  if (!notUsed) {
    return {
      errors: [
        {
          path: `${identOf(product)}.sample`,
          code: "unknown_sample",
          message: `No sample named "${product.sample}". Saved samples: ${names.length ? names.join(", ") : "none"} (see \`products sample list\`).`,
          fix: "ai"
        }
      ],
      warnings
    };
  }
  const ident = identOf(product);
  return {
    errors: [],
    warnings: warnings.filter(
      (w) => !(w.code === "missing_source" && [...notUsed].some((f) => w.path === `${ident}.${f}`))
    )
  };
}
async function checkOne(c, loaded, baseDir, tpl) {
  const { product } = loaded;
  if (loaded.parseError) {
    return {
      key: loaded.fileKey,
      id: null,
      errors: [
        {
          path: `products/${loaded.fileKey}.json`,
          code: "format",
          message: `Invalid JSON: ${loaded.parseError}`,
          fix: "ai"
        }
      ],
      warnings: []
    };
  }
  const site2 = await loadSiteSchema(c);
  const local = await localCheckProduct(
    product,
    baseDir,
    site2.images,
    site2.blocks?.components
  );
  const { clone, strippedPaths } = stripFileRefsForValidate(product);
  let serverErrors = [];
  let serverWarnings = [];
  try {
    const res = await c.validate([clone]);
    const r = res.results[0];
    if (r) {
      serverErrors = filterStrippedErrors(r.errors, strippedPaths);
      serverWarnings = filterStrippedErrors(r.warnings, strippedPaths);
    }
  } catch (e) {
    serverErrors = [
      { path: identOf(product), code: "error", message: e instanceof Error ? e.message : String(e), fix: "ai" }
    ];
  }
  const sampled = await applySample(product, tpl, [...local.warnings, ...serverWarnings]);
  return {
    key: product.key ?? null,
    id: product.id ?? null,
    errors: [...local.errors, ...serverErrors, ...sampled.errors],
    warnings: sampled.warnings
  };
}
async function duplicateIdErrors(dir2) {
  const byId = /* @__PURE__ */ new Map();
  for (const { fileKey, product } of await loadProducts(dir2)) {
    if (typeof product.id === "number") byId.set(product.id, [...byId.get(product.id) ?? [], fileKey]);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [id, keys] of byId) {
    if (keys.length < 2) continue;
    for (const key of keys) {
      out.set(key, {
        path: `${key}.id`,
        code: "duplicate_id",
        message: `Files ${keys.map((k) => `products/${k}.json`).join(", ")} are all product ${id}. Merge them into one file and delete the others.`,
        fix: "ai"
      });
    }
  }
  return out;
}
async function cmdCheck(ctx) {
  const only = ctx.flags.get("only")?.split(",").filter(Boolean);
  const loaded = await loadProducts(ctx.dir, only);
  if (!loaded.length) return { ok: true, results: [] };
  try {
    const c = await client(ctx);
    const tpl = await SampleCtx.load(c, ctx.dir);
    const results = [];
    const dups = await duplicateIdErrors(ctx.dir);
    for (const item of loaded) {
      const r = await checkOne(c, item, ctx.dir, tpl);
      const dup = dups.get(item.fileKey);
      results.push(dup ? { ...r, errors: [dup, ...r.errors] } : r);
    }
    const ok = results.every((r) => r.errors.length === 0);
    return { ok, results };
  } catch (e) {
    return errorOutput(e);
  }
}
function readbackMismatches(local, remote) {
  const mismatches = [];
  const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (local.title !== remote.title)
    mismatches.push(`title: expected "${local.title}", got "${remote.title}"`);
  const expectedStatus = local.status ?? remote.status;
  if (local.status && local.status !== remote.status)
    mismatches.push(`status: expected ${local.status}, got ${remote.status}`);
  if (local.excerpt !== void 0 && (local.excerpt || "") !== (remote.excerpt ?? "")) {
    mismatches.push(`excerpt mismatch`);
  }
  if (local.seo !== void 0) {
    const remoteSeo = remote.seo ?? {};
    for (const [k, v] of Object.entries(local.seo)) if (!eq(v, remoteSeo[k])) mismatches.push(`seo.${k} mismatch`);
  }
  if (local.price !== void 0 && !eq(local.price, remote.price)) mismatches.push("price mismatch");
  if (local.moq !== void 0 && !eq(local.moq, remote.moq)) mismatches.push("moq mismatch");
  if (local.leadTime !== void 0 && !eq(local.leadTime, remote.leadTime)) mismatches.push("leadTime mismatch");
  if (local.trade !== void 0) {
    const nonEmpty = (m) => Object.fromEntries(
      Object.entries(m ?? {}).filter(([, v]) => !isEmptyValue(v)).sort()
    );
    if (!eq(nonEmpty(local.trade), nonEmpty(remote.trade))) mismatches.push("trade mismatch");
  }
  const localSpecCount = (local.specs ?? []).length;
  const remoteSpecCount = (remote.specs ?? []).length;
  if (local.specs !== void 0 && localSpecCount !== remoteSpecCount) {
    mismatches.push(`specs count: expected ${localSpecCount}, got ${remoteSpecCount}`);
  }
  const localGalleryCount = (local.gallery ?? []).length;
  const remoteGalleryCount = (remote.gallery ?? []).length;
  if (local.gallery !== void 0 && localGalleryCount !== remoteGalleryCount) {
    mismatches.push(`gallery count: expected ${localGalleryCount}, got ${remoteGalleryCount}`);
  }
  if (local.detail !== void 0) {
    const localBlocks = detailBlocks(local, "").map((w) => w.block);
    const remoteBlocks = remote.detail?.blocks ?? [];
    const remoteSig = mergedBlockSignature(
      local.detail.blocks ? remoteBlocks : remoteBlocks.filter((b) => b.type === "config")
    );
    const localSig = mergedBlockSignature(localBlocks);
    if (!(local.detail.blocks ? eq(localSig, remoteSig) : remoteSig.includes(localSig[0]))) {
      mismatches.push(`detail blocks mismatch: expected ${JSON.stringify(localSig)}, got ${JSON.stringify(remoteSig)}`);
    }
  }
  void expectedStatus;
  return mismatches;
}
function toWirePayload(product) {
  const clone = JSON.parse(JSON.stringify(product));
  delete clone.sample;
  for (const { ref } of walkImageRefs(clone)) {
    delete ref.file;
  }
  return clone;
}
async function prepareWire(c, loaded, ctx, cache2, tpl, allowPublish) {
  const { product } = loaded;
  const checkOutcome = await checkOne(c, loaded, ctx.dir, tpl);
  if (checkOutcome.errors.length) {
    return {
      wire: product,
      uploaded: 0,
      reused: 0,
      errors: checkOutcome.errors,
      warnings: checkOutcome.warnings,
      statusWarnings: []
    };
  }
  let uploaded = 0;
  let reused = 0;
  const uploadErrors = [];
  const wire = JSON.parse(JSON.stringify(product));
  const statusWarnings = [];
  if (wire.status === "publish" && !allowPublish) {
    delete wire.status;
    statusWarnings.push({
      path: `${identOf(product)}.status`,
      code: "publish_ignored",
      message: "push never publishes; the site status was left unchanged. Use `products publish` only when the customer asks to publish.",
      fix: "user"
    });
  }
  for (const { ref, path: refPath } of walkImageRefs(wire)) {
    if (!ref.file) continue;
    try {
      const abs = resolve6(ctx.dir, ref.file);
      const res = await resolveUpload(c, cache2, abs);
      if (res.reused) reused++;
      else uploaded++;
      ref.mediaId = res.mediaId;
      ref.sha256 = res.sha256;
      delete ref.file;
    } catch (e) {
      uploadErrors.push({
        path: refPath,
        code: "error",
        message: e instanceof Error ? e.message : String(e),
        fix: "ai"
      });
    }
  }
  for (const leaf of walkConfigImages(wire, identOf(product))) {
    if (!isLocalImage(leaf.value)) continue;
    try {
      const res = await resolveUpload(c, cache2, resolve6(ctx.dir, leaf.value));
      if (res.reused) reused++;
      else uploaded++;
      leaf.set(res.url);
    } catch (e) {
      uploadErrors.push({
        path: leaf.path,
        code: "error",
        message: e instanceof Error ? e.message : String(e),
        fix: "ai"
      });
    }
  }
  for (const { path: blockPath, block: block2 } of detailBlocks(wire, identOf(product))) {
    if (block2.type !== "static") continue;
    try {
      const up = await uploadHtmlImages(c, cache2, block2.html, ctx.dir);
      block2.html = up.html;
      uploaded += up.uploaded.length;
      reused += up.reused;
    } catch (e) {
      uploadErrors.push({
        path: `${blockPath}.html`,
        code: e instanceof MissingImageError ? "not_found" : "error",
        message: e instanceof MissingImageError ? `${e.message} Image paths in static HTML are relative to the working folder.` : String(e instanceof Error ? e.message : e),
        fix: "ai"
      });
    }
  }
  return {
    wire,
    uploaded,
    reused,
    errors: uploadErrors,
    warnings: checkOutcome.warnings,
    statusWarnings
  };
}
async function pushOne(c, loaded, ctx, cache2, allowPublish, tpl, editLive) {
  const { product } = loaded;
  if (!editLive && await isLive2(c, product)) {
    return {
      key: product.key ?? null,
      id: product.id ?? null,
      ok: false,
      uploaded: 0,
      reused: 0,
      errors: [
        {
          path: identOf(product),
          code: "live_locked",
          fix: "ai",
          message: liveLockedMessage("product", "products")
        }
      ],
      warnings: []
    };
  }
  const prep = await prepareWire(c, loaded, ctx, cache2, tpl, allowPublish);
  const { wire, uploaded, reused } = prep;
  if (prep.errors.length) {
    return {
      key: product.key ?? null,
      id: product.id ?? null,
      ok: false,
      uploaded,
      reused,
      errors: prep.errors,
      warnings: prep.warnings
    };
  }
  const payload = toWirePayload(wire);
  let upsertRes;
  try {
    const results = await c.upsert([payload]);
    upsertRes = results[0];
  } catch (e) {
    return {
      key: product.key ?? null,
      id: product.id ?? null,
      ok: false,
      uploaded,
      reused,
      errors: [
        { path: identOf(product), code: "error", message: e instanceof Error ? e.message : String(e), fix: "ai" }
      ],
      warnings: prep.warnings
    };
  }
  if (!upsertRes.ok || !upsertRes.id) {
    return {
      key: upsertRes.key ?? product.key ?? null,
      id: upsertRes.id ?? product.id ?? null,
      ok: false,
      uploaded,
      reused,
      errors: upsertRes.errors,
      warnings: prep.warnings
    };
  }
  product.id = upsertRes.id;
  if (upsertRes.key) product.key = upsertRes.key;
  product.baseModified = upsertRes.modifiedGmt;
  await writeProduct(ctx.dir, loaded.fileKey, product);
  let readbackErrors = [];
  try {
    const remote = await c.getProduct(upsertRes.id);
    const mismatches = readbackMismatches({ ...product, status: wire.status }, remote);
    if (mismatches.length) {
      readbackErrors = mismatches.map((m) => ({
        path: identOf(product),
        code: "readback_mismatch",
        message: readbackMessage(m, upsertRes.id),
        fix: "ai"
      }));
    }
  } catch (e) {
    readbackErrors = [
      {
        path: identOf(product),
        code: "readback_mismatch",
        message: readbackMessage(e instanceof Error ? e.message : String(e), upsertRes.id),
        fix: "ai"
      }
    ];
  }
  return {
    key: upsertRes.key ?? null,
    id: upsertRes.id,
    ok: readbackErrors.length === 0,
    status: upsertRes.status,
    previewUrl: upsertRes.previewUrl,
    editUrl: upsertRes.editUrl,
    uploaded,
    reused,
    errors: readbackErrors,
    warnings: [...prep.warnings, ...prep.statusWarnings]
  };
}
function readbackMessage(mismatch, id) {
  const written = id ? ` The draft #${id} was still written to the site \u2014 run \`products pull ${id}\` and re-apply your changes before pushing this file again.` : "";
  return `${mismatch}.${written}`;
}
async function isLive2(c, product) {
  if (product.id) {
    try {
      return isLive((await c.getProduct(product.id)).status);
    } catch (e) {
      if (e instanceof AgentHttpError && e.status === 404) return false;
      throw e;
    }
  }
  if (!product.key) return false;
  const found = await c.listProducts({ key: product.key });
  return isLive(found.items[0]?.status);
}
async function cmdPush(ctx, allowPublish = false) {
  const only = ctx.flags.get("only")?.split(",").filter(Boolean);
  const said = allowPublish ? void 0 : customerSaid(ctx);
  if (said && !only?.length)
    return {
      ok: false,
      code: "usage",
      fix: "ai",
      message: "With --customer-said, name the live products the customer agreed to change: --only k1,k2."
    };
  const loaded = await loadProducts(ctx.dir, only);
  if (!loaded.length) return { ok: true, results: [] };
  try {
    const c = await client(ctx);
    const cache2 = await readUploadsCache(ctx.dir, c.siteUrl);
    const tpl = await SampleCtx.load(c, ctx.dir);
    const editLive = !!said || await editLiveAllowed(ctx.dir, c.siteUrl);
    const results = [];
    const dups = await duplicateIdErrors(ctx.dir);
    for (const item of loaded) {
      const dup = dups.get(item.fileKey);
      if (dup) {
        results.push({
          key: item.product.key ?? null,
          id: item.product.id ?? null,
          ok: false,
          uploaded: 0,
          reused: 0,
          errors: [dup],
          warnings: []
        });
        continue;
      }
      results.push(await pushOne(c, item, ctx, cache2, allowPublish, tpl, editLive));
      await writeUploadsCache(ctx.dir, c.siteUrl, cache2);
    }
    const ok = results.every((r) => r.ok);
    return { ok, results };
  } catch (e) {
    return errorOutput(e);
  }
}
async function cmdPreview(ctx) {
  const keys = ctx.positional;
  if (!keys.length) return { ok: false, code: "usage", fix: "ai", message: "usage: puffergo products preview <key\u2026>" };
  const loaded = await loadProducts(ctx.dir, keys);
  const missing = keys.filter((k) => !loaded.some((l) => l.fileKey === k));
  if (missing.length)
    return { ok: false, code: "not_found", message: `No local file products/<key>.json for: ${missing.join(", ")}.` };
  try {
    const c = await client(ctx);
    const cache2 = await readUploadsCache(ctx.dir, c.siteUrl);
    const tpl = await SampleCtx.load(c, ctx.dir);
    const results = [];
    for (const item of loaded) {
      results.push(await previewOne(c, item, ctx, cache2, tpl));
      await writeUploadsCache(ctx.dir, c.siteUrl, cache2);
    }
    return { ok: results.every((r) => r.ok), results };
  } catch (e) {
    return errorOutput(e);
  }
}
async function previewOne(c, loaded, ctx, cache2, tpl) {
  const { product } = loaded;
  const failed = (errors, warnings = []) => ({
    key: product.key ?? null,
    id: product.id ?? null,
    ok: false,
    errors,
    warnings
  });
  const prep = await prepareWire(c, loaded, ctx, cache2, tpl, false);
  if (prep.errors.length) return failed(prep.errors, prep.warnings);
  try {
    const res = await c.previewProduct(toWirePayload(prep.wire));
    if (!res.ok) return failed(res.errors ?? [], res.warnings ?? prep.warnings);
    return {
      key: product.key ?? null,
      id: res.id ?? product.id ?? null,
      ok: true,
      previewUrl: res.previewUrl,
      notShown: res.notShown ?? [],
      errors: [],
      warnings: res.warnings ?? prep.warnings
    };
  } catch (e) {
    if (!(e instanceof AgentHttpError)) throw e;
    const body = e.body ?? {};
    if (body.code && ABILITIES_MISSING.has(body.code)) throw new PluginOutdatedError();
    return failed([
      {
        path: identOf(product),
        code: body.code ?? `http_${e.status}`,
        message: body.message ?? `HTTP ${e.status}`,
        fix: "ai"
      }
    ]);
  }
}
function deriveKeyFromTitle(title, existingKeys) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "product";
  const padded = base.length >= 3 ? base : `${base}-item`;
  let candidate = padded;
  let i = 2;
  while (existingKeys.has(candidate) || !/^[a-z0-9-]{3,80}$/.test(candidate)) {
    candidate = `${padded}-${i++}`.slice(0, 80);
  }
  return candidate;
}
async function cmdPull(ctx) {
  const target = ctx.positional[0];
  if (!target) return { ok: false, code: "error", message: "usage: puffergo products pull <key|id|link>" };
  try {
    const c = await client(ctx);
    const id = await resolveProductId(c, target);
    const { link: link2, editUrl, ...remote } = await c.getProduct(id);
    const existing = await loadProducts(ctx.dir);
    let key = remote.key ?? existing.find((p) => p.product.id === id)?.fileKey;
    if (!key) key = deriveKeyFromTitle(remote.title, new Set(existing.map((p) => p.fileKey)));
    const sample = existing.find((p) => p.fileKey === key)?.product.sample;
    const product = { ...remote, key, ...sample ? { sample } : {} };
    await writeProduct(ctx.dir, key, product);
    return {
      ok: true,
      key,
      id,
      path: `products/${key}.json`,
      link: link2,
      editUrl,
      hint: "pull is for editing THIS product. If the customer wants new products to look like it, run `products sample set <type name> <this link or id>` instead."
    };
  } catch (e) {
    return errorOutput(e);
  }
}
async function cmdPublish(ctx) {
  const keys = ctx.positional;
  if (!keys.length) {
    return {
      ok: false,
      code: "error",
      message: `usage: puffergo products publish <key\u2026> --customer-said "<the customer's exact words>"`
    };
  }
  const refused = publishRefusal(ctx, "product");
  if (refused) return refused;
  const loaded = await loadProducts(ctx.dir, keys);
  const missing = keys.filter((k) => !loaded.some((l) => l.fileKey === k));
  if (missing.length) {
    return {
      ok: false,
      code: "not_found",
      message: `No local file products/<key>.json for: ${missing.join(", ")} \u2014 pull it first.`
    };
  }
  for (const item of loaded) {
    item.product.status = "publish";
    await writeProduct(ctx.dir, item.fileKey, item.product);
  }
  return cmdPush({ ...ctx, flags: new Map([...ctx.flags, ["only", keys.join(",")]]) }, true);
}
async function cmdSample(ctx) {
  const [sub, name, target] = ctx.positional;
  const usage = "usage: puffergo products sample <list | set <name> <key|id|link> | show <name> | remove <name>>";
  try {
    const c = await client(ctx);
    const samples = await readSamples(ctx.dir, c.siteUrl, "product");
    const missing = () => ({
      ok: false,
      code: "unknown_sample",
      message: `No sample named "${name}". Saved: ${Object.keys(samples).join(", ") || "none"}.`
    });
    switch (sub) {
      case "list":
        return {
          ok: true,
          samples: Object.entries(samples).map(([n, t]) => ({ name: n, id: t.id, title: t.title }))
        };
      case "set": {
        if (!name || !target) return { ok: false, code: "usage", message: usage };
        const id = await resolveProductId(c, target);
        const remote = await c.getProduct(id);
        samples[name] = { id, title: remote.title };
        await writeSamples(ctx.dir, c.siteUrl, "product", samples);
        return { ok: true, name, id, title: remote.title };
      }
      case "show": {
        if (!name) return { ok: false, code: "usage", message: usage };
        const entry = samples[name];
        if (!entry) return missing();
        const remote = await c.getProduct(entry.id);
        return {
          ok: true,
          name,
          id: entry.id,
          note: `Structure reference only. Follow which fields it uses (notUsed = the site does not show these: do not write them and do not ask), its units, spec names and order, section layouts, image placement and text lengths. Write every text from the customer's facts; drop a section the customer gave nothing for. Set "sample": "` + name + '" in each product file that follows it.',
          reference: sampleReference(remote, await loadSiteSchema(c))
        };
      }
      case "remove": {
        if (!name) return { ok: false, code: "usage", message: usage };
        if (!samples[name]) return missing();
        delete samples[name];
        await writeSamples(ctx.dir, c.siteUrl, "product", samples);
        return { ok: true, removed: name };
      }
      default:
        return { ok: false, code: "usage", message: usage };
    }
  } catch (e) {
    if (e instanceof AgentHttpError && e.status === 404)
      return { ok: false, code: "not_found", message: "That product no longer exists on the site." };
    return errorOutput(e);
  }
}
async function cmdCategories(ctx) {
  const sub = ctx.positional[0];
  if (sub !== "check" && sub !== "push")
    return { ok: false, code: "usage", message: "usage: puffergo products categories <check | push>" };
  try {
    const tree = await readCategoriesFile(ctx.dir);
    if (tree === null) return { ok: false, code: "no_file", message: `No ${CATEGORIES_FILE} in the work folder.` };
    const c = await client(ctx);
    const schema = await loadSiteSchema(c);
    const out = await syncCategories(c, {
      tree,
      restBase: PRODUCT_CAT_REST_BASE,
      file: CATEGORIES_FILE,
      push: sub === "push",
      editLive: await editLiveAllowed(ctx.dir, c.siteUrl),
      editLiveHint: 'products edit-live on --customer-said "\u2026"',
      language: schema.language,
      // Products are the one sortable taxonomy; null says the site's plugin is too old to set the order.
      order: schema.categoryOrder ? { orderby: schema.categoryOrder.orderby ?? "name" } : null
    });
    return out;
  } catch (e) {
    if (e instanceof SyntaxError)
      return { ok: false, code: "invalid_json", message: `${CATEGORIES_FILE}: ${e.message}` };
    return errorOutput(e);
  }
}
async function cmdImages(ctx) {
  if (!ctx.positional.length)
    return { ok: false, code: "usage", message: "usage: puffergo products images <file or folder>\u2026" };
  try {
    const c = await client(ctx);
    const spec = (await loadSiteSchema(c)).images;
    if (!spec) return { ok: false, code: "update_plugin", message: "The site plugin is too old to give image specs." };
    const files = [];
    for (const p of ctx.positional) {
      const abs = resolve6(ctx.dir, p);
      const st = await stat2(abs);
      if (st.isDirectory()) files.push(...(await readdir4(abs)).filter((n) => !n.startsWith(".")).map((n) => join10(abs, n)));
      else files.push(abs);
    }
    const images = [];
    for (const abs of files) {
      const bytes = await readFile13(abs);
      const { format, width, height } = sniffImage(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      if (!format || width == null || height == null) continue;
      const info = { bytes: bytes.length, width, height };
      const fits = Object.entries(spec.places).filter(([place, s]) => placeProblems({ ...info, bytes: 0 }, place, s, spec.maxBytes).length === 0).map(([place]) => place);
      images.push({
        file: relative(ctx.dir, abs),
        sizeKB: Math.round(bytes.length / 1024),
        width,
        height,
        overLimit: bytes.length > spec.maxBytes,
        fits
      });
    }
    return {
      ok: true,
      note: `Tell the customer now, in one message: which photos are over ${Math.round(spec.maxBytes / 1024)}KB, and which don't fit where they are meant to go (fits lists the places whose size and shape already match). Give the cropUrl of that place; the tool crops, resizes and compresses in one go. The customer may also keep them as they are.`,
      places: spec.places,
      images
    };
  } catch (e) {
    return errorOutput(e);
  }
}

// packages/cli/src/lib/siteSetupCmd.ts
var PUFFERGO_SLUG = "puffergo";
var RANKMATH_SLUG = "seo-by-rank-math";
var SITE_SETUP_USAGE = 'puffergo site setup [install --customer-said "<customer words>"] [--dir <workdir>] [--site <url>]';
async function probe(cfg) {
  const base = cfg.siteUrl.replace(/\/+$/, "");
  const auth = `Basic ${Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString("base64")}`;
  const get = async (url) => nodeNetwork.request({ method: "GET", url, headers: { Authorization: auth, "Content-Type": "application/json" } });
  const ok = (status) => status >= 200 && status < 300;
  const [index, me, pluginRes, schemaRes] = await Promise.all([
    get(`${base}/wp-json/`),
    get(`${base}/wp-json/wp/v2/users/me?_fields=id`),
    get(`${base}/wp-json/wp/v2/plugins?_fields=plugin,textdomain,status,version`),
    get(`${base}/wp-json/wp-abilities/v1/abilities/puffergo/get-product-schema/run`)
  ]);
  const namespaces = index.json?.namespaces ?? [];
  const plugins = ok(pluginRes.status) && Array.isArray(pluginRes.json) ? pluginRes.json : null;
  const stateOf = (slug) => {
    if (!plugins) return "unknown";
    const row = plugins.find(
      (p) => p.textdomain === slug || p.plugin === slug || (p.plugin ?? "").startsWith(`${slug}/`)
    );
    return row ? row.status === "active" ? "active" : "inactive" : "missing";
  };
  const schemaVersion = ok(schemaRes.status) ? schemaRes.json?.schemaVersion ?? null : null;
  return {
    siteUrl: cfg.siteUrl,
    connected: ok(me.status),
    abilitiesApi: namespaces.includes("wp-abilities/v1"),
    // The abilities answering IS the proof the plugin is active, whatever the (possibly forbidden)
    // plugin list says; 'unknown' stays only when neither source could tell.
    puffergo: schemaVersion !== null ? "active" : stateOf(PUFFERGO_SLUG),
    schemaVersion,
    seo: namespaces.includes("rankmath/v1") ? "rankmath" : namespaces.includes("yoast/v1") ? "yoast" : stateOf(RANKMATH_SLUG) === "active" ? "rankmath" : stateOf("wordpress-seo") === "active" ? "yoast" : null,
    canListPlugins: plugins !== null
  };
}
function report(p) {
  const needs = [];
  if (!p.abilitiesApi) needs.push("wordpress-6.9");
  if (p.puffergo !== "active") needs.push(PUFFERGO_SLUG);
  if (!p.seo) needs.push(RANKMATH_SLUG);
  const pluginTooOld = p.schemaVersion !== null && (p.schemaVersion < MIN_SCHEMA_VERSION || p.schemaVersion > SUPPORTED_SCHEMA_VERSION);
  const problems = [];
  if (!p.connected) problems.push("The saved Application Password does not authenticate \u2014 run `puffergo login <siteUrl>` again.");
  if (!p.abilitiesApi) problems.push("WordPress is older than 6.9 (no Abilities API) \u2014 update WordPress itself; the CLI cannot.");
  if (pluginTooOld)
    problems.push(
      `The PufferGo plugin's product-file version is ${p.schemaVersion}; this CLI understands ${MIN_SCHEMA_VERSION}\u2013${SUPPORTED_SCHEMA_VERSION} \u2014 update the PufferGo plugin in wp-admin.`
    );
  if (p.puffergo !== "active" && !pluginTooOld) problems.push("The PufferGo plugin is not active.");
  if (!p.seo) problems.push("No SEO plugin is active, so SEO fields (title/description/focus keyword) have nowhere to be written.");
  return {
    site: p.siteUrl,
    connected: p.connected,
    wordpress: { abilitiesApi: p.abilitiesApi },
    puffergoPlugin: { state: p.puffergo, schemaVersion: p.schemaVersion },
    seoPlugin: { active: p.seo },
    needsInstall: needs.filter((n) => n !== "wordpress-6.9"),
    ...problems.length ? { problems } : {},
    ready: p.connected && p.abilitiesApi && p.puffergo === "active" && !!p.seo && !pluginTooOld
  };
}
async function install(ctx, cfg) {
  const said = (ctx.flags.get("customer-said") ?? "").trim();
  if (!said)
    return {
      ok: false,
      code: "needs_customer_request",
      fix: "user",
      message: 'Installing plugins changes the customer\'s site. Tell them what `puffergo site setup` found and what you want to install; when they agree, run `puffergo site setup install --customer-said "<their exact words>".'
    };
  const before = await probe(cfg);
  if (!before.connected)
    return {
      ok: false,
      code: "not_logged_in",
      fix: "user",
      message: "The saved Application Password does not authenticate \u2014 run `puffergo login <siteUrl>` again first."
    };
  const client2 = new WpClient(nodeNetwork, {
    siteUrl: cfg.siteUrl,
    username: cfg.username,
    appPassword: cfg.appPassword
  });
  const actions = {};
  try {
    actions.puffergo = before.puffergo === "active" ? "already_active" : (await client2.ensurePluginActive(PUFFERGO_SLUG)).action;
    actions.rankMath = before.seo ? `skipped_${before.seo}_active` : (await client2.ensurePluginActive(RANKMATH_SLUG)).action;
  } catch (e) {
    if (e instanceof WpHttpError && (e.status === 401 || e.status === 403))
      return {
        ok: false,
        code: "needs_manual_install",
        fix: "user",
        actions,
        message: 'This account cannot install or activate plugins (WordPress needs an admin for that). In wp-admin: Plugins \u2192 Add New \u2192 search "PufferGo" \u2192 Install Now \u2192 Activate' + (before.seo ? "" : '; then the same for "Rank Math SEO"') + ". Afterwards run `puffergo site setup` again to verify."
      };
    throw e;
  }
  const after = await probe(cfg);
  const r = report(after);
  return {
    ok: r.ready,
    ...r,
    actions,
    ...after.abilitiesApi ? {} : {
      message: "Plugins are in place, but this WordPress still has no Abilities API \u2014 update WordPress to 6.9+ in wp-admin (Dashboard \u2192 Updates); PufferGo cannot work on an older core."
    }
  };
}
async function cmdSiteSetup(ctx) {
  try {
    const { config } = await resolveSite2(ctx.dir, ctx.flags.get("site"));
    const sub = ctx.positional[0];
    if (sub === "install") return await install(ctx, config);
    if (sub !== void 0) return { ok: false, code: "usage", message: SITE_SETUP_USAGE };
    const p = await probe(config);
    const r = report(p);
    return {
      ok: true,
      ...r,
      ...r.ready ? { next: "The site is ready for PufferGo." } : {
        next: 'Show the customer what is missing (problems/needsInstall) and ask to install. If they agree, run `puffergo site setup install --customer-said "<their exact words>"`. WordPress core and plugin UPDATES cannot be installed from here \u2014 guide the customer through wp-admin for those.'
      }
    };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    return { ok: false, code: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

// packages/cli/src/lib/loginCmd.ts
import { spawn as spawn2 } from "node:child_process";
import * as net from "node:net";
import { existsSync as existsSync13 } from "node:fs";
import { readFile as readFile14, rm, writeFile as writeFile9, rename as rename2, mkdir as mkdir9, mkdtemp } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { dirname as dirname8, join as join11 } from "node:path";
var WAIT_MS = 10 * 60 * 1e3;
var STATUS_WAIT_MS = 100 * 1e3;
var WINDOW_GRACE_MS = 30 * 1e3;
var CALLBACK_PORTS = [49512, 49513, 49514, 49515, 49516, 49517];
var LOGIN_STATE = join11(PUFFERGO_DIR, "login-state.json");
var loginStatePath = () => process.env.PUFFERGO_LOGIN_STATE || LOGIN_STATE;
async function writeLoginState(state, path = loginStatePath()) {
  await mkdir9(dirname8(path), { recursive: true });
  await writeFile9(path, JSON.stringify(state, null, 2), "utf8");
}
async function readLoginState(path = loginStatePath()) {
  try {
    const s = JSON.parse(await readFile14(path, "utf8"));
    return s && typeof s.siteUrl === "string" && typeof s.status === "string" ? s : null;
  } catch {
    return null;
  }
}
var RESULT_PAGE = (ok) => `<!doctype html><html><head><meta charset="utf-8"><title>PufferGo</title>
<style>html{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2430;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f7fb}
div{text-align:center}</style></head><body><div>${ok ? "\u2705 \u5DF2\u6388\u6743\uFF0C\u53EF\u4EE5\u56DE\u5230 AI \u5DE5\u5177\u7EE7\u7EED\u4E86\u3002" : "\u274C \u6CA1\u6709\u62FF\u5230\u6388\u6743\u3002\u53EF\u4EE5\u56DE\u5230 AI \u5DE5\u5177\u91CD\u65B0\u8FD0\u884C\u767B\u5F55\u3002"}<br><small style="color:#888">\u8FD9\u4E2A\u9875\u9762\u53EF\u4EE5\u5173\u95ED\u4E86\u3002</small></div></body></html>`;
function normalizeSiteUrl(input) {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  const path = u.pathname.replace(/\/(wp-admin|wp-login\.php).*$/, "").replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${path}`;
}
function openBrowser(url) {
  if (process.env.PUFFERGO_NO_BROWSER) return;
  const [cmd2, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  try {
    spawn2(cmd2, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {
  }
}
function portIsHeld(port, timeoutMs = 500) {
  return new Promise((held) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (value) => {
      socket.destroy();
      held(value);
    };
    socket.setTimeout(timeoutMs, () => done(true));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}
async function pickCallbackPort() {
  for (const port of CALLBACK_PORTS) if (!await portIsHeld(port, 150)) return port;
  return 0;
}
async function finishLogin(siteUrl, dir2, creds, port) {
  const startedAt = (await readLoginState())?.startedAt ?? Date.now();
  if (creds) {
    await upsertCredential({ siteUrl, username: creds.username, appPassword: creds.appPassword });
    await writeActiveDomain(dir2, siteUrl);
    await writeLoginState({ siteUrl, status: "approved", startedAt, username: creds.username, port });
  } else {
    await writeLoginState({ siteUrl, status: "failed", startedAt, port });
  }
}
var NO_LOGIN = {
  ok: false,
  code: "no_login",
  message: "No authorization is in progress. Run `puffergo login <siteUrl>` first."
};
var approvedOutput = (state) => ({
  ok: true,
  status: "approved",
  siteUrl: state.siteUrl,
  username: state.username,
  next: "Tell the user you saw the approval come through, then check what it can do with `puffergo products schema` (or `pages types`) and report the result."
});
var failedOutput = (state) => ({
  ok: false,
  code: "denied",
  status: "failed",
  siteUrl: state.siteUrl,
  message: "WordPress came back without granting access (the approval was declined, or the 10-minute window ran out). Run `puffergo login <siteUrl>` again."
});
async function cmdLogin(dir2, siteArg) {
  if (!siteArg) return { ok: false, code: "error", message: "usage: puffergo login <siteUrl>" };
  let siteUrl;
  try {
    siteUrl = normalizeSiteUrl(siteArg);
  } catch {
    return { ok: false, code: "error", message: `Not a valid site URL: ${siteArg}` };
  }
  const port = await pickCallbackPort();
  await writeLoginState({ siteUrl, status: "pending", startedAt: Date.now(), port });
  const handshakeDir = await mkdtemp(join11(tmpdir2(), "puffergo-login-"));
  const handshake = join11(handshakeDir, "authorize-url");
  const child = spawn2(
    process.execPath,
    [...process.execArgv, process.argv[1], "__login-wait", siteUrl, handshake, dir2, String(port)],
    { detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();
  let spawnError = "";
  child.on("error", (e) => {
    spawnError = e.message;
  });
  let authorizeUrl = "";
  for (let i = 0; i < 100 && !authorizeUrl; i++) {
    await new Promise((r) => setTimeout(r, 100));
    authorizeUrl = await readHandshake(handshake);
  }
  await rm(handshakeDir, { recursive: true, force: true });
  if (!authorizeUrl) {
    await writeLoginState({ siteUrl, status: "failed", startedAt: Date.now(), port });
    return {
      ok: false,
      code: "error",
      message: `Could not start the local authorization listener.${spawnError ? ` ${spawnError}` : ""}`
    };
  }
  await writeActiveDomain(dir2, siteUrl);
  openBrowser(authorizeUrl);
  process.stderr.write("\u5DF2\u5728\u6D4F\u89C8\u5668\u6253\u5F00 WordPress \u6388\u6743\u9875\uFF1A\u8BF7\u5728\u9875\u9762\u4E0A\u70B9\u300C\u6279\u51C6\u300D\uFF0C\u5B8C\u6210\u540E\u56DE\u5230\u8FD9\u91CC\u3002\n");
  return {
    ok: true,
    pending: true,
    siteUrl,
    authorizeUrl,
    next: "Send `authorizeUrl` to the user verbatim too \u2014 the page may not have opened, or opened somewhere they cannot paste into. Never open it in your own built-in browser: the callback comes back to this machine, so it has to be the user's own browser. Tell them the authorization page is open and to click Approve (logging in to WordPress first if asked), then run `puffergo login status` right away \u2014 it waits for the click and answers by itself, so never ask the user to report back. If it returns `waiting`, tell the user you are still waiting and run it again. The link stays valid for 10 minutes."
  };
}
async function writeHandshake(path, value) {
  const tmp = `${path}.tmp`;
  await writeFile9(tmp, value, "utf8");
  await rename2(tmp, path);
}
async function readHandshake(path) {
  if (!existsSync13(path)) return "";
  try {
    return (await readFile14(path, "utf8")).trim();
  } catch {
    return "";
  }
}
async function cmdLoginStatus(dir2, waitSeconds) {
  const waitMs = waitSeconds ? Math.max(0, Number(waitSeconds) * 1e3) : STATUS_WAIT_MS;
  if (Number.isNaN(waitMs))
    return { ok: false, code: "usage", message: "usage: puffergo login status [--wait <seconds>]" };
  let state = await readLoginState();
  if (!state) return NO_LOGIN;
  if (state.status === "pending" && state.port) {
    const outcome = await holdCallbackPort(state, dir2, waitMs);
    if (outcome === "busy") {
    } else if (outcome === "approved" || outcome === "denied") {
      const after = await readLoginState() ?? state;
      return outcome === "approved" ? approvedOutput(after) : failedOutput(after);
    } else if (outcome === "expired") {
      await finishLogin(state.siteUrl, dir2, null, state.port);
      return failedOutput(state);
    } else if (outcome === "moved") {
      return {
        ok: false,
        code: "port_taken",
        status: "failed",
        siteUrl: state.siteUrl,
        message: "\u672C\u673A\u6388\u6743\u56DE\u8C03\u7528\u7684\u7AEF\u53E3\u88AB\u522B\u7684\u7A0B\u5E8F\u5360\u4E86\uFF0C\u521A\u624D\u90A3\u4E2A\u6388\u6743\u9875\u5DF2\u7ECF\u4F5C\u5E9F\u3002\u91CD\u65B0\u8FD0\u884C `puffergo login <\u7F51\u7AD9\u5730\u5740>`\uFF0C\u628A\u65B0\u94FE\u63A5\u53D1\u7ED9\u5BA2\u6237\u3002",
        next: "Run `puffergo login <siteUrl>` again and send the user the new link."
      };
    } else {
      return {
        ok: true,
        status: "waiting",
        siteUrl: state.siteUrl,
        tookOver: true,
        next: "\u672C\u673A\u63A5\u542C\u7684\u8FDB\u7A0B\u4E4B\u524D\u88AB\u6253\u65AD\u8FC7\uFF0C\u5BA2\u6237\u90A3\u4E00\u6B21\u70B9\u51FB\uFF08\u5982\u679C\u5DF2\u7ECF\u70B9\u4E86\uFF09\u6CA1\u6709\u9001\u5230\u3002\u8BF7\u5BA2\u6237\u56DE\u5230\u8FD8\u5F00\u7740\u7684\u90A3\u4E2A\u6388\u6743\u9875\uFF0C\u518D\u70B9\u4E00\u6B21\u300C\u6279\u51C6\u300D\u2014\u2014\u5C31\u662F\u518D\u70B9\u4E00\u4E0B\uFF0C\u4E0D\u7528\u91CD\u65B0\u767B\u5F55\u3001\u4E0D\u7528\u590D\u5236\u4EFB\u4F55\u4E1C\u897F\uFF1B\u7136\u540E\u9A6C\u4E0A\u518D\u8FD0\u884C `puffergo login status`\u3002"
      };
    }
  }
  const deadline = Date.now() + waitMs;
  state = await readLoginState();
  while (state?.status === "pending" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    state = await readLoginState();
  }
  if (!state) return NO_LOGIN;
  if (state.status === "approved") return approvedOutput(state);
  if (state.status === "failed") return failedOutput(state);
  return {
    ok: true,
    status: "waiting",
    siteUrl: state.siteUrl,
    next: "The user has not clicked Approve yet. Tell them you are still waiting on that browser page, then run `puffergo login status` again."
  };
}
async function holdCallbackPort(state, dir2, waitMs) {
  const port = state.port;
  if (Date.now() > state.startedAt + WAIT_MS + WINDOW_GRACE_MS) return "expired";
  if (await portIsHeld(port)) return "busy";
  const window = Math.max(1e3, Math.min(waitMs, state.startedAt + WAIT_MS - Date.now()));
  let timedOut = false;
  let moved = false;
  let bindFailed = false;
  const abort = new AbortController();
  const creds = await runAuthorizeServer2(
    state.siteUrl,
    (_authorizeUrl, bound) => {
      if (bound !== port) {
        moved = true;
        abort.abort();
      }
    },
    {
      appName: "PufferGo AI",
      timeoutMs: window,
      resultPage: RESULT_PAGE,
      port,
      onTimeout: () => {
        timedOut = true;
      },
      signal: abort.signal
    }
  ).catch(() => {
    bindFailed = true;
    return null;
  });
  if (moved || bindFailed) return "moved";
  if (creds) {
    await finishLogin(state.siteUrl, dir2, creds, port);
    return "approved";
  }
  return timedOut ? "tookover" : "denied";
}
async function runAuthorizeServer2(siteUrl, onListening, opts) {
  const mod = await Promise.resolve().then(() => (init_authorize_server(), authorize_server_exports));
  const run3 = mod.runAuthorizeServer ?? mod.default.runAuthorizeServer;
  return run3(siteUrl, onListening, opts);
}
async function cmdLoginWait(siteUrl, handshake, dir2, portArg) {
  const wanted = Number(portArg) > 0 ? Number(portArg) : void 0;
  let bound = wanted;
  const creds = await runAuthorizeServer2(
    siteUrl,
    (authorizeUrl, port) => {
      bound = port;
      if (wanted && port !== wanted) void rebindLoginState(siteUrl, port);
      void writeHandshake(handshake, authorizeUrl);
    },
    { appName: "PufferGo AI", timeoutMs: WAIT_MS, resultPage: RESULT_PAGE, port: wanted }
  );
  await finishLogin(siteUrl, dir2, creds, bound);
}
async function rebindLoginState(siteUrl, bound) {
  const current = await readLoginState();
  if (current && current.status !== "pending") return;
  await writeLoginState({
    siteUrl,
    status: "pending",
    startedAt: current?.startedAt ?? Date.now(),
    port: bound
  });
}

// packages/cli/src/lib/pagesCmd.ts
import { existsSync as existsSync16 } from "node:fs";
import { mkdir as mkdir10, readFile as readFile16, writeFile as writeFile10 } from "node:fs/promises";
import { dirname as dirname10, join as join13, relative as relative3, resolve as resolve9 } from "node:path";

// packages/cli/src/lib/contentBlocks.ts
import { existsSync as existsSync15 } from "node:fs";
import { readFile as readFile15, readdir as readdir5, stat as stat3 } from "node:fs/promises";
import { dirname as dirname9, join as join12, relative as relative2, resolve as resolve8 } from "node:path";

// packages/cli/src/lib/markdownImages.ts
import { existsSync as existsSync14 } from "node:fs";
import { isAbsolute as isAbsolute2, resolve as resolve7 } from "node:path";
var LOCAL_REF2 = /(!\[[^\]]*\]\(\s*)(?!https?:|\/\/|data:|\/|#)([^)\s]+)/g;
function localMarkdownImageRefs(markdown) {
  return [...new Set([...markdown.matchAll(LOCAL_REF2)].map((m) => m[2]))];
}
async function uploadMarkdownImages(c, cache2, markdown, baseDir) {
  const urls = /* @__PURE__ */ new Map();
  const uploaded = [];
  let reused = 0;
  for (const ref of localMarkdownImageRefs(markdown)) {
    const abs = isAbsolute2(ref) ? ref : resolve7(baseDir, decodeURI(ref));
    if (!existsSync14(abs)) throw new MissingImageError(ref);
    const up = await resolveUpload(c, cache2, abs);
    if (up.reused) reused++;
    else uploaded.push(abs);
    urls.set(ref, up.url);
  }
  return {
    markdown: markdown.replace(
      LOCAL_REF2,
      (all, pre, ref) => urls.has(ref) ? pre + urls.get(ref) : all
    ),
    uploaded,
    reused
  };
}

// packages/cli/src/lib/contentBlocks.ts
var FileError = class extends CodedError {
};
var SUFFIXES = [".md", ".html", ".json"];
function suffixOf(file) {
  return SUFFIXES.find((s) => file.toLowerCase().endsWith(s));
}
var isOriginal = (name) => /\.orig\.(md|html|json)$/i.test(name);
async function blockFiles(dir2, args) {
  if (!args.length)
    throw new UsageError(
      "Give the block files (.md body text, .html sections, .json components), or a folder of them."
    );
  const out = [];
  for (const a of args) {
    const p = resolve8(dir2, a);
    if (!existsSync15(p)) throw new FileError("file_not_found", `Not found: ${a}`);
    if ((await stat3(p)).isDirectory()) {
      const names = (await readdir5(p)).filter((n) => suffixOf(n) && !isOriginal(n)).sort();
      if (!names.length) throw new FileError("file_not_found", `No .md, .html or .json block files in ${a}`);
      out.push(...names.map((n) => join12(p, n)));
    } else {
      if (!suffixOf(p))
        throw new FileError(
          "format",
          `${a} is not a block file: body text is .md, a section .html, a component .json.`
        );
      out.push(p);
    }
  }
  return out;
}
async function blocksFromFiles(c, ctx, files, componentData) {
  const cache2 = await readUploadsCache(ctx.dir, c.siteUrl);
  const uploaded = [];
  const blocks = [];
  try {
    for (const file of files) {
      const name = relative2(ctx.dir, file);
      const suffix = suffixOf(file);
      if (suffix === ".json") {
        const cf = await componentData(file);
        uploaded.push(...cf.uploaded);
        blocks.push({
          type: "config",
          component: String(cf.component ?? ""),
          data: cf.data ?? {}
        });
        continue;
      }
      const text = (await readFile15(file, "utf8")).replace(/\n+$/, "");
      try {
        if (suffix === ".md") {
          const up = await uploadMarkdownImages(c, cache2, text, dirname9(file));
          uploaded.push(...up.uploaded.map((abs) => relative2(ctx.dir, abs)));
          blocks.push({ type: "prose", markdown: up.markdown });
        } else {
          const up = await uploadHtmlImages(c, cache2, text, dirname9(file));
          uploaded.push(...up.uploaded.map((abs) => relative2(ctx.dir, abs)));
          blocks.push({ type: "static", html: up.html });
        }
      } catch (e) {
        if (!(e instanceof MissingImageError)) throw e;
        throw new FileError(
          "image_not_found",
          `${name} uses the image "${e.ref}", which isn't there. Paths are relative to the ${suffix} file.`
        );
      }
    }
  } finally {
    await writeUploadsCache(ctx.dir, c.siteUrl, cache2);
  }
  return { blocks, uploaded };
}
function blockText2(block2) {
  if (block2.type === "prose") return block2.markdown;
  if (block2.type === "static") return block2.html.replace(/<[^>]*>/g, " ");
  return "";
}
async function blockWarnings(dir2, files, blocks) {
  const out = [];
  for (const [i, block2] of blocks.entries()) {
    const file = files[i];
    if (!file) continue;
    const suffix = suffixOf(file);
    if (suffix === ".json") continue;
    const orig = file.replace(new RegExp(`\\${suffix}$`, "i"), `.orig${suffix}`);
    const words = (t) => suffix === ".md" ? t : t.replace(/<[^>]*>/g, " ");
    const before = existsSync15(orig) ? words(await readFile15(orig, "utf8")) : "";
    const w = claimWarning(relative2(dir2, file), blockText2(block2), before);
    if (w) out.push(w);
  }
  return out;
}
function withFileNames(out, files, dir2) {
  if (!Array.isArray(out.errors)) return out;
  return {
    ...out,
    errors: out.errors.map((e) => {
      const at = typeof e.path === "string" ? e.path : "";
      const i = /^blocks\[(\d+)\]/.exec(at);
      const file = i ? files[Number(i[1])] : void 0;
      return file ? { file: relative2(dir2, file), ...e } : e;
    })
  };
}

// packages/cli/src/lib/pagesCmd.ts
var editable = (b) => b.kind === "prose" || b.kind === "static" || b.kind === "config";
var SUFFIX_OF_KIND = { prose: ".md", static: ".html", config: ".json" };
async function componentInput(c, ctx, file) {
  const name = relative3(ctx.dir, file);
  const read = async (f) => existsSync16(f) ? JSON.parse(await readFile16(f, "utf8")) : null;
  let cf;
  try {
    cf = await read(file);
  } catch {
    throw new FileError("format", `${name} is not valid JSON.`);
  }
  if (!cf || !cf.data || typeof cf.data !== "object" || Array.isArray(cf.data))
    throw new FileError(
      "format",
      `${name} must keep the shape \`get\` saved: {"component", "guide", "schema", "data": {\u2026}}.`
    );
  const cache2 = await readUploadsCache(ctx.dir, c.siteUrl);
  const uploaded = [];
  try {
    for (const { value, set } of configImages(cf.data, cf.schema)) {
      if (!isLocalImage(value)) continue;
      const abs = [resolve9(dirname10(file), value), resolve9(ctx.dir, value)].find((p) => existsSync16(p));
      if (!abs)
        throw new FileError(
          "image_not_found",
          `${name} uses the image "${value}", which isn't there. Paths are relative to the .json file or the workdir.`
        );
      const up = await resolveUpload(c, cache2, abs);
      if (!up.reused) uploaded.push(value);
      set(up.url);
    }
  } finally {
    await writeUploadsCache(ctx.dir, c.siteUrl, cache2);
  }
  const orig = await read(file.replace(/\.json$/i, ".orig.json")).catch(() => null);
  const was = new Map(configTexts(orig?.data, cf.schema).map((t) => [t.path, t.value]));
  const warnings = configTexts(cf.data, cf.schema).map((t) => claimWarning(`${name}:${t.path}`, t.value, was.get(t.path) ?? "")).filter(Boolean);
  return { data: cf.data, uploaded, warnings };
}
var run = (ctx, body) => runWith(client, ctx, body);
var bases = siteState("post-bases.json");
var created = siteState("created.json");
async function baseOf2(dir2, siteUrl, id) {
  return (await bases.read(dir2, siteUrl))[id];
}
async function rememberBase(dir2, siteUrl, post) {
  await bases.remember(dir2, siteUrl, post.id, post.baseModified);
}
async function blocksOf(c, ctx, files) {
  const componentWarnings = [];
  const { blocks, uploaded } = await blocksFromFiles(c, ctx, files, async (file) => {
    const { data, uploaded: up, warnings } = await componentInput(c, ctx, file);
    componentWarnings.push(...warnings);
    const component = JSON.parse(await readFile16(file, "utf8")).component;
    return { component, data, uploaded: up };
  });
  return { blocks, uploaded, warnings: [...await blockWarnings(ctx.dir, files, blocks), ...componentWarnings] };
}
async function resolvePostId(c, target) {
  if (!target) throw new UsageError("Give the page/post id or a link to it.");
  if (/^\d+$/.test(target)) return Number(target);
  if (!/^https?:\/\//i.test(target)) throw new UsageError(`Not an id or a link: ${target}`);
  const host = (u) => new URL(u).host.replace(/^www\./, "").toLowerCase();
  if (host(target) !== host(c.siteUrl)) {
    throw new FileError("other_site", `This link is on ${new URL(target).host}, not the connected site ${c.siteUrl}.`);
  }
  const found = await c.findPosts({ url: target });
  if (!found.items[0]) throw new FileError("not_found", `No page or post found at ${target}`);
  return found.items[0].id;
}
function cmdTypes(ctx) {
  return run(ctx, async (c) => ({ ok: true, ...await c.postTypes() }));
}
function cmdFind(ctx) {
  return run(ctx, async (c) => ({
    ok: true,
    ...await c.findPosts({
      type: ctx.flags.get("type"),
      status: ctx.flags.get("status"),
      search: ctx.flags.get("search"),
      url: ctx.flags.get("url"),
      page: Number(ctx.flags.get("page")) || void 0
    })
  }));
}
function cmdBlocks(ctx) {
  return run(ctx, async (c) => {
    const id = await resolvePostId(c, ctx.positional[0]);
    const post = await c.getBlocks(id);
    await rememberBase(ctx.dir, c.siteUrl, post);
    return notBlockContent(post) ?? { ok: true, ...post };
  });
}
function notBlockContent(post) {
  if (!post.editor) return void 0;
  return {
    ok: false,
    code: "not_block_content",
    fix: "user",
    editor: post.editor,
    message: post.editorNote ?? `This ${post.type} was made with the ${post.editor}; its content can't be changed here.`,
    editUrl: post.editUrl
  };
}
var BLOCK_PATH = /^[1-9]\d*(\.[1-9]\d*)*$/;
function flatten(blocks) {
  return blocks.flatMap((b) => [b, ...flatten(b.innerBlocks ?? [])]);
}
function cmdGet(ctx) {
  return run(ctx, async (c) => {
    const id = await resolvePostId(c, ctx.positional[0]);
    const want = ctx.positional[1];
    if (want && !BLOCK_PATH.test(want)) throw new UsageError("usage: puffergo pages get <id|link> [block path]");
    let all = [];
    if (!want) {
      const post = await c.getBlocks(id);
      const other = notBlockContent(post);
      if (other) return other;
      all = flatten(post.blocks);
    }
    const paths = want ? [want] : all.filter(editable).map((b) => b.path);
    const saved = [];
    let base;
    for (const path of paths) {
      const res = await c.getBlocks(id, path);
      base = res;
      const { block: block2 } = res;
      const content = block2.kind === "prose" ? block2.markdown ?? "" : block2.kind === "static" ? block2.html ?? "" : block2.data ? JSON.stringify(
        { component: block2.component, guide: block2.guide, schema: block2.schema, data: block2.data },
        null,
        2
      ) + "\n" : null;
      if (content === null) {
        if (!want) continue;
        await rememberBase(ctx.dir, c.siteUrl, res);
        return {
          ok: false,
          code: "not_editable",
          fix: "user",
          message: block2.kind === "config" ? "This component has no data to edit here; the customer edits it in the WordPress editor." : "Only body text, PufferGo Tailwind blocks and components can be edited here.",
          block: { path: block2.path, name: block2.name, text: block2.text }
        };
      }
      const suffix = SUFFIX_OF_KIND[block2.kind];
      const file = join13("pages", String(id), `block-${path}${suffix}`);
      await mkdir10(join13(ctx.dir, "pages", String(id)), { recursive: true });
      const text = content.endsWith("\n") ? content : content + "\n";
      await writeFile10(join13(ctx.dir, file), text, "utf8");
      await writeFile10(join13(ctx.dir, "pages", String(id), `block-${path}.orig${suffix}`), text, "utf8");
      saved.push({ path, file, text: block2.text });
    }
    if (!base)
      return {
        ok: false,
        code: "no_editable_blocks",
        fix: "user",
        message: "This page has no body text, PufferGo Tailwind blocks or components to edit here."
      };
    await rememberBase(ctx.dir, c.siteUrl, base);
    const head = { ok: true, id, title: base.title, status: base.status };
    if (want) {
      return {
        ...head,
        path: want,
        file: saved[0].file,
        original: saved[0].file.replace(/\.(md|html|json)$/, ".orig.$1"),
        text: saved[0].text
      };
    }
    const savedPaths = new Set(saved.map((s) => s.path));
    const notSaved = all.filter((b) => !savedPaths.has(b.path) && !b.innerBlocks).map((b) => ({ path: b.path, kind: b.kind, name: b.name, text: b.text }));
    return { ...head, saved, notSaved };
  });
}
var IN_PAGE_NOTE = "Opened in the browser: the whole page, with this block changed; the live page is unchanged. The customer must be logged in to wp-admin to see it; the link works for 7 days, until the block is previewed again or replaced.";
function cmdPreview2(ctx) {
  return run(ctx, async (c) => {
    const [target, path, fileArg, ...rest] = ctx.positional;
    const inPage = !!fileArg && !rest.length && BLOCK_PATH.test(path ?? "");
    const files = await blockFiles(ctx.dir, inPage ? [fileArg] : ctx.positional);
    const at = inPage ? { id: await resolvePostId(c, target), path } : void 0;
    const { blocks, uploaded, warnings } = await blocksOf(c, ctx, files);
    try {
      const res = await c.previewBlocks(blocks, ctx.flags.get("title"), at);
      openBrowser(res.previewUrl);
      return {
        ok: true,
        previewUrl: res.previewUrl,
        blocks: files.map((f) => relative3(ctx.dir, f)),
        uploaded,
        warnings,
        note: at ? IN_PAGE_NOTE : "Opened in the browser. The customer must be logged in to wp-admin to see it; the link works for 7 days."
      };
    } catch (e) {
      if (e instanceof AgentHttpError) return withFileNames(abilityError(e), files, ctx.dir);
      throw e;
    }
  });
}
function cmdCreate(ctx) {
  return run(ctx, async (c) => {
    const type = ctx.flags.get("type");
    const title = ctx.flags.get("title");
    if (!type || !title) {
      throw new UsageError(
        'usage: puffergo pages create --type <type> --title "<title>" [--excerpt "\u2026"] <files|folder\u2026>'
      );
    }
    const seo = seoFlags(ctx);
    const files = await blockFiles(ctx.dir, ctx.positional);
    const key = files.map((f) => relative3(ctx.dir, f)).join("|");
    const earlier = (await created.read(ctx.dir, c.siteUrl))[key];
    if (earlier && ctx.flags.get("new") !== "true") {
      return {
        ok: false,
        code: "already_created",
        fix: "ai",
        id: earlier,
        message: `These files were already made into post ${earlier}. To change it, edit its blocks (\`pages blocks ${earlier}\`, then get / replace). Only if the customer wants one more separate copy, run create again with --new.`
      };
    }
    const { blocks, uploaded, warnings } = await blocksOf(c, ctx, files);
    const categories = categoryFlag(ctx);
    const featured = await featuredImage(c, ctx);
    if (featured?.uploaded) uploaded.push(featured.uploaded);
    try {
      const excerpt = ctx.flags.get("excerpt");
      const post = await c.createPost({
        type,
        title,
        blocks,
        ...excerpt ? { excerpt } : {},
        ...seoInput2(seo),
        ...featured ? { featuredImage: featured.id } : {},
        ...categories ? { categories } : {}
      });
      await rememberBase(ctx.dir, c.siteUrl, post);
      await created.remember(ctx.dir, c.siteUrl, key, post.id);
      return {
        ok: true,
        id: post.id,
        type: post.type,
        status: post.status,
        blocks: post.blocks,
        previewUrl: post.link,
        editUrl: post.editUrl,
        seo: post.seo,
        categories: post.categories,
        uploaded,
        warnings: [...warnings, ...seoWarnings(seo)]
      };
    } catch (e) {
      if (e instanceof AgentHttpError) return withFileNames(abilityError(e), files, ctx.dir);
      throw e;
    }
  });
}
function cmdReplace(ctx) {
  return run(ctx, async (c) => {
    const [target, path, fileArg] = ctx.positional;
    if (!target || !path || !fileArg)
      throw new UsageError("usage: puffergo pages replace <id|link> <block path> <file>");
    const id = await resolvePostId(c, target);
    const base = await baseOf2(ctx.dir, c.siteUrl, id);
    if (!base) {
      return {
        ok: false,
        code: "get_first",
        fix: "ai",
        message: `Read the post first (\`puffergo pages get ${id} ${path}\`), then edit the file it saves.`
      };
    }
    const post = await c.getBlocks(id);
    if (isLive(post.status) && !customerSaid(ctx) && !await editLiveAllowed(ctx.dir, c.siteUrl)) {
      return {
        ok: false,
        code: "live_locked",
        fix: "ai",
        message: liveLockedMessage("page", "pages")
      };
    }
    const files = await blockFiles(ctx.dir, [fileArg]);
    const { blocks, uploaded, warnings } = await blocksOf(c, ctx, files);
    try {
      const updated = await c.replaceBlock({
        id,
        path,
        block: blocks[0],
        baseModified: base
      });
      await rememberBase(ctx.dir, c.siteUrl, updated);
      return {
        ok: true,
        id,
        path,
        status: updated.status,
        previewUrl: updated.link,
        editUrl: updated.editUrl,
        uploaded,
        warnings,
        revision: updated.revision,
        ...isLive(updated.status) ? { note: "This changed the live page." } : {}
      };
    } catch (e) {
      const conflict = conflictOutput(e, `puffergo pages get ${id} ${path}`);
      if (conflict) return conflict;
      if (e instanceof AgentHttpError) return withFileNames(abilityError(e), files, ctx.dir);
      throw e;
    }
  });
}
var FLAG = {
  slug: "slug",
  seoTitle: "seo-title",
  seoDescription: "seo-description",
  focusKeyword: "focus-keyword",
  keywords: "keywords"
};
function seoInput2(seo) {
  const { keywords, ...rest } = seo;
  return keywords === void 0 ? rest : {
    ...rest,
    keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean)
  };
}
function flagName(k) {
  return `--${FLAG[k]}`;
}
function seoFlags(ctx) {
  const out = {};
  for (const k of Object.keys(FLAG)) {
    const v = ctx.flags.get(FLAG[k]);
    if (v && v !== "true") out[k] = v;
  }
  return out;
}
function categoryFlag(ctx) {
  const raw = ctx.flags.get("category");
  if (!raw || raw === "true") return void 0;
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}
async function taxonomyOf(c, type) {
  const { items } = await c.postTypes();
  const found = items.find((i) => i.type === type);
  if (!found) throw new UsageError(`No content type "${type}" on this site. Run \`puffergo pages types\` to see them.`);
  return found.taxonomy;
}
function cmdPageCategories(ctx) {
  return run(ctx, async (c) => {
    const [type, sub] = ctx.positional;
    if (!type || sub !== "check" && sub !== "push")
      throw new UsageError("usage: puffergo pages categories <type> <check | push>");
    const tax = await taxonomyOf(c, type);
    if (!tax)
      return {
        ok: false,
        code: "no_categories",
        fix: "ai",
        message: `Content of type "${type}" is not filed under categories on this site, so it has no tree to write. Pages are filed nowhere; blog posts, case studies and solutions are.`
      };
    const file = categoriesFileFor(type);
    const tree = await readCategoriesFile(ctx.dir, file);
    if (tree === null)
      return {
        ok: false,
        code: "no_file",
        fix: "ai",
        message: `No ${file} in the work folder. Write the customer's ${tax.label} tree there as { "categories": [ { "name": "\u2026", "slug": "\u2026", "children": [ \u2026 ] } ] }, show it to them, then run this again.`
      };
    try {
      return {
        taxonomy: tax.slug,
        ...await syncCategories(c, {
          tree,
          restBase: tax.restBase,
          file,
          push: sub === "push",
          editLive: await editLiveAllowed(ctx.dir, c.siteUrl),
          editLiveHint: 'pages edit-live on --customer-said "\u2026"'
        })
      };
    } catch (e) {
      if (e instanceof SyntaxError) return { ok: false, code: "invalid_json", message: `${file}: ${e.message}` };
      throw e;
    }
  });
}
function seoWarnings(seo, before = {}) {
  return ["seoTitle", "seoDescription"].map((k) => claimWarning(flagName(k), seo[k], before[k] ?? "")).filter((w) => w !== null);
}
async function featuredImage(c, ctx) {
  const arg = ctx.flags.get("featured-image");
  if (!arg) return null;
  const abs = resolve9(ctx.dir, arg);
  if (!existsSync16(abs)) throw new FileError("image_not_found", `The featured image "${arg}" isn't there.`);
  const cache2 = await readUploadsCache(ctx.dir, c.siteUrl);
  try {
    const up = await resolveUpload(c, cache2, abs);
    return { id: up.mediaId, ...up.reused ? {} : { uploaded: relative3(ctx.dir, abs) } };
  } finally {
    await writeUploadsCache(ctx.dir, c.siteUrl, cache2);
  }
}
function cmdPublish2(ctx) {
  return run(ctx, async (c) => {
    const id = await resolvePostId(c, ctx.positional[0]);
    const refused = publishRefusal(ctx, "page");
    if (refused) return refused;
    const base = await baseOf2(ctx.dir, c.siteUrl, id);
    if (!base) {
      return {
        ok: false,
        code: "get_first",
        fix: "ai",
        message: `Read it first (\`puffergo pages get ${id}\`) and show the customer what goes live, then publish.`
      };
    }
    try {
      const post = await c.publishPost({ id, baseModified: base });
      await rememberBase(ctx.dir, c.siteUrl, post);
      return { ok: true, id, status: post.status, link: post.link, editUrl: post.editUrl };
    } catch (e) {
      return conflictOutput(e, `puffergo pages get ${id}`) ?? errorOutput(e);
    }
  });
}
function cmdSeo(ctx) {
  return run(ctx, async (c) => {
    const id = await resolvePostId(c, ctx.positional[0]);
    const seo = seoFlags(ctx);
    const categories = categoryFlag(ctx);
    const wantsImage = !!ctx.flags.get("featured-image");
    if (!Object.keys(seo).length && !wantsImage && !categories) {
      const post2 = await c.getBlocks(id);
      await rememberBase(ctx.dir, c.siteUrl, post2);
      return {
        ok: true,
        id,
        title: post2.title,
        status: post2.status,
        link: post2.link,
        seo: post2.seo,
        categories: post2.categories
      };
    }
    const base = await baseOf2(ctx.dir, c.siteUrl, id);
    if (!base) {
      return {
        ok: false,
        code: "get_first",
        fix: "ai",
        message: `Read the post's SEO first (\`puffergo pages seo ${id}\`), then change it.`
      };
    }
    const post = await c.getBlocks(id);
    if (isLive(post.status) && seo.slug && seo.slug !== post.seo.slug) {
      return {
        ok: false,
        code: "slug_locked",
        fix: "user",
        message: "This page is published, so its address (slug) is not changed here, even when the customer agrees. If the customer really wants a new address, they change it in wp-admin and add a redirect from the old one. The SEO title, description and featured image can still be changed."
      };
    }
    if (isLive(post.status) && !customerSaid(ctx) && !await editLiveAllowed(ctx.dir, c.siteUrl)) {
      return {
        ok: false,
        code: "live_locked",
        fix: "ai",
        message: liveLockedMessage("page", "pages")
      };
    }
    const featured = await featuredImage(c, ctx);
    try {
      const updated = await c.updateSeo({
        id,
        baseModified: base,
        ...seoInput2(seo),
        ...featured ? { featuredImage: featured.id } : {},
        ...categories ? { categories } : {}
      });
      await rememberBase(ctx.dir, c.siteUrl, updated);
      const before = {
        seoTitle: post.seo.seoTitle ?? void 0,
        seoDescription: post.seo.seoDescription ?? void 0
      };
      return {
        ok: true,
        id,
        status: updated.status,
        link: updated.link,
        editUrl: updated.editUrl,
        seo: updated.seo,
        categories: updated.categories,
        before: post.seo,
        ...featured?.uploaded ? { uploaded: [featured.uploaded] } : {},
        warnings: seoWarnings(seo, before)
      };
    } catch (e) {
      return conflictOutput(e, `puffergo pages seo ${id}`) ?? errorOutput(e);
    }
  });
}

// packages/cli/src/index.ts
var rawArgv = process.argv.slice(2);
var group = ["products", "pages", "login", "site", "__login-wait"].includes(rawArgv[0] ?? "") ? rawArgv[0] : "silo";
var argv = rawArgv[0] === "silo" || group === "products" || group === "pages" || group === "site" ? rawArgv.slice(1) : rawArgv;
var cmd = argv[0];
var flags = /* @__PURE__ */ new Map();
var positional = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const eq = a.indexOf("=");
    if (eq >= 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags.set(a.slice(2), argv[++i]);
    else flags.set(a.slice(2), "true");
  } else positional.push(a);
}
var dir = flags.get("dir") ?? process.cwd();
var configPath = flags.get("config") ?? process.env.PUFFERGO_CONFIG;
var log = (s = "") => {
  process.stdout.write(s + "\n");
};
var die = (code, message) => {
  emit({ ok: false, code, message });
  process.exit(1);
};
var wantedSite = flags.get("site");
async function loadWs() {
  const ws = await readWorkspace(dir, wantedSite);
  if (!ws) {
    const sites = await listSites(dir);
    if (sites.length && wantedSite && !await resolveSite(dir, wantedSite)) {
      die("site_not_found", `\u8FD9\u4E2A vault \u91CC\u6CA1\u6709\u7AD9\u70B9\u300C${wantedSite}\u300D\u3002\u5DF2\u8FDE\u63A5\u7684\u7AD9\u70B9\uFF1A${sites.join("\u3001")}`);
    }
    if (sites.length > 1) {
      die("site_required", `\u8FD9\u4E2A vault \u8FDE\u4E86\u591A\u4E2A\u7AD9\u70B9\uFF0C\u7528 --site \u6307\u5B9A\u4E00\u4E2A\uFF1A${sites.join("\u3001")}`);
    }
    die("no_workspace", `\u672A\u627E\u5230\u5DE5\u4F5C\u533A\uFF08\u5148\u8FD0\u884C silo init\uFF09\uFF1A${dir}`);
  }
  applySeoLimits(ws.seoLimits);
  return ws;
}
var SEV_ORDER = ["critical", "warning", "info"];
var SEV_ICON = { critical: "\u{1F534}", warning: "\u{1F7E1}", info: "\u{1F535}" };
function printHealth(issues) {
  if (!issues.length) return log("\u{1F7E2} \u5065\u5EB7\u68C0\u67E5\uFF1A\u65E0\u95EE\u9898");
  for (const sev of SEV_ORDER) {
    const group2 = issues.filter((i) => i.severity === sev);
    if (!group2.length) continue;
    log(`
${SEV_ICON[sev]} ${sev} (${group2.length})`);
    for (const it of group2) log(`  \u2022 ${it.title} \u2014 ${it.detail}`);
  }
}
async function cmdInit() {
  const name = flags.get("name");
  const url = flags.get("url");
  if (!name || !url) die("usage", '\u7528\u6CD5\uFF1Asilo init --name "\u7AD9\u70B9\u540D" --url "https://example.com" [--tagline "\u5B9A\u4F4D"]');
  const sites = await listSites(dir);
  const existing = sites.length > 0 || await readWorkspace(dir, wantedSite);
  if (existing && flags.get("force") !== "true") {
    die(
      "workspace_exists",
      sites.length ? `\u8FD9\u4E2A vault \u5DF2\u7ECF\u6709\u5DE5\u4F5C\u533A\u4E86\uFF08\u5DF2\u8FDE\u63A5\uFF1A${sites.join("\u3001")}\uFF09\uFF0C\u4E0D\u8981\u91CD\u5EFA;\u76F4\u63A5\u7528,\u6216\u7528 --site \u6307\u5B9A\u7AD9\u70B9` : "\u5DE5\u4F5C\u533A\u5DF2\u5B58\u5728\uFF08\u52A0 --force \u8986\u76D6\uFF09"
    );
  }
  const ws = emptyWorkspace({ name, url, tagline: flags.get("tagline") });
  await writeWorkspace(dir, ws);
  log(`\u2713 \u5DF2\u521B\u5EFA\u5DE5\u4F5C\u533A\uFF1A${name} (${url})`);
}
async function cmdPlan() {
  const file = positional[0];
  if (!file) die("usage", "\u7528\u6CD5\uFF1Asilo plan <plan.json>");
  let raw;
  try {
    raw = await readFile17(file, "utf8");
  } catch {
    die("file_not_found", `\u672A\u627E\u5230 plan \u6587\u4EF6\uFF1A${file}`);
  }
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (e) {
    die("invalid_json", `plan \u6587\u4EF6\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${e instanceof Error ? e.message : String(e)}`);
  }
  const ws = await readWorkspace(dir) ?? (plan.profile ? emptyWorkspace(plan.profile) : null);
  if (!ws) die("no_profile", "\u65E0\u5DE5\u4F5C\u533A\u4E14 plan \u672A\u542B profile\uFF1A\u5148 silo init \u6216\u5728 plan \u91CC\u52A0 profile");
  const res = applyPlan(ws, plan);
  await writeWorkspace(dir, res.ws);
  const files = await scaffoldVault(dir, res.ws, res.purposes);
  const reused = res.counts.nodesReused || res.counts.contentsReused ? `\uFF08\u590D\u7528\u66F4\u65B0\uFF1A\u8282\u70B9 ${res.counts.nodesReused}\uFF0C\u5185\u5BB9 ${res.counts.contentsReused}\uFF09` : "";
  log(
    `\u2713 \u5E94\u7528\u8BA1\u5212\uFF1A\u5173\u952E\u8BCD +${res.counts.keywords}\uFF0C\u8282\u70B9 +${res.counts.nodes}\uFF0C\u5185\u5BB9 +${res.counts.contents}${reused}\uFF1B\u5199\u5165 ${files} \u4E2A md \u6587\u4EF6`
  );
  printHealth(healthCheck(res.ws));
}
async function cmdPush2() {
  let ws = await loadWs();
  const force = flags.get("force") === "true";
  const bodies = await scanVault(dir);
  const edited = applyFrontmatterEdits(ws, bodies);
  ws = edited.ws;
  if (edited.changed) log(`\u21A9 \u5DF2\u4ECE ${edited.changed} \u7BC7\u7B14\u8BB0\u7684 frontmatter \u8BFB\u56DE\u7F16\u8F91`);
  const { client: client2, siteUrl } = await connect(dir, { configPath, site: wantedSite });
  const synced = await readSynced(dir, siteUrl);
  let targets;
  if (positional.length) {
    const m = matchTargets(positional, ws, bodies, dir);
    if (m.unknown.length)
      die("note_not_found", `\u627E\u4E0D\u5230\u8FD9\u4E9B\u7B14\u8BB0\uFF1A${m.unknown.join("\u3001")}\uFF08\u5199\u7B14\u8BB0\u6587\u4EF6\u540D\u3001slug \u6216 WordPress \u6587\u7AE0 id\uFF09`);
    const changed = new Set(changedIds(ws, bodies, synced));
    const same = m.ids.filter((id) => !force && !changed.has(id));
    if (same.length)
      log(
        `\xB7 \u6CA1\u6709\u6539\u52A8\uFF0C\u8DF3\u8FC7\uFF1A${same.map((id) => ws.contents.find((c) => c.id === id)?.title ?? id).join("\u3001")}\uFF08\u4E00\u5B9A\u8981\u91CD\u63A8\u5C31\u52A0 --force\uFF09`
      );
    targets = m.ids.filter((id) => !same.includes(id));
    if (!targets.length) return log("\u6CA1\u6709\u8981\u63A8\u9001\u7684\u6539\u52A8\u3002");
  } else {
    targets = changedIds(ws, bodies, synced);
    const skipped = ws.contents.length - targets.length;
    if (skipped) log(`\xB7 \u8DF3\u8FC7 ${skipped} \u7BC7\u4E0A\u6B21\u540C\u6B65\u540E\u6CA1\u6539\u8FC7\u7684\uFF1B\u8981\u63A8\u9001\u6307\u5B9A\u7684\u7B14\u8BB0\uFF0C\u628A\u6587\u4EF6\u540D\u5199\u5728\u547D\u4EE4\u540E\u9762`);
    if (!targets.length) return log("\u6CA1\u6709\u8981\u63A8\u9001\u7684\u6539\u52A8\u3002");
  }
  const pushing = new Set(targets);
  const resolvedBody = /* @__PURE__ */ new Map();
  let uploaded = 0;
  for (const [id, file] of bodies) {
    if (!pushing.has(id)) continue;
    if (!file.body.trim()) {
      resolvedBody.set(id, file.body);
      continue;
    }
    const res = await resolveBodyAssets(file.body, wpAssetUploader(client2, [dirname11(file.path), dir]));
    resolvedBody.set(id, res.md);
    if (res.uploaded) {
      await updateNoteBody(file.path, res.md);
      uploaded += res.uploaded;
    }
  }
  if (uploaded) log(`\u2B06 \u4E0A\u4F20\u56FE\u7247 ${uploaded} \u5F20\u5E76\u6539\u5199\u4E3A\u7EBF\u4E0A\u5730\u5740`);
  const bodyOf = (id) => resolvedBody.get(id) ?? "";
  const noteNames = noteNamesFromScan(bodies);
  let ok = 0;
  let conflict = 0;
  let failed = 0;
  const needsRelink = /* @__PURE__ */ new Set();
  const pushedIds = [];
  for (const item of ws.contents) {
    if (!pushing.has(item.id)) continue;
    const { md, unresolved } = resolveWikilinks(bodyOf(item.id), buildLinkResolver(ws, noteNames));
    const res = await syncContent(client2, ws, item, { force, content: md || void 0 });
    if (res.ok) {
      ws = updateContent(ws, item.id, res.patch);
      ok++;
      pushedIds.push(item.id);
      if (unresolved.length) needsRelink.add(item.id);
      log(`  \u2713 ${item.title}${md ? "\uFF08\u542B\u6B63\u6587\uFF09" : "\uFF08\u4EC5\u7ED3\u6784/SEO\uFF09"} \u2192 #${res.patch.wpPostId}`);
    } else if ("conflict" in res && res.conflict) {
      conflict++;
      log(`  \u26A0 \u51B2\u7A81\uFF08WP \u7AEF\u5DF2\u6539\uFF09\uFF1A${item.title} \u2014 \u7528 --force \u8986\u76D6`);
    } else {
      failed++;
      log(`  \u2716 \u5931\u8D25\uFF1A${item.title} \u2014 ${"error" in res ? res.error : "\u672A\u77E5"}`);
    }
  }
  if (needsRelink.size) {
    const resolver = buildLinkResolver(ws, noteNames);
    let relinked = 0;
    const stillBroken = [];
    for (const item of ws.contents) {
      if (!needsRelink.has(item.id)) continue;
      const { md, unresolved } = resolveWikilinks(bodyOf(item.id), resolver);
      if (!md) continue;
      if (unresolved.length) stillBroken.push(`${item.title} \u2192 ${unresolved.join("\u3001")}`);
      const res = await syncContent(client2, ws, item, { force: true, content: md });
      if (res.ok) {
        ws = updateContent(ws, item.id, res.patch);
        relinked++;
      }
    }
    if (relinked) log(`  \u21BB \u4E8C\u6B21\u89E3\u6790\u5185\u94FE\u540E\u91CD\u63A8 ${relinked} \u7BC7`);
    for (const line of stillBroken)
      log(
        `  \u26A0 \u5185\u94FE\u6CA1\u89E3\u6790\u6210\u7F51\u5740\uFF1A${line} \u2014 \u5B83\u6307\u5411\u7684\u4E0D\u662F\u53F0\u8D26\u91CC\u7684\u7B14\u8BB0\uFF0C\u6B63\u6587\u91CC\u73B0\u5728\u662F\u7EAF\u6587\u672C\uFF1B\u8981\u8BA9\u5B83\u4EEC\u94FE\u8D77\u6765\uFF0C\u7528\u53F0\u8D26\u91CC\u7B14\u8BB0\u7684\u6587\u4EF6\u540D\uFF0C\u6216\u76F4\u63A5\u5199\u7AD9\u4E0A\u5DF2\u6709\u9875\u9762\u7684\u5B8C\u6574\u7F51\u5740`
      );
  }
  await writeWorkspace(dir, ws);
  const before = await scanVault(dir);
  await scaffoldVault(dir, ws);
  await writeSynced(dir, siteUrl, recordSynced(synced, before, await scanVault(dir), pushedIds));
  log(`
\u5B8C\u6210\uFF1A\u6210\u529F ${ok}\uFF0C\u51B2\u7A81 ${conflict}\uFF0C\u5931\u8D25 ${failed}`);
}
async function cmdPull2() {
  let ws = await loadWs();
  const { client: client2, conn, siteUrl } = await connect(dir, { configPath, site: wantedSite });
  const types = (flags.get("types")?.split(",") ?? conn.contentTypes?.map((t) => t.type) ?? ["post", "page"]).filter(
    Boolean
  );
  let onlyIds;
  if (positional.length) {
    const before2 = await scanVault(dir);
    onlyIds = positional.map((t) => {
      if (/^\d+$/.test(t)) return Number(t);
      const id = ws.contents.find((c) => c.id === matchTargets([t], ws, before2, dir).ids[0])?.wpPostId;
      return id ?? die("post_not_found", `\u627E\u4E0D\u5230\uFF1A${t}\uFF08\u5199 WordPress \u6587\u7AE0 id\uFF0C\u7F16\u8F91\u9875\u5730\u5740\u91CC post= \u540E\u9762\u7684\u6570\u5B57\uFF09`);
    });
  }
  log(`\u62C9\u53D6\u7C7B\u578B\uFF1A${types.join(", ")}${onlyIds ? `\uFF0C\u53EA\u62C9 ${onlyIds.join(", ")}` : ""}`);
  const synced = await readSynced(dir, siteUrl);
  const res = await importFromWp(client2, ws, types, {
    onlyIds,
    noteNames: noteNamesFromScan(await scanVault(dir)),
    wantBodies: true
    // the CLI vault mirrors bodies
  });
  if (onlyIds && res.imported < onlyIds.length)
    log(`\u26A0 \u62C9\u5230 ${res.imported} \u7BC7\uFF0C\u5C11\u4E8E\u8981\u7684 ${onlyIds.length} \u7BC7\uFF08id \u4E0D\u5BF9\uFF0C\u6216\u7C7B\u578B\u4E0D\u5728 ${types.join(", ")} \u91CC\uFF09`);
  ws = res.ws;
  await writeWorkspace(dir, ws);
  const before = await scanVault(dir);
  const files = await scaffoldVault(dir, ws);
  const scanned = await scanVault(dir);
  const kept = [];
  const pulled = [];
  for (const [id, md] of res.bodies) {
    const note = scanned.get(id);
    if (!note) continue;
    if (isEdited(id, before, synced)) {
      kept.push(ws.contents.find((c) => c.id === id)?.title ?? id);
      continue;
    }
    await updateNoteBody(note.path, `
${md}
`);
    pulled.push(id);
  }
  await writeSynced(dir, siteUrl, recordSynced(synced, before, await scanVault(dir), pulled));
  log(
    `\u2713 \u5DF2\u540C\u6B65\uFF1A\u5BFC\u5165/\u66F4\u65B0 ${res.imported} \u7BC7\u5185\u5BB9\uFF0C${ws.nodes.length} \u4E2A\u8282\u70B9\uFF1B\u5199\u5165/\u5237\u65B0 ${files} \u4E2A md \u6587\u4EF6\uFF0C\u6B63\u6587 ${pulled.length} \u7BC7`
  );
  if (kept.length) log(`\u26A0 \u8FD9\u4E9B\u7B14\u8BB0\u6709\u6CA1\u63A8\u9001\u7684\u6539\u52A8\uFF0C\u6B63\u6587\u6CA1\u8986\u76D6\uFF1A${kept.join("\u3001")}`);
  const withPost = ws.contents.filter((c) => c.wpPostId != null && (!onlyIds || onlyIds.includes(c.wpPostId)));
  const withoutBody = withPost.filter((c) => !res.bodies.has(c.id)).map((c) => c.title);
  if (withoutBody.length)
    log(
      `\u2139 ${withoutBody.length} \u7BC7\u7684\u6B63\u6587\u6CA1\u6709\u62C9\u56DE\u672C\u5730\uFF1A${withoutBody.join("\u3001")} \u2014\u2014 \u5B83\u4EEC\u5728\u7AD9\u70B9\u4E0A\u662F\u7528\u7248\u5F0F\u533A\u5757/\u7EC4\u4EF6\u6216\u522B\u7684\u7F16\u8F91\u5668\u505A\u7684\uFF0CMarkdown \u8868\u8FBE\u4E0D\u4E86\uFF0C\u6B63\u6587\u8BF7\u5230 WordPress \u7F16\u8F91\u5668\u91CC\u6539\uFF1B\u8FD9\u4E9B\u7BC7\u7684 SEO \u548C\u5206\u7C7B\u7167\u5E38\u80FD\u63A8`
    );
  const mine = new Set(
    onlyIds ? ws.contents.filter((c) => onlyIds.includes(c.wpPostId ?? -1)).flatMap((c) => [c.id, c.siloNodeId]) : []
  );
  printHealth(healthCheck(ws).filter((i) => !onlyIds || i.nodeIds.some((id) => mine.has(id))));
}
async function cmdHealth() {
  printHealth(healthCheck(await loadWs()));
}
async function cmdStatus() {
  const ws = await loadWs();
  const dirty = getDirtyContents(ws);
  const pending = getPendingContents(ws);
  log(`\u7AD9\u70B9\uFF1A${ws.profile.name} (${ws.profile.url})`);
  log(`\u8282\u70B9 ${ws.nodes.length} \xB7 \u5185\u5BB9 ${ws.contents.length} \xB7 \u5173\u952E\u8BCD ${ws.keywords.length} \xB7 \u8FB9 ${ws.edges.length}`);
  log(`\u672A\u63A8\u9001(dirty) ${dirty.length} \xB7 \u4ECE\u672A\u63A8\u9001(pending) ${pending.length}`);
  const issues = healthCheck(ws);
  log(`\u5065\u5EB7\u95EE\u9898 ${issues.length}\uFF08${issues.filter((i) => i.severity === "critical").length} \u4E25\u91CD\uFF09`);
}
async function cmdView() {
  const ws = await loadWs();
  let res;
  try {
    res = await writePreview(ws, dir, flags.get("no-open") === "true", flags.get("out"));
  } catch (e) {
    if (e instanceof Error && e.message === "preview_bundle_missing") {
      die("error", "\u627E\u4E0D\u5230\u9884\u89C8\u9875\u8D44\u6E90\uFF08preview.js\uFF09\u3002\u672C\u6280\u80FD\u53EF\u80FD\u6CA1\u88C5\u5168\uFF0C\u8BF7\u91CD\u65B0\u5B89\u88C5\u672C\u6280\u80FD\u3002");
    }
    throw e;
  }
  log(`\u2713 \u5DF2\u751F\u6210\u9884\u89C8\u9875\uFF1A${res.file}`);
  log(
    res.opened ? "\u5DF2\u5728\u4F60\u7684\u9ED8\u8BA4\u6D4F\u89C8\u5668\u91CC\u6253\u5F00\u3002\u5DE6\u4E0A\u89D2\u53EF\u5207\u6362\u300C\u603B\u89C8\u300D\u5173\u7CFB\u56FE\u548C\u300C\u7ED3\u6784\u300D\u6811\uFF1B\u8FD9\u662F\u53EA\u8BFB\u9884\u89C8\uFF0C\u6539\u5185\u5BB9\u548C\u53D1\u5E03\u8FD8\u662F\u56DE\u5230\u547D\u4EE4\u884C\u3002" : "\u8BF7\u624B\u52A8\u6253\u5F00\u4E0A\u9762\u8FD9\u4E2A\u6587\u4EF6\u67E5\u770B\uFF08\u53EA\u8BFB\u9884\u89C8\uFF09\u3002"
  );
}
async function main() {
  switch (cmd) {
    case "init":
      return cmdInit();
    case "plan":
      return cmdPlan();
    case "push":
      return cmdPush2();
    case "pull":
      return cmdPull2();
    case "health":
      return cmdHealth();
    case "status":
      return cmdStatus();
    case "view":
      return cmdView();
    default:
      log("puffergo silo <init|plan|push|pull|health|status|view> [--dir <vault>] [--config <path>]");
      log("puffergo login <siteUrl>");
      log("puffergo login status [--wait <seconds>]");
      log(SITE_SETUP_USAGE);
      log(PRODUCTS_USAGE);
      log(PAGES_USAGE);
      if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
  }
}
function emit(result) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!(result && typeof result === "object" && result.ok === true)) process.exitCode = 1;
}
var PRODUCTS_USAGE = 'puffergo products <schema|list [--search q]|check [--only k1,k2]|preview <key\u2026>|push [--only k1,k2 [--customer-said "<customer words>"]]|pull <key|id|link>|publish <key\u2026> --customer-said "<customer words>"|sample <list|set <name> <key|id|link>|show <name>|remove <name>>|images <file|folder\u2026>|categories <check|push>|edit-live [on --customer-said "<customer words>"|off]> [--dir <workdir>] [--site <url>]';
async function products() {
  const ctx = { dir, flags, positional };
  switch (cmd) {
    case "schema":
      return emit(await cmdSchema(ctx));
    case "list":
      return emit(await cmdListProducts(ctx));
    case "check":
      return emit(await cmdCheck(ctx));
    case "preview":
      return emit(await cmdPreview(ctx));
    case "push":
      return emit(await cmdPush(ctx));
    case "pull":
      return emit(await cmdPull(ctx));
    case "publish":
      return emit(await cmdPublish(ctx));
    case "sample":
      return emit(await cmdSample(ctx));
    case "categories":
      return emit(await cmdCategories(ctx));
    case "images":
      return emit(await cmdImages(ctx));
    case "edit-live":
      return emit(await cmdEditLive(ctx));
    default:
      return emit({ ok: false, code: "usage", message: PRODUCTS_USAGE });
  }
}
var PAGES_USAGE = 'puffergo pages <types|find [--type t] [--status publish] [--search q] [--url link]|blocks <id|link>|get <id|link> [path]|preview <files|folder\u2026> [--title t]|preview <id|link> <path> <file>|categories <type> <check|push>|create --type <type> --title "<title>" --slug <slug> --seo-title "\u2026" --seo-description "\u2026" --focus-keyword "\u2026" [--keywords "a, b"] [--category "a, b"] [--featured-image <file>] [--excerpt "\u2026"] [--new] <files|folder\u2026>|replace <id|link> <path> <file> [--customer-said "<customer words>"]|seo <id|link> [--slug s] [--seo-title "\u2026"] [--seo-description "\u2026"] [--focus-keyword "\u2026"] [--keywords "a, b"] [--category "a, b"] [--featured-image <file>] [--customer-said "<customer words>"]|publish <id|link> --customer-said "<customer words>"|edit-live [on --customer-said "<customer words>"|off]> [--dir <workdir>] [--site <url>]';
async function pages() {
  const ctx = { dir, flags, positional };
  switch (cmd) {
    case "types":
      return emit(await cmdTypes(ctx));
    case "find":
      return emit(await cmdFind(ctx));
    case "blocks":
      return emit(await cmdBlocks(ctx));
    case "get":
      return emit(await cmdGet(ctx));
    case "preview":
      return emit(await cmdPreview2(ctx));
    case "create":
      return emit(await cmdCreate(ctx));
    case "replace":
      return emit(await cmdReplace(ctx));
    case "seo":
      return emit(await cmdSeo(ctx));
    case "publish":
      return emit(await cmdPublish2(ctx));
    case "categories":
      return emit(await cmdPageCategories(ctx));
    case "edit-live":
      return emit(await cmdEditLive(ctx));
    default:
      return emit({ ok: false, code: "usage", message: PAGES_USAGE });
  }
}
var SITE_USAGE = SITE_SETUP_USAGE;
async function site() {
  const ctx = { dir, flags, positional };
  switch (cmd) {
    case "setup":
      return emit(await cmdSiteSetup(ctx));
    default:
      return emit({ ok: false, code: "usage", message: SITE_USAGE });
  }
}
var run2 = group === "products" ? products : group === "pages" ? pages : group === "site" ? site : group === "login" ? async () => emit(
  positional[0] === "status" ? await cmdLoginStatus(dir, flags.get("wait")) : await cmdLogin(dir, positional[0] ?? argv[1])
) : group === "__login-wait" ? () => cmdLoginWait(argv[1], argv[2], argv[3], argv[4]) : main;
run2().catch((e) => {
  const shared = siteErrorOutput(e);
  emit(shared ?? { ok: false, code: "error", message: e instanceof Error ? e.message : String(e) });
});
