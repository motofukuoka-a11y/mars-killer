const CACHE_NAME = 'mars-killer-v6.0-stage7';
const CRITICAL_ASSETS = [
  './','./index.html','./app.js','./engine.js','./manifest.webmanifest',
  './ui/Version6RefundPanel.js','./ui/Version6RefundController.js',
  './services/v6/Version6Platform.js','./services/v6/CalculationServicesV6.js',
  './services/v6/PassengerRefundServicesV6.js','./services/v6/AccidentHandlingServicesV6.js',
  './services/v6/RuleResolverV6.js','./services/v6/ResultBuilderV6.js','./services/v6/ErrorHandlingV6.js',
  './validation/ValidationEngineV6.js','./engines/v6/BusinessEngineV6.js',
  './models/Version6Models.js','./debug/Version6Logging.js',
  './data/rules/refund_rules_v6.json','./data/rules/accident_rules_v6.json'
];
const OPTIONAL_ASSETS = [
  './styles.css','./icons/icon-192.png','./icons/icon-512.png',
  './engines/RouteEngine.js','./engines/FareEngine.js','./engines/ChargeEngine.js',
  './engines/ChangeEngine.js','./engines/RefundEngine.js','./engines/DiscountEngine.js',
  './engines/ValidationEngine.js','./engines/BusinessEngine.js',
  './shared/ErrorCodes.js','./shared/Constants.js','./shared/Utils.js','./shared/RuleResolver.js',
  './services/StationSearchIndex.js','./services/PracticalStorage.js','./services/DebugService.js',
  './services/PracticalOperationPlatform.js','./services/PassengerCalculationService.js',
  './services/PracticalValidationService.js','./services/PassengerRuleService.js','./services/PassengerModel.js',
  './services/SearchConditionAdapter.js','./services/SectionServiceManager.js',
  './ui/StationAutocomplete.js','./ui/Version51StateController.js'
];
const NETWORK_FIRST_TYPES = new Set(['document','script','style']);
const NETWORK_FIRST_EXTENSIONS = new Set(['.html','.js','.css','.json','.webmanifest']);
self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll(CRITICAL_ASSETS);
  await Promise.allSettled(OPTIONAL_ASSETS.map(asset=>cache.add(asset)));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message', event => {if(event.data?.type==='SKIP_WAITING') self.skipWaiting();});
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin) return;
  event.respondWith(shouldUseNetworkFirst(request)?networkFirst(request):cacheFirst(request));
});
function shouldUseNetworkFirst(request){if(NETWORK_FIRST_TYPES.has(request.destination))return true;const pathname=new URL(request.url).pathname;return [...NETWORK_FIRST_EXTENSIONS].some(ext=>pathname.endsWith(ext));}
async function networkFirst(request){const cache=await caches.open(CACHE_NAME);try{const response=await fetch(request,{cache:'no-store'});if(response?.ok)await cache.put(request,response.clone());return response;}catch(error){const cached=await cache.match(request);if(cached)return cached;if(request.mode==='navigate'){const fallback=await cache.match('./index.html');if(fallback)return fallback;}throw error;}}
async function cacheFirst(request){const cache=await caches.open(CACHE_NAME);const cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response?.ok)await cache.put(request,response.clone());return response;}
