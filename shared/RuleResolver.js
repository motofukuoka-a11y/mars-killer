import { ErrorCodes } from './ErrorCodes.js';

const MASTER_FILES = Object.freeze({
  business_regulation_master:
    'business_regulation_master.json',
  station_group_master:
    'station_group_master.json',
  route_rule_master:
    'route_rule_master.json',
  validity_rule_master:
    'validity_rule_master.json',
  company_master: 'company_master.json',
  line_master: 'line_master.json',
  station_master: 'station_master.json',
  distance_master: 'distance_master.json',
  fare_master: 'fare_master.json',
  charge_master: 'charge_master.json'
});

export default class RuleResolver {
  constructor({masters={},datasets={},validationEngine=null}={}) {
    this.masters=masters;
    this.datasets=datasets;
    this.validationEngine=validationEngine;
    this.cache=new Map();
  }

  static async load(base='./data',fetcher=fetch,validationEngine=null) {
    const entries=await Promise.all(Object.entries(MASTER_FILES).map(async([key,file])=>{
      const response=await fetcher(`${base}/master/${file}`);
      if(!response.ok){
        const e=new Error(`${file} の読込みに失敗しました。`);
        e.code=ErrorCodes.MASTER_MISSING;
        e.details={master:key,file_name:file,status:response.status};
        throw e;
      }
      return [key,await response.json()];
    }));
    return new RuleResolver({masters:Object.fromEntries(entries),validationEngine});
  }

  validate() {
    return this.validationEngine
      ? this.validationEngine.validate({
          type:'railway_master_database',
          masters:this.masters,
          datasets:this.datasets,
          resolved:{
            companies:this.getRecords('company_master'),
            lines:this.getRecords('line_master'),
            stations:this.getRecords('station_master'),
            distances:this.getRecords('distance_master')
          }
        })
      : {valid:true,error_code:null,message:null,details:{}};
  }

  getMaster(name) {
    const master=this.masters[name];
    if(!master){
      const e=new Error(`マスターが不足しています: ${name}`);
      e.code=ErrorCodes.MASTER_MISSING;
      throw e;
    }
    return master;
  }

  getMetadata(name) {
    return this.getMaster(name).metadata||{};
  }

  getRecords(name,{enabledOnly=true}={}) {
    const key=`${name}:${enabledOnly}`;
    if(this.cache.has(key)) return this.cache.get(key);
    const master=this.getMaster(name);
    let records=[...(master.records||[])];
    for(const source of master.metadata?.sources||[]){
      const rows=this.datasets[source.data_key]||[];
      records.push(...rows.map((row,index)=>this.normalizeSourceRecord(row,index,source)));
    }
    if(enabledOnly) records=records.filter(r=>r.enabled!==false);
    records.sort((a,b)=>(a.priority||0)-(b.priority||0));
    this.cache.set(key,records);
    return records;
  }

  getRecord(name,id) {
    return this.getRecords(name).find(r=>r.id===id)||null;
  }

  findRecords(name,predicate) {
    return this.getRecords(name).filter(predicate);
  }

