const CACHE_NAME = 'mars-killer-v4.1.2';

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./engine.js",
  "./manifest.webmanifest",
  "./engines/RouteEngine.js",
  "./engines/FareEngine.js",
  "./engines/ChargeEngine.js",
  "./engines/ChangeEngine.js",
  "./engines/RefundEngine.js",
  "./engines/DiscountEngine.js",
  "./engines/ValidationEngine.js",
  "./engines/BusinessEngine.js",
  "./shared/ErrorCodes.js",
  "./shared/Constants.js",
  "./shared/Utils.js",
  "./shared/RuleResolver.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./data/distance/junctions.json",
  "./data/distance/lines.json",
  "./data/distance/sections.json",
  "./data/distance/segments.json",
  "./data/distance/station_distances.json",
  "./data/distance/stations.json",
  "./data/distance/validation_report.json",
  "./data/fare/fare_rules.json",
  "./data/fare/ordinary_fares.json",
  "./data/rules/charge_season_adjustments.json",
  "./data/rules/change_rules.json",
  "./data/rules/business_rules.json",
  "./data/rules/discount_rules.json",
  "./data/rules/distance_charge_tables.json",
  "./data/rules/fixed_components.json",
  "./data/rules/otoku_products.json",
  "./data/rules/refund_rules.json",
  "./data/rules/sources.json",
  "./data/rules/special_fares.json",
  "./data/rules/train_product_charges.json",
  "./data/rules/transaction_rules.json",
  "./data/master/business_regulation_master.json",
  "./data/master/station_group_master.json",
  "./data/master/route_rule_master.json",
  "./data/master/validity_rule_master.json",
  "./data/master/company_master.json",
  "./data/master/line_master.json",
  "./data/master/station_master.json",
  "./data/master/distance_master.json",
  "./data/master/fare_master.json",
  "./data/master/charge_master.json"
];

const NETWORK_FIRST_TYPES = new Set([
  'document',
  'script',
  'style'
]);

const NETWORK_FIRST_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.css',
  '.json',
  '.webmanifest'
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache =>
        cache.addAll(PRECACHE_ASSETS)
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key =>
              key !== CACHE_NAME
            )
            .map(key =>
              caches.delete(key)
            )
        )
      )
      .then(() =>
        self.clients.claim()
      )
  );
});

self.addEventListener('message', event => {
  if (
    event.data?.type ===
    'SKIP_WAITING'
  ) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (
    request.method !== 'GET' ||
    new URL(request.url).origin !==
      self.location.origin
  ) {
    return;
  }

  if (shouldUseNetworkFirst(request)) {
    event.respondWith(
      networkFirst(request)
    );
    return;
  }

  event.respondWith(
    cacheFirst(request)
  );
});

function shouldUseNetworkFirst(request) {
  if (
    NETWORK_FIRST_TYPES.has(
      request.destination
    )
  ) {
    return true;
  }

  const pathname =
    new URL(request.url).pathname;

  return [
    ...NETWORK_FIRST_EXTENSIONS
  ].some(extension =>
    pathname.endsWith(extension)
  );
}

async function networkFirst(request) {
  const cache =
    await caches.open(CACHE_NAME);

  try {
    const response = await fetch(
      request,
      {
        cache: 'no-store'
      }
    );

    if (
      response &&
      response.ok
    ) {
      await cache.put(
        request,
        response.clone()
      );
    }

    return response;
  } catch (error) {
    const cached =
      await cache.match(request);

    if (cached) {
      return cached;
    }

    if (
      request.mode === 'navigate'
    ) {
      const fallback =
        await cache.match(
          './index.html'
        );

      if (fallback) {
        return fallback;
      }
    }

    throw error;
  }
}

async function cacheFirst(request) {
  const cache =
    await caches.open(CACHE_NAME);

  const cached =
    await cache.match(request);

  if (cached) {
    return cached;
  }

  const response =
    await fetch(request);

  if (
    response &&
    response.ok
  ) {
    await cache.put(
      request,
      response.clone()
    );
  }

  return response;
}
