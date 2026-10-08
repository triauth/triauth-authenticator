/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

// Domain-name policy shared by the setup wizard and the request parser (helpers.js).

// Sortlist of registries that sell names one level below the TLD
export const SECOND_LEVEL_SUFFIXES = [
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.br', 'net.br', 'org.br',
  'com.au', 'net.au', 'org.au', 'id.au',
  'co.za', 'org.za', 'net.za', 'web.za',
  'com.tr', 'net.tr', 'org.tr', 'gen.tr', 'web.tr',
  'com.mx', 'org.mx', 'net.mx',
  'co.kr', 'or.kr', 'ne.kr', 'pe.kr',
  'com.ar', 'net.ar', 'org.ar',
  'co.nz', 'net.nz', 'org.nz', 'geek.nz', 'gen.nz', 'kiwi.nz',
  'my.id', 'co.id', 'web.id', 'biz.id', 'or.id',
  'co.jp', 'ne.jp', 'or.jp', 'gr.jp',
  'com.pl', 'net.pl', 'org.pl', 'biz.pl', 'info.pl',
  'co.il', 'org.il', 'net.il',
  'com.ua', 'net.ua', 'org.ua', 'in.ua',
  'com.cn', 'net.cn', 'org.cn',
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in',
  'com.tw', 'net.tw', 'org.tw', 'idv.tw',
  'com.vn', 'net.vn', 'org.vn',
  'co.th', 'in.th', 'or.th',
  'com.my', 'net.my', 'org.my', 'com.sg', 'net.sg', 'org.sg', 'per.sg', 'com.hk', 'net.hk', 'org.hk', 'idv.hk', 'com.ph',
  'co.ke', 'or.ke', 'com.ng', 'org.ng', 'net.ng', 'com.eg', 'com.sa', 'com.pk', 'com.bd', 'com.np', 'com.kh',
  'com.co', 'com.pe', 'com.ec', 'com.uy', 'com.ve', 'com.do', 'com.gt', 'co.cr', 'com.bo', 'com.py'
];
export const isRegistrable = (domain) => {
  const parent = domain.split('.').slice(1).join('.');
  return !parent.includes('.') || SECOND_LEVEL_SUFFIXES.includes(parent);
};

// Domains of the largest consumer mail providers, worldwide and by region
export const MAIL_PROVIDER_DOMAINS = [
  // Worldwide
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'yahoo.com', 'ymail.com', 'aol.com', 'mail.com',
  'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me', 'tuta.io', 'tutanota.com',
  // United States
  'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net', 'bellsouth.net', 'cox.net', 'charter.net',
  // United Kingdom, Ireland
  'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net', 'ntlworld.com',
  'hotmail.co.uk', 'live.co.uk', 'yahoo.co.uk',
  'eircom.net',
  // France, Belgium, Netherlands
  'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'hotmail.fr', 'live.fr', 'outlook.fr', 'yahoo.fr', 'gmx.fr',
  'telenet.be', 'skynet.be', 'hotmail.be', 'live.be',
  'ziggo.nl', 'kpnmail.nl', 'planet.nl', 'home.nl', 'hotmail.nl', 'live.nl',
  // Germany, Austria, Switzerland
  'gmx.de', 'gmx.net', 'gmx.com', 'web.de', 't-online.de', 'freenet.de', 'hotmail.de', 'live.de', 'outlook.de', 'yahoo.de',
  'gmx.at', 'aon.at',
  'bluewin.ch', 'gmx.ch',
  // Southern Europe
  'libero.it', 'virgilio.it', 'alice.it', 'tiscali.it', 'hotmail.it', 'live.it', 'outlook.it', 'yahoo.it',
  'hotmail.es', 'outlook.es', 'yahoo.es',
  'sapo.pt',
  'otenet.gr', 'yahoo.gr',
  // Nordic countries
  'telia.com', 'hotmail.se', 'live.se',
  'online.no', 'hotmail.no', 'live.no',
  'hotmail.dk', 'live.dk',
  // Central and Eastern Europe
  'wp.pl', 'o2.pl', 'interia.pl', 'onet.pl',
  'seznam.cz', 'email.cz', 'centrum.cz',
  'azet.sk', 'centrum.sk', 'zoznam.sk',
  'freemail.hu', 'citromail.hu',
  'siol.net',
  'abv.bg', 'mail.bg',
  'hot.ee', 'inbox.lv', 'inbox.lt',
  'ukr.net', 'i.ua',
  'mail.ru', 'yandex.ru',
  // Asia
  'qq.com', 'foxmail.com', '163.com', '126.com', 'yeah.net', 'sina.com', 'sohu.com', '139.com',
  'yahoo.co.jp', 'docomo.ne.jp', 'ezweb.ne.jp', 'au.com', 'softbank.ne.jp', 'i.softbank.jp', 'hotmail.co.jp',
  'naver.com', 'daum.net', 'hanmail.net', 'nate.com', 'kakao.com',
  'rediffmail.com', 'yahoo.co.in', 'yahoo.in',
  'yahoo.com.tw', 'yahoo.com.hk', 'yahoo.co.id', 'yahoo.com.ph'
];

// The identifier domains this instance serves.
// Operator setting injected at build time:
//
//   VITE_SERVED_DOMAINS=example.com               an entry covers the domain and everything under it,
//                                                 here john@example.com and john@sales.example.com
//   VITE_SERVED_DOMAINS=example.com example.org   several entries, separated by spaces or commas
//   VITE_SERVED_DOMAINS=*                         every domain; the reference instance sets this
//
// Unset, the instance serves the domain it lives under (auth.example.com serves example.com)
// A host that is itself a registrable domain serves itself rather than its public suffix.
// Development hosts (localhost, IP literals) serve everything.
//
// Identifiers under any other domain are refused by the wizard and by every flow page: the keys live under
// this origin, so whoever runs it is the custodian of every identity it serves.

export const parseServedDomains = (value) => {
  const entries = [];
  for (const entry of String(value || '').toLowerCase().split(/[\s,]+/)) {
    if (!entry) continue;
    if (entry === '*' || Triauth.Helpers.isDomainName(entry)) entries.push(entry);
    else console.warn(`Ignoring configured served domain that is not a domain name: ${entry}`);
  }
  return entries;
};

export const defaultServedDomains = (hostname) => {
  if (!Triauth.Helpers.isDomainName(hostname)) return ['*'];
  return [isRegistrable(hostname) ? hostname : hostname.split('.').slice(1).join('.')];
};

export const SERVED_DOMAINS = (() => {
  const configured = parseServedDomains(import.meta.env.VITE_SERVED_DOMAINS);
  return configured.length ? configured : defaultServedDomains(window.location.hostname);
})();

export const servesDomain = (domain) => {
  domain = String(domain || '').toLowerCase();
  return SERVED_DOMAINS.some((entry) => entry === '*' || domain === entry || domain.endsWith('.' + entry));
};

export const NOT_SERVED_MESSAGE = `This authenticator only serves identifiers under ${SERVED_DOMAINS.join(', ')}`;
