/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "6327a00c17388c2b61344306cc2ecd33"
  }, {
    "url": "pwa-512x512.png",
    "revision": "66df961140519cffa3bbea4534062db2"
  }, {
    "url": "pwa-192x192.png",
    "revision": "cb2c73f1786e40228df88ca9458d1497"
  }, {
    "url": "index.html",
    "revision": "8911fb7de52e90c3dd894ab57e93d4a2"
  }, {
    "url": "icon.svg",
    "revision": "a1efd4239e5f6438450530eaf1628412"
  }, {
    "url": "beat-the-rhythm.html",
    "revision": "8f92c191303532a16b2f0763a2ee01fe"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "02c5f98edda645eaa0d66a4da288290b"
  }, {
    "url": "assets/index-BiWfUxxf.css",
    "revision": null
  }, {
    "url": "assets/index-BWFMkYHY.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "02c5f98edda645eaa0d66a4da288290b"
  }, {
    "url": "icon.svg",
    "revision": "a1efd4239e5f6438450530eaf1628412"
  }, {
    "url": "pwa-192x192.png",
    "revision": "cb2c73f1786e40228df88ca9458d1497"
  }, {
    "url": "pwa-512x512.png",
    "revision": "66df961140519cffa3bbea4534062db2"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "6327a00c17388c2b61344306cc2ecd33"
  }, {
    "url": "manifest.webmanifest",
    "revision": "02c208c620e5346c92e4e129ab82dc82"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/beat-the-rhythm\.html$/]
  }));

}));
