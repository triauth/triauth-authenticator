/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import {isProxy, toRaw, reactive, watch, onScopeDispose, getCurrentInstance} from "vue";
import {SCHEMA, INDEXES, MIGRATIONS} from "./schema.js";
import {AppError} from "../lib/errors.js";

export const db = {

  SCHEMA,

  _openPromise: null,
  _db: null,          // the connection _openPromise resolved with, while it is open
  _opened: false,     // this page has opened the database at least once
  _active: new Set(), // abort(err) closures of the transactions still running (see _transaction)
  _watchers: [],

  // How long a transaction may take from its creation, the time queued behind other tabs included, before
  // it is aborted and its promise rejected: a frozen or stuck tab must not block the others for good
  transactionTimeout: 15e3,

  // Cross-tab BroadcastChannel change feed
  _channel: null,

  // Re-runs the watchers of the given stores in this tab and, unless the change arrived from
  // another tab, announces it to the others.
  _notify: function (storeNames, fromOtherTab = false) {
    for (const storeName of storeNames) {
      (this._watchers[storeName] || []).forEach((w) => w.eval());
    }
    if (!fromOtherTab) {
      this._openChannel()?.postMessage({stores: storeNames});
    }
  },

  // Opens the BroadcastChannel in this._channel
  _openChannel: function () {
    if (!this._channel && typeof BroadcastChannel === 'function') {
      const self = this;
      self._channel = new BroadcastChannel('triauth-authenticator-db');
      self._channel.onmessage = function ({data}) {
        // A hidden page may be frozen (Android Chrome, after a few minutes in the background): this handler
        // still runs there, but a read started now never finishes and keeps a lock on the store that blocks
        // the other tabs. Everything watched is re-read once the page is visible again (end of this file).
        if (document.visibilityState === 'hidden') return;

        const stores = Array.isArray(data?.stores) ? data.stores.filter((name) => typeof name === 'string') : [];
        if (stores.length > 0) {
          self._notify(stores, true);
        }
      };
    }
    return this._channel;
  },

  _unwrap: function (vueProxyObj) {
    let retval = isProxy(vueProxyObj) ? toRaw(vueProxyObj) : vueProxyObj;

    for (const [key, value] of Object.entries(retval)) {
      if (isProxy(retval[key])) {
        retval[key] = this._unwrap(retval[key]);
      }
    }

    return retval;
  },

  _validateObjectSchema: function (obj, schema, errors = [], _memo = {
    prefix: '',
    validatedKeys: [],
    unknownKeys: [],
    depth: 0
  }) {
    let keyValidated, ok, ov, schemaKeys, sk, sv, unvalidatedSchemaKeys;

    if (_memo.depth > 8) {
      return errors.push('Maximum depth reached');
    }

    for (ok in obj) {
      ov = obj[ok];
      keyValidated = false;

      for (sk in schema) {
        sv = schema[sk];
        if (
          _memo.prefix + ok === sk ||
          _memo.prefix + '*' === sk ||
          sk === '**' ||
          (sk.indexOf('*') >= 0 && (_memo.prefix + ok).match(new RegExp('^' + sk.replaceAll('.', '\\.').replaceAll('**', '.+').replaceAll('*', '[a-z0-9]+') + '$')))
        ) {
          // Check type
          if (sv.type && ![sv.type].flat().some((t) => {
            return (t === 'null' && ov === null) || (typeof ov === t)
          })) {
            errors.push(`Expected ${_memo.prefix + ok} to be of ${sv.type} type.`);
          }
          // Check string match
          if (sv.match && ov !== null && (typeof sv.match === 'function' ? !sv.match(ov) : !String(ov).match(sv.match))) {
            errors.push(`Field ${_memo.prefix + ok} has invalid value ${JSON.stringify(ov)}.`);
          }
          // Check instance
          if (sv.instance && !(ov instanceof sv.instance)) {
            errors.push(`Expected ${_memo.prefix + ok} to be an instance of ${sv.instance}.`);
          }
          // Remember that this key was validated
          keyValidated = true;
          _memo.validatedKeys.push(sk);
        }
      }
      if (!keyValidated) {
        // Remember if object key has not been validated (is missing from schema)
        _memo.unknownKeys.push(_memo.prefix + ok);
      }

      // Recursive match nested objects
      if (keyValidated && typeof ov === 'object') {
        this._validateObjectSchema(ov, schema, errors, {
          prefix: _memo.prefix + ok + '.',
          validatedKeys: _memo.validatedKeys,
          unknownKeys: _memo.unknownKeys,
          depth: _memo.depth + 1
        });
      }
    }
    // Further checks which are need to be done once, at the end of validation
    if (_memo.prefix === '') {
      // Look for keys defined in schema but missing from the obj
      schemaKeys = Object.keys(schema);
      unvalidatedSchemaKeys = schemaKeys.filter(function (sk) {
        return !schema[sk].optional && _memo.validatedKeys.indexOf(sk) === -1;
      });
      if (unvalidatedSchemaKeys.length > 0) {
        errors.push(`Following keys are required but missing: ${unvalidatedSchemaKeys.join(', ')}.`);
      }
      // Look for keys defined in obj but missing from schema
      if (_memo.unknownKeys.length > 0) {
        errors.push(`Following excess keys appear in the object: ${_memo.unknownKeys.join(', ')}.`);
      }
      return true;
    }
  },

  validate: function (storeName, obj) {
    let errors = [];
    this._validateObjectSchema(obj, SCHEMA[storeName], errors);
    return {valid: errors.length === 0, errors};
  },

  _ensureValid: function (storeName, obj) {
    const {valid, errors} = this.validate(storeName, obj);
    if (!valid) {
      throw new AppError('Schema validation failed for ' + storeName, {storeName, errors});
    }
  },

  open: async function (force = false) {
    const self = this;

    if (force) {
      this._openPromise = null
    }
    if (this._openPromise) {
      return this._openPromise;
    }

    const promise = new Promise(function (resolve, reject) {
      let watchdogTimer = null;
      let settled = false;

      // Rejects this attempt but clears the memoized promise (unless a newer attempt
      // already replaced it), so the next open() retries instead of staying broken.
      const fail = function (err) {
        settled = true;
        clearTimeout(watchdogTimer);
        if (self._openPromise === promise) {
          self._openPromise = null;
        }
        console.error(err);
        return reject(err);
      };

      // Backstop for opens that hang without firing any event (e.g. WebKit's
      // first-launch bug) - re-armed with a larger budget for upgrades and blocks.
      const armWatchdog = function (duration) {
        clearTimeout(watchdogTimer);
        watchdogTimer = setTimeout(function () {
          fail(new AppError('Timed out while opening IndexedDB database'));
        }, duration);
      };
      armWatchdog(5e3);

      let request = globalThis.indexedDB.open('triauth-authenticator', SCHEMA.VERSION);

      // The upgradeneeded event is fired when an attempt was made to open a database with a version number higher than its current version.
      request.onupgradeneeded = function (event) {
        armWatchdog(30e3); // migrations legitimately take longer than a plain open

        let db = event.target.result;
        let transaction = event.target.transaction; // the versionchange transaction

        // Reconcile object stores with the declared schema.
        for (const storeName of Object.keys(SCHEMA)) {
          if (storeName === 'VERSION') continue; // not an object store
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, {keyPath: 'id', autoIncrement: true});
          }
        }

        // Reconcile declared secondary indexes. Deliberately runs AFTER the data
        // migrations below, so a migration can clean a store before a new unique
        // index is populated (see the RULE in schema.js).
        const reconcileIndexes = function () {
          for (const [storeName, indexes] of Object.entries(INDEXES)) {
            const store = transaction.objectStore(storeName);
            for (const {name, keyPath, options} of indexes) {
              if (!store.indexNames.contains(name)) {
                store.createIndex(name, keyPath, options);
              }
            }
          }
        };

        // Versioned data-migration ladder, chained through done() callbacks so each
        // migration sees the previous one's completed writes (contract in schema.js).
        // Fresh installs have no data to migrate and skip straight to reconciliation.
        const pending = [];
        if (event.oldVersion > 0) {
          for (let version = event.oldVersion + 1; version <= SCHEMA.VERSION; version++) {
            if (MIGRATIONS[version]) {
              pending.push(version);
            }
          }
        }
        (function next() {
          const version = pending.shift();
          if (version === undefined) return reconcileIndexes(); // ladder finished; the transaction commits when idle
          MIGRATIONS[version]({db, transaction, oldVersion: event.oldVersion}, next);
        })();
      };

      request.onsuccess = function (event) {
        clearTimeout(watchdogTimer);
        let db = event.target.result;

        if (settled) {
          // The watchdog already rejected this attempt - don't leak the connection.
          return db.close();
        }

        self._db = db;
        self._opened = true;

        // Drops this connection from the memo, so that the next call opens a fresh one
        const forget = function () {
          if (self._db === db) {
            self._db = null;
            self._openPromise = null;
          }
        };

        // The browser closed the connection on its own (e.g. the user cleared the site data)
        db.onclose = forget;

        // Another tab, running newer code after a deploy, upgrades the database: let it through and pick up
        // the new code once the user looks at this page (a frozen or hidden page would block the upgrade)
        db.onversionchange = function () {
          console.warn('[triauth-authenticator][db] The version of this database has changed, page will reload');
          db.close();
          forget();
          self._reloadWhenVisible();
        };

        return resolve(db);
      };

      request.onerror = function (event) {
        const error = event.target?.error;
        // The database is ahead of this code: another tab upgraded it while this page held no connection
        // (it was frozen). Only reload when this page did open it before - a first open failing this way
        // is a rollback, and reloading would loop.
        if (error?.name === 'VersionError' && self._opened) {
          self._reloadWhenVisible();
        }
        fail(new AppError('Could not open IndexedDB database', {cause: error}));
      };

      // Fired when an open connection in another tab blocks this versionchange. That
      // tab's onversionchange handler closes it and reloads, so the open proceeds by
      // itself shortly - wait for it instead of rejecting.
      request.onblocked = function (event) {
        console.warn('[triauth-authenticator][db] Database open blocked by another tab, waiting for it to close');
        armWatchdog(15e3);
      };
    });

    this._openPromise = promise;
    return promise;
  },

  // Runs body(transaction, out) in a tracked transaction on the given store(s). body must issue its first
  // request synchronously (a transaction that goes idle commits empty). Resolves with out.value once the
  // transaction has committed (watchers are notified after a readwrite commit); rejects when a request
  // fails, when body throws, when the transaction is aborted (out.error first, then transaction.error) and
  // when it has not finished within transactionTimeout.
  _transaction: async function (storeNames, mode, body) {
    const self = this;
    const db = await self.open(); // a failed open rejects the caller

    return new Promise(function (resolve, reject) {
      let transaction;
      try {
        transaction = db.transaction(storeNames, mode);
      } catch (err) {
        return reject(err); // an unknown store, or a connection closed in the meantime
      }

      const out = {};

      // Aborts with the given error; the rejection follows in onabort. A transaction that has already
      // finished throws InvalidStateError here, and has settled the promise by itself.
      const abort = function (err) {
        out.error ||= err;
        try { transaction.abort(); } catch (e) {}
      };

      const timer = setTimeout(function () {
        abort(new AppError('Another tab or window of the authenticator is keeping its database busy. Close it and try again.'));
      }, self.transactionTimeout);
      self._active.add(abort);

      const finish = function () {
        clearTimeout(timer);
        self._active.delete(abort);
      };

      transaction.oncomplete = function () {
        finish();
        resolve(out.value);
        if (mode === 'readwrite') {
          // Watchers fire after commit so they re-query committed data.
          self._notify([storeNames].flat());
        }
      };

      transaction.onabort = function () {
        finish();
        reject(out.error || transaction.error || new Error('Transaction aborted'));
      };

      try {
        body(transaction, out);
      } catch (err) {
        abort(err);
      }
    });
  },

  // Aborts the transactions still running and closes the memoized connection, so that this page holds no
  // lock and no connection: a frozen page cannot finish them and would block every other tab. The next
  // call opens a fresh connection. A pending open() is left alone - it memoizes its connection on success.
  _close: function () {
    for (const abort of this._active) {
      abort(new AppError('The browser paused the authenticator while it was busy. Please try again.'));
    }
    if (this._db) {
      this._db.close();
      this._db = null;
      this._openPromise = null;
    }
  },

  // The code on this page is stale (another tab upgraded the database): reload now if the page is
  // visible, otherwise as soon as it is looked at again
  _reloadWhenVisible: function () {
    if (document.visibilityState === 'visible') {
      return window.location.reload();
    }
    document.addEventListener('visibilitychange', function () { window.location.reload(); }, {once: true});
  },

  perform: async function (storeName, transactionMode, callbacks, fName, ...fArgs) {
    return this._transaction(storeName, transactionMode, function (transaction, out) {
      const request = transaction.objectStore(storeName)[fName](...fArgs);

      // Cursor-style iteration (see list()): the caller's handler runs once per cursor step and resolves
      // the outer promise itself. Otherwise the request result (e.g. the key generated by add/put) is what
      // the transaction resolves with. A failed request aborts the transaction, which rejects.
      request.onsuccess = callbacks.onsuccess || function () { out.value = request.result; };
    });
  },

  get: async function (storeName, id) {
    return this.perform(storeName, 'readonly', {}, 'get', id);
  },

  set: async function (storeName, val) {
    val = this._unwrap(val);
    this._ensureValid(storeName, val);

    return this.perform(storeName, 'readwrite', {}, 'put', val);
  },

  patch: function (storeName, patchData) {
    const self = this;
    patchData = self._unwrap(patchData);

    // get + put run in one read-write transaction so the read-modify-write is
    // atomic. The put must be issued inside the get's onsuccess, while the
    // transaction is still active (it auto-commits if it goes idle).
    return self._transaction(storeName, 'readwrite', function (transaction, out) {
      const store = transaction.objectStore(storeName);

      const getRequest = store.get(patchData.id);
      getRequest.onsuccess = function () {
        const obj = getRequest.result;
        if (!obj) return; // nothing to patch; the transaction commits and resolves with undefined

        for (const [key, val] of Object.entries(patchData)) {
          obj[key] = val;
        }

        const {valid, errors} = self.validate(storeName, obj);
        if (!valid) {
          out.error = new AppError('Schema validation failed for ' + storeName, {storeName, errors});
          return transaction.abort();
        }

        const putRequest = store.put(obj);
        putRequest.onsuccess = function () { out.value = putRequest.result; };
      };
    });
  },

  add: async function (storeName, val) {
    val = this._unwrap(val);
    this._ensureValid(storeName, val);
    return this.perform(storeName, 'readwrite', {}, 'add', val).then((id) => {
      return Object.assign({}, val, {id})
    });
  },

  delete: async function (storeName, id) {
    return this.perform(storeName, 'readwrite', {}, 'delete', id);
  },

  // Deletes a root row plus every row in the related stores whose indexed field
  // references it, all in one transaction - either everything goes or nothing does.
  // `relations` maps store name -> index name whose value must equal the root id,
  // e.g. {websites: 'identityId', tokens: 'identityId'}. Flat by design: related
  // stores carry a (possibly denormalized) reference to the root; there is no
  // transitive resolution.
  deleteCascade: async function (rootStore, id, relations) {
    const storeNames = [rootStore, ...Object.keys(relations)];

    return this._transaction(storeNames, 'readwrite', function (transaction) {
      transaction.objectStore(rootStore).delete(id);

      // A relation naming an index this database does not have throws here, and _transaction aborts, so
      // that the root delete issued above cannot commit on its own and leave the related rows behind.
      for (const [storeName, indexName] of Object.entries(relations)) {
        const store = transaction.objectStore(storeName);
        const keysRequest = store.index(indexName).getAllKeys(IDBKeyRange.only(id));
        keysRequest.onsuccess = function () {
          // Issued from a request callback of the same transaction, keeping it active.
          for (const key of keysRequest.result) {
            store.delete(key);
          }
        };
      }
    });
  },

  // Deletes an identity together with every websites/tokens row that references it.
  deleteIdentity: async function (identityId) {
    return this.deleteCascade('identities', identityId, {websites: 'identityId', tokens: 'identityId'});
  },

  // Deletes a website together with every token issued to it (the home screen's "Forget this website").
  deleteWebsite: async function (websiteId) {
    return this.deleteCascade('websites', websiteId, {tokens: 'websiteId'});
  },

  // Removes rows whose expiresAt has passed - housekeeping for tokens left behind by
  // abandoned flows. Flows also refuse expired tokens at use time (Helpers.tokenExpired),
  // so this is about hygiene, not security.
  sweepExpired: async function (storeName) {
    const now = Date.now();
    const rows = await this.list(storeName);
    for (const row of Object.values(rows)) {
      if (row.expiresAt && row.expiresAt < now) {
        await this.delete(storeName, row.id);
      }
    }
  },

  list: function (storeName, iterator) {
    const self = this;
    return new Promise(function (resolve, reject) {
      let retval = {};

      const onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (iterator instanceof RegExp) {
            if (String(cursor.key).match(iterator)) {
              retval[cursor.key] = cursor.value;
            }
          } else if (typeof iterator === 'object' && iterator !== null) {

            let match = true;
            for (const [key, refOrVal] of Object.entries(iterator)) {
              // refOrVal may be undefined (e.g. {identityId: identity?.id} for an unknown
              // identity) - Object.hasOwn would throw on it mid-cursor and abort the read.
              const val = (refOrVal != null && Object.hasOwn(refOrVal, '_value')) ? refOrVal.value : refOrVal;
              if (cursor.value[key] !== val) {
                match = false;
              }
            }

            if (match) {
              retval[cursor.key] = cursor.value;
            }

          } else if (iterator) {
            iterator(cursor);
          } else {
            retval[cursor.key] = cursor.value;
          }

          return cursor.continue();
        } else {
          return resolve(retval);
        }
      }

      self.perform(storeName, 'readonly', {onsuccess}, 'openCursor').catch(reject);
    });
  },

  // @example db.watch('websites', {identityId:Vue.toRef(this, 'identityId')}),
  watch: function (storeName, constraints) {
    const self = this;
    let watcher = {}

    watcher.value = reactive({});
    watcher.eval = function () {
      self.list(storeName, constraints).then((results) => {

        // Remove missing keys
        Object.keys(watcher.value).forEach(key => {
          if (!(key in results)) {
            delete watcher.value[key];
          }
        });

        // Merge existing keys or add new ones
        for (const [key, value] of Object.entries(results)) {
          if (watcher.value[key]) {
            Object.assign(watcher.value[key], results[key]);
          } else {
            watcher.value[key] = results[key];
          }
        }

      }).catch(function (err) {
        // e.g. the read timed out behind another tab or was aborted when the browser froze this page;
        // the next change, or the page becoming visible, re-runs it
        console.warn('[triauth-authenticator][db] Could not refresh the ' + storeName + ' watcher', err);
      });
    }

    const stopVueWatch = constraints ? watch(reactive(constraints), () => watcher.eval()) : null;

    // Subscribe this tab to the writes made in other tabs
    self._openChannel();

    self._watchers[storeName] ||= [];
    self._watchers[storeName].push(watcher);

    // Auto-deregister when the owning component's effect scope is disposed, so SPA
    // navigation doesn't accumulate watchers (each fires on every write).
    if (getCurrentInstance()) {
      onScopeDispose(() => {
        const arr = self._watchers[storeName] || [];
        const i = arr.indexOf(watcher);
        if (i >= 0) arr.splice(i, 1);
        stopVueWatch?.();
      });
    }

    watcher.eval();

    return watcher.value;
  },

  find: async function (storeName, constraints) {
    return Object.values(await this.list(storeName, constraints))[0];
  }
};

// Page Lifecycle: hold no lock and no connection while the browser freezes this page, and refresh what is
// watched when the page is looked at again (changes made by other tabs are ignored while it is hidden)
document.addEventListener('freeze', function () { db._close(); });
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') {
    db._notify(Object.keys(db._watchers), true);
  }
});
