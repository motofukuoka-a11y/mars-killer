export class SalesEngine {
  constructor(data) {
    Object.assign(this, data);
    this.stationById = new Map(this.stations.map(s => [s.station_id, s]));
    this.idsByName = new Map();
    for (const s of this.stations) {
      if (!this.idsByName.has(s.station_name)) this.idsByName.set(s.station_name, []);
      this.idsByName.get(s.station_name).push(s.station_id);
    }
    this.graph = new Map();
    const add = (a,b,e) => { if(!this.graph.has(a)) this.graph.set(a,[]); this.graph.get(a).push({to:b,e}); };
    for (const e of this.segments) { add(e.from_station_id,e.to_station_id,e); add(e.to_station_id,e.from_station_id,e); }
  }
  static async load(base='./data') {
    const get = async p => { const r=await fetch(`${base}/${p}`); if(!r.ok) throw new Error(`${p} の読込みに失敗しました`); return r.json(); };
    const [stations,segments,ordinaryFares,chargeTables,productCharges,discountRules,refundRules,specialFares] = await Promise.all([
      get('distance/stations.json'),get('distance/segments.json'),get('fare/ordinary_fares.json'),
      get('rules/distance_charge_tables.json'),get('rules/train_product_charges.json'),
      get('rules/discount_rules.json'),get('rules/refund_rules.json'),get('rules/special_fares.json')
    ]);
    return new SalesEngine({stations,segments,ordinaryFares,chargeTables,productCharges,discountRules,refundRules,specialFares});
  }
  resolveStation(value) {
    const v=(value||'').trim();
    if(this.stationById.has(v)) return v;
    const matches=this.idsByName.get(v)||[];
    if(matches.length===1) return matches[0];
    if(!matches.length) throw new Error(`駅が見つかりません: ${v}`);
    throw new Error(`同名駅が複数あります: ${v}`);
  }
  shortestLeg(start,goal) {
    const dist=new Map([[start,0]]), prev=new Map(), done=new Set();
    const pq=[[0,start]];
    while(pq.length){
      pq.sort((a,b)=>a[0]-b[0]); const [d,u]=pq.shift();
      if(done.has(u)) continue; done.add(u); if(u===goal) break;
      for(const {to,e} of (this.graph.get(u)||[])){
        const nd=Math.round((d+Number(e.business_km))*1e10)/1e10;
        if(nd < (dist.get(to) ?? Infinity)){dist.set(to,nd);prev.set(to,{u,e});pq.push([nd,to]);}
      }
    }
    if(!dist.has(goal)) throw new Error('経路が見つかりません');
    const legs=[]; let u=goal;
    while(u!==start){const x=prev.get(u);if(!x)throw new Error('経路復元に失敗しました');legs.push({from:x.u,to:u,e:x.e});u=x.u;}
    return legs.reverse();
  }
  route(start,goal,via=[]) {
    const points=[this.resolveStation(start),...via.filter(Boolean).map(x=>this.resolveStation(x)),this.resolveStation(goal)];
    const legs=[]; for(let i=0;i<points.length-1;i++) legs.push(...this.shortestLeg(points[i],points[i+1]));
    return this.summarizeRoute(points[0],points.at(-1),legs,via);
  }
  summarizeRoute(startId,goalId,legs,via){
    let business=0,conversion=0,fareCalc=0; const categories=new Set(); const rows=[];
    for(const {from,to,e} of legs){business+=Number(e.business_km);conversion+=Number(e.conversion_km);fareCalc+=Number(e.fare_calculation_km);categories.add(e.line_category);rows.push({
      from_station_id:from,from_station_name:this.stationById.get(from).station_name,to_station_id:to,to_station_name:this.stationById.get(to).station_name,
      line_id:e.line_id,line_name:e.line_name,line_category:e.line_category,business_km:e.business_km,conversion_km:e.conversion_km,fare_calculation_km:e.fare_calculation_km,segment_id:e.segment_id});}
    let routeCategory,lookupDistance;
    if(categories.size===1&&categories.has('幹線')){routeCategory='trunk';lookupDistance=business;}
    else if(categories.size===1&&categories.has('地方交通線')){routeCategory='local';lookupDistance=business;}
    else{routeCategory='mixed';lookupDistance=Math.ceil(business-1e-12)<=10?business:fareCalc;}
    return {start_station_id:startId,start_station_name:this.stationById.get(startId).station_name,goal_station_id:goalId,goal_station_name:this.stationById.get(goalId).station_name,via,
      route_category:routeCategory,business_km:Number(business.toFixed(1)),conversion_km:Number(conversion.toFixed(1)),fare_calculation_km:Number(fareCalc.toFixed(1)),ordinary_fare_lookup_km:Math.ceil(lookupDistance-1e-12),segments:rows};
  }
  ordinaryFare(route,passenger){
    let table,km;if(route.route_category==='trunk'){table='trunk';km=Math.ceil(route.business_km-1e-12);}else if(route.route_category==='local'){table='local';km=Math.ceil(route.business_km-1e-12);}else if(Math.ceil(route.business_km-1e-12)<=10){table='local';km=Math.ceil(route.business_km-1e-12);}else{table='trunk';km=Math.ceil(route.fare_calculation_km-1e-12);}
    const row=this.ordinaryFares.find(r=>r.line_category===table&&r.min_km<=km&&km<=r.max_km);if(!row)throw new Error(`普通運賃表に ${table}/${km}km がありません`);
    return {component:'ordinary_fare',name:'普通運賃',table,lookup_km:km,amount_yen:Number(passenger==='adult'?row.adult_one_way_fare_yen:row.child_one_way_fare_yen),discountable:true};
  }
  specialComponents(route,passenger){
    const traversed=new Set(route.segments.map(x=>[x.from_station_id,x.to_station_id].sort().join('|'))),result=[];
    for(const r of this.specialFares){const key=[r.trigger_segment.station_a,r.trigger_segment.station_b].sort().join('|');if(traversed.has(key))result.push({component:'additional_fare',rule_id:r.special_rule_id,name:r.name,amount_yen:Number(passenger==='adult'?r.adult_yen:r.child_yen),discountable:true});}
    return result;
  }
  distanceCharge(tableId,km,passenger){const k=Math.ceil(km-1e-12),r=this.chargeTables.find(x=>x.table_id===tableId&&x.min_km<=k&&k<=x.max_km);if(!r)throw new Error(`料金表に該当なし: ${tableId}/${k}km`);return {component:r.component,name:this.tableName(tableId),table_id:tableId,lookup_km:k,amount_yen:Number(passenger==='adult'?r.adult_yen:r.child_yen),discountable:r.component==='ordinary_express'};}
  tableName(id){return ({JRH_HOKKAIDO_SPECIAL_RESERVED:'在来線特急指定席（道内特例）',JRH_A_EXPRESS_RESERVED:'A特急指定席',JRH_A_EXPRESS_UNRESERVED:'A特急自由席',JRH_ORDINARY_EXPRESS:'急行料金',JRH_GREEN_EXPRESS:'グリーン料金',JRH_GRANCLASS_A_HOKKAIDO:'グランクラスA',JRH_GRANCLASS_B_HOKKAIDO:'グランクラスB'})[id]||id;}
  productCharge(productId,travelDate,passenger){const d=new Date(`${travelDate}T00:00:00`);const r=this.productCharges.find(x=>x.product_id===productId&&(!x.effective_from||d>=new Date(`${x.effective_from}T00:00:00`))&&(!x.effective_to||d<=new Date(`${x.effective_to}T23:59:59`)));if(!r)throw new Error(`商品がないか適用期間外です: ${productId}`);return {component:r.component,product_id:productId,name:r.name,amount_yen:Number(passenger==='adult'?r.adult_yen:r.child_yen),discountable:false};}
  discounted(amount,rate,rounding){if(['discounted_fare_down_to_10','half_5_yen_fraction_discard'].includes(rounding))return Math.floor(amount*(1-rate)/10)*10;throw new Error(`未対応端数処理: ${rounding}`);}
  quote({start,goal,via=[],passenger='adult',travelDate='2026-07-18',chargeTableId=null,productId=null,discountId=null}){
    if(!['adult','child'].includes(passenger))throw new Error('旅客区分が不正です');const route=this.route(start,goal,via);const components=[this.ordinaryFare(route,passenger),...this.specialComponents(route,passenger)];if(chargeTableId)components.push(this.distanceCharge(chargeTableId,route.business_km,passenger));if(productId)components.push(this.productCharge(productId,travelDate,passenger));const subtotal=components.reduce((a,c)=>a+c.amount_yen,0);let discountDetail=null;
    if(discountId){const rule=this.discountRules.find(r=>r.discount_id===discountId);if(!rule)throw new Error(`割引ルールなし: ${discountId}`);if(rule.rate==null)throw new Error(`${discountId} は商品別または設定依存です`);if(rule.distance_condition==='business_km>100'&&!(route.business_km>100))throw new Error('割引の距離条件を満たしません');const applied=[];for(const c of components){if(rule.targets.includes(c.component)&&c.discountable){const before=c.amount_yen;c.pre_discount_yen=before;c.amount_yen=this.discounted(before,Number(rule.rate),rule.rounding);applied.push({component:c.component,before,after:c.amount_yen});}}discountDetail={discount_id:discountId,applied};}
    const total=components.reduce((a,c)=>a+c.amount_yen,0);return {ticket_type:'one_way',route,passenger,travel_date:travelDate,components,subtotal_before_discount_yen:subtotal,discount_yen:subtotal-total,discount_detail:discountDetail,total_yen:total,warnings:['自動経路は営業キロ最短です。経路特例・選択乗車等がある場合は経由駅を指定してください。','列車の停車駅・運転日・空席は時刻表または発売画面で別途確認してください。']};
  }
  refundFee(ruleId,price){const r=this.refundRules.find(x=>x.rule_id===ruleId);if(!r)throw new Error(ruleId);return r.mode==='fixed'?Number(r.value):Math.max(Math.floor(price*Number(r.value)),Number(r.minimum));}
}
