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
  _watchers: [],

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

        db.onversionchange = function (event) {
          console.warn('The version of this database has changed, page will reload');
          db.close();
          return window.location.reload()
        };

        return resolve(db);
      };

      request.onerror = function (event) {
        fail(new AppError('Could not open IndexedDB database', {cause: event.target?.error}));
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

  perform: async function (storeName, transactionMode, callbacks, fName, ...fArgs) {
    const self = this;

    return new Promise(async function (resolve, reject) {
      const db = await self.open();

      const transaction = db.transaction(storeName, transactionMode);
      const store = transaction.objectStore(storeName);

      const request = store[fName](...fArgs);

      request.onerror = function (event) {
        callbacks.onerror ? callbacks.onerror(event) : reject(event);
      };

      if (callbacks.onsuccess) {
        // Cursor-style iteration (see list()): the caller's handler runs once per
        // cursor step and resolves the outer promise itself.
        request.onsuccess = callbacks.onsuccess;

      } else if (transactionMode === 'readwrite') {
        // Capture the request result (e.g. the generated key from add/put) on
        // success, but only resolve once the transaction has durably committed.
        // Note: in oncomplete, event.target is the transaction (its result is
        // undefined), so request.result is the only place to read the key.
        // Watchers fire after commit so they re-query committed data.
        let result;
        request.onsuccess = function () { result = request.result; };
        transaction.oncomplete = function () {
          resolve(result);
          self._notify([storeName]);
        };

      } else {
        request.onsuccess = function () { resolve(request.result); };
      }

      transaction.onabort = function () {
        reject(transaction.error || new Error('Transaction aborted'));
      };

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

    return new Promise(async function (resolve, reject) {
      const db = await self.open();

      // get + put run in one read-write transaction so the read-modify-write is
      // atomic. The put must be issued inside the get's onsuccess, while the
      // transaction is still active (it auto-commits if it goes idle).
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      let result;

      const getRequest = store.get(patchData.id);
      getRequest.onsuccess = function () {
        const obj = getRequest.result;
        if (!obj) return; // nothing to patch; transaction resolves with undefined

        for (const [key, val] of Object.entries(patchData)) {
          obj[key] = val;
        }

        const {valid, errors} = self.validate(storeName, obj);
        if (!valid) {
          reject(new AppError('Schema validation failed for ' + storeName, {storeName, errors}));
          transaction.abort();
          return;
        }

        const putRequest = store.put(obj);
        putRequest.onsuccess = function () { result = putRequest.result; };
      };

      transaction.oncomplete = function () {
        resolve(result);
        self._notify([storeName]);
      };

      transaction.onerror = transaction.onabort = function () {
        reject(transaction.error || new Error('Transaction aborted'));
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
    const self = this;
    const db = await self.open();

    return new Promise(function (resolve, reject) {
      const storeNames = [rootStore, ...Object.keys(relations)];
      const transaction = db.transaction(storeNames, 'readwrite');

      transaction.oncomplete = function () {
        resolve();
        // Watchers fire after commit so they re-query committed data (as in perform()).
        self._notify(storeNames);
      };

      transaction.onerror = transaction.onabort = function () {
        reject(transaction.error || new Error('Transaction aborted'));
      };

      try {
        transaction.objectStore(rootStore).delete(id);

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
      } catch (err) {
        // e.g. a relation names an index this database does not have. Abort, so that the root
        // delete issued above cannot commit on its own and leave the related rows behind.
        transaction.abort();
        reject(err);
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
    return new Promise(async function (resolve, reject) {
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

      })
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