  normalizeSourceRecord(row,index,source) {
    const get=(obj,path)=>path.split('.').reduce((v,k)=>v?.[k],obj);
    const set=(obj,path,value)=>{
      const parts=path.split('.');
      let target=obj;
      for(const p of parts.slice(0,-1)) target=target[p]||(target[p]={});
      target[parts.at(-1)]=value;
    };
    const template=(text)=>String(text||'').replace(/\{([^}]+)\}/g,(_,field)=>get(row,field)??'');
    const id=source.record_id_field?row[source.record_id_field]:
      source.record_id_template?template(source.record_id_template):`LEGACY-${index}`;
    const name=source.name_field?row[source.name_field]:
      source.name_template?template(source.name_template):String(id);
    const result={
      id:String(id),enabled:true,name:String(name),
      description:source.description||'既存JSONから移行されたレコード。',
      conditions:{},references:[],
      metadata:{...(source.defaults||{})},priority:source.priority||0
    };
    for(const [from,to] of Object.entries(source.field_map||{})){
      let value=get(row,from);
      const map=source.value_maps?.[to];
      if(map&&Object.prototype.hasOwnProperty.call(map,value)) value=map[value];
      set(result,to,value);
    }
    result.id=String(result.id);
    result.name=String(result.name);
    return result;
  }

  resolveRailwayContext(route,{debugMode=false}={}) {
    if(!route) return {companies:[],lines:[],stations:[],distances:[],referenced_masters:[]};
    const stationIds=[route.start_station_id,route.goal_station_id,
      ...(route.segments||[]).flatMap(s=>[s.from_station_id,s.to_station_id])].filter(Boolean);
    const lineIds=[...(route.segments||[]).map(s=>s.line_id).filter(Boolean)];
    const distanceIds=[...(route.segments||[]).map(s=>s.segment_id).filter(Boolean)];
    const stations=[...new Set(stationIds)].map(id=>this.getRecord('station_master',id)).filter(Boolean);
    const lines=[...new Set(lineIds)].map(id=>this.getRecord('line_master',id)).filter(Boolean);
    const distances=[...new Set(distanceIds)].map(id=>this.getRecord('distance_master',id)).filter(Boolean);
    const companyIds=[...new Set([
      ...stations.map(s=>s.metadata?.company_id),
      ...lines.map(l=>l.metadata?.company_id)
    ].filter(Boolean))];
    const companies=companyIds.map(id=>this.getRecord('company_master',id)).filter(Boolean);
    const result={
      companies:companies.map(x=>({id:x.id,name:x.name})),
      lines:lines.map(x=>({id:x.id,name:x.name})),
      stations:stations.map(x=>({id:x.id,name:x.name})),
      distances:distances.map(x=>({
        id:x.id,business_km:x.metadata?.business_km,
        conversion_km:x.metadata?.conversion_km,
        fare_calculation_km:x.metadata?.fare_calculation_km
      })),
      totals:{
        business_km:route.business_km,
        conversion_km:route.conversion_km,
        fare_calculation_km:route.fare_calculation_km
      },
      referenced_masters:['company_master','line_master','station_master','distance_master']
    };
    if(debugMode) result.reference_json=result.referenced_masters.map(m=>`data/master/${MASTER_FILES[m]}`);
    return result;
  }

  resolve(args={}) {
    const validation=this.validate();
    if(!validation.valid) return validation;
    const central=this.getMaster('business_regulation_master');
    const context=this.createBusinessContext(args);
    const resolved=[];
    for(const ref of central.references||[]){
      if(!['station_group_master','route_rule_master','validity_rule_master'].includes(ref.master)) continue;
      const rule=this.getRecord(ref.master,ref.id);
      if(rule) resolved.push({rule,masterName:ref.master});
    }
    resolved.sort((a,b)=>(a.rule.priority||0)-(b.rule.priority||0));
    const regulations={},details=[],calculation=[];
    for(const {rule,masterName} of resolved){
      const c=rule.conditions||{};
      const missing=(c.required_fields||[]).filter(f=>context[f]==null||context[f]==='');
      const applicable=missing.length?false:this.evaluateGroup(c,context);
      const reason=missing.length?c.missing_input_reason:
        applicable?c.applicable_reason:c.not_applicable_reason;
      const value=!missing.length&&c.calculation?this.calculateValue(c.calculation,context):null;
      const key=c.result_key||rule.id.toLowerCase();
      regulations[key]=applicable;
      const detail={regulation_id:rule.id,key,name:rule.name,description:rule.description,
        applicable,reason,priority:rule.priority,referenced_master:masterName,
        missing_fields:missing,calculated_value:value};
      if(args.input?.debugMode) detail.reference_json=`data/master/${MASTER_FILES[masterName]}`;
      details.push(detail);
      calculation.push({engine:'RuleResolver',type:'regulation',regulation_id:rule.id,
        applicable,reason,priority:rule.priority,referenced_master:masterName,calculated_value:value});
    }
    const railway=this.resolveRailwayContext(this.findRoute(args.operationResult?.details),{
      debugMode:Boolean(args.input?.debugMode)
    });
    return {valid:true,regulations,details,calculation,
      referenced_masters:[...new Set([...details.map(x=>x.referenced_master),...railway.referenced_masters])],
      railway,error_code:null,message:null};
  }

  createBusinessContext({input={},businessState={},operationResult={},validatedDates={}}={}) {
    const route=this.findRoute(operationResult.details);
    return {
      business_km:input.businessKm??route?.business_km??null,
      fare_calculation_km:input.fareCalculationKm??route?.fare_calculation_km??route?.business_km??null,
      request_date:input.requestDate,ticket_start_date:input.ticketStartDate||input.requestDate,
      ticket_end_date:input.ticketEndDate||input.requestDate,ticket_type:input.ticketType,
      ticket_usage_type:input.ticketUsageType,departure_status:input.departureStatus,
      before_use:businessState.before_use,in_valid_period:businessState.in_valid_period,
      expired:businessState.expired,
      specific_city_zone_applicable:input.regulationContext?.specificCityZoneApplicable,
      specific_route_section_applicable:input.regulationContext?.specificRouteSectionApplicable,
      outside_section_ride_applicable:input.regulationContext?.outsideSectionRideApplicable,
      selected_route_applicable:input.regulationContext?.selectedRouteApplicable,
      turnback_ride_applicable:input.regulationContext?.turnbackRideApplicable,
      metropolitan_suburban_area_only:input.regulationContext?.metropolitanSuburbanAreaOnly,
      stopover_restricted:input.regulationContext?.stopoverRestricted,
      validated_request_date:validatedDates.requestDate,
      validated_start_date:validatedDates.startDate,validated_end_date:validatedDates.endDate
    };
  }

  findRoute(value) {
    if(!value||typeof value!=='object') return null;
    if(value.route&&typeof value.route==='object') return value.route;
    if(value.original_quote?.route) return value.original_quote.route;
    for(const child of Object.values(value)){const found=this.findRoute(child);if(found)return found;}
    return null;
  }

  evaluateGroup(group,context) {
    if(Array.isArray(group.all)) return group.all.every(x=>this.evaluateCondition(x,context));
    if(Array.isArray(group.any)) return group.any.some(x=>this.evaluateCondition(x,context));
    return true;
  }

  evaluateCondition(c,context) {
    const a=context[c.field],e=c.reference_field?context[c.reference_field]:c.value;
    const ops={
      equals:()=>a===e,not_equals:()=>a!==e,
      greater_than:()=>Number(a)>Number(e),greater_than_or_equal:()=>Number(a)>=Number(e),
      less_than:()=>Number(a)<Number(e),less_than_or_equal:()=>Number(a)<=Number(e),
      includes:()=>Array.isArray(e)&&e.includes(a),
      date_on_or_after:()=>new Date(`${a}T00:00:00`)>=new Date(`${e}T00:00:00`),
      date_on_or_before:()=>new Date(`${a}T00:00:00`)<=new Date(`${e}T00:00:00`)
    };
    if(!ops[c.operator]){const err=new Error(`未対応の演算子です: ${c.operator}`);
      err.code=ErrorCodes.UNSUPPORTED_OPERATION;throw err;}
    return ops[c.operator]();
  }

  calculateValue(c,context) {
    if(c.type!=='valid_days_by_business_km') return null;
    const km=Number(context.business_km);
    if(km<=c.same_day_max_km)return{valid_days:1,required_end_date:context.ticket_start_date};
    return{valid_days:c.base_days+Math.ceil(Math.max(0,km-c.base_max_km)/c.additional_km_unit)
      *c.additional_days_per_unit,required_end_date:null};
  }
}
