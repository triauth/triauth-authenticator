/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

export const SCHEMA = {
  VERSION: 7,

  'identities': {
    'id': {type: 'number', optional: true},

    'identifier': {
      type: 'string', match: (identifier) => {
        return Triauth.validate({identifier}).valid
      }
    },

    'lookupCode': {type: 'string', optional: true, match: (code) => Triauth.Helpers.isLookupCode(code)},

    'signers': {type: 'object', instance: Array},
    'signers.**': {optional: true},

    'publicProfile': {type: 'object', optional: true},
    'publicProfile.**': {optional: true},

    'whoisResponse': {type: 'object', optional: true},
    'whoisResponse.**': {optional: true},

    'whoisResponseUpdatedAt': {type: 'number', optional: true},

    'createdAt': {type: 'number'},
    'updatedAt': {type: 'number', optional: true}
  },

  'websites': {
    'id': {type: 'number', optional: true},

    'identityId': {type: 'number'},
    'baseUrl': {type: 'string'},

    // The site's self-description, as accepted by Helpers.sanitizeManifest (PROTOCOL.md §14.1)
    'manifest': {type: 'object', optional: true},
    'manifest.name': {type: 'string', optional: true},
    'manifest.startUrl': {type: 'string', optional: true},
    'manifest.iconUrl': {type: 'string', optional: true},

    // Captured website icon
    'icon': {type: 'object', optional: true},
    'icon.url': {type: 'string', optional: true},
    'icon.dataUrl': {type: 'string', optional: true},
    'icon.fetchedAt': {type: 'number', optional: true},

    'createdAt': {type: 'number'},
    'updatedAt': {type: 'number', optional: true},

    'lastLoginAt': {type: 'number', optional: true}
  },

  'tokens': {
    'id': {type: 'number', optional: true},

    'identityId': {type: 'number'},
    'websiteId': {type: 'number'},

    'baseUrl': {type: 'string'},
    'origin': {type: 'string'},

    'type': {type: 'string'},
    'value': {type: 'string'},

    'createdAt': {type: 'number'},
    'expiresAt': {type: 'number', optional: true},
    'response': {type: 'string', optional: true},
    'lastUsedAt': {type: 'number', optional: true}
  },

}

// Secondary indexes, declared here and reconciled idempotently by db.open() during
// every schema upgrade.
export const INDEXES = {

  'identities': [
    {name: 'identifier', keyPath: 'identifier', options: {unique: true}},
  ],

  'websites': [
    {name: 'identityId', keyPath: 'identityId'},
    {name: 'identityId_baseUrl', keyPath: ['identityId', 'baseUrl']},
  ],

  'tokens': [
    {name: 'identityId', keyPath: 'identityId'},
    {name: 'type_identityId_baseUrl', keyPath: ['type', 'identityId', 'baseUrl']},
    {name: 'websiteId', keyPath: 'websiteId'},
  ],

}

// Per-version DATA migrations.
//
// Contract: MIGRATIONS[v] = function ({db, transaction, oldVersion}, done) - plain
// continuation-passing, never async. Awaiting any external promise deactivates the
// versionchange transaction, so all work must go through IDB request callbacks of
// `transaction` itself; call done() synchronously or from the terminal callback of the
// migration's own request, so a later migration always sees this one's completed writes.
//
// If the versionchange transaction aborts, IndexedDB rolls the whole database back to
// its previous version with data intact - a failed migration means the app cannot open
// until the code is fixed, never data loss.
export const MIGRATIONS = {

  // The private profile is no longer supported: drop it from the identities, and drop the websites' permissions,
  // which only held the grants to read it
  7: function ({transaction}, done) {
    const strip = function (storeName, key, next) {
      const request = transaction.objectStore(storeName).openCursor();
      request.onsuccess = function () {
        const cursor = request.result;
        if (!cursor) return next();

        const value = cursor.value;
        if (key in value) {
          delete value[key];
          cursor.update(value);
        }
        cursor.continue();
      };
    };

    strip('identities', 'privateProfile', () => strip('websites', 'permissions', done));
  },

}
