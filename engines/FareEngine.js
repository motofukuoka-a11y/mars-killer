export default class FareEngine {
  constructor(source,specialFares=[]) {
    if(source?.getRecords){
      this.dataAccess=source;
      this.config=source.getMetadata('fare_master');
      const records=source.getRecords('fare_master');
      this.ordinaryFares=records.filter(r=>r.metadata?.fare_type==='ordinary');
      this.specialFares=records.filter(r=>r.metadata?.fare_type==='additional');
    }else{
      this.dataAccess=null;this.config={};
      this.ordinaryFares=(source||[]).map((x,i)=>({id:`LEGACY-${i}`,metadata:{
        fare_type:'ordinary',table_id:x.line_category,min_km:x.min_km,max_km:x.max_km,
        adult_yen:x.adult_one_way_fare_yen,child_yen:x.child_one_way_fare_yen}}));
      this.specialFares=(specialFares||[]).map(x=>({id:x.special_rule_id,name:x.name,metadata:{
        fare_type:'additional',adult_yen:x.adult_yen,child_yen:x.child_yen,trigger_segment:x.trigger_segment}}));
    }
  }
  ordinaryFare(route,passenger){
    const rules=this.config.route_table_rules||{
      trunk:{table_id:'trunk',distance_field:'business_km'},
      local:{table_id:'local',distance_field:'business_km'},
      mixed_short:{max_business_km:10,table_id:'local',distance_field:'business_km'},
      mixed:{table_id:'trunk',distance_field:'fare_calculation_km'}
    };
    let rule=rules[route.route_category];
    if(route.route_category==='mixed')rule=Math.ceil(route.business_km-1e-12)<=rules.mixed_short.max_business_km?
      rules.mixed_short:rules.mixed;
    const km=Math.ceil(Number(route[rule.distance_field])-1e-12);
    const row=this.ordinaryFares.find(r=>r.metadata.table_id===rule.table_id&&
      Number(r.metadata.min_km)<=km&&km<=Number(r.metadata.max_km));
    if(!row)throw new Error(`普通運賃マスターに ${rule.table_id}/${km}km がありません`);
    return{component:'ordinary_fare',name:'普通運賃',table:rule.table_id,lookup_km:km,
      amount_yen:Number(passenger==='adult'?row.metadata.adult_yen:row.metadata.child_yen),
      fare_record_id:row.id,discountable:true};
  }
  specialComponents(route,passenger){
    const traversed=new Set(route.segments.map(s=>[s.from_station_id,s.to_station_id].sort().join('|')));
    return this.specialFares.filter(r=>{
      const t=r.metadata.trigger_segment;
      return t&&traversed.has([t.station_a,t.station_b].sort().join('|'));
    }).map(r=>({component:'additional_fare',rule_id:r.id,name:r.name,
      amount_yen:Number(passenger==='adult'?r.metadata.adult_yen:r.metadata.child_yen),discountable:true}));
  }
  discounted(amount,rate,rounding){
    if(['discounted_fare_down_to_10','half_5_yen_fraction_discard'].includes(rounding))
      return Math.floor(amount*(1-rate)/10)*10;
    throw new Error(`未対応端数処理: ${rounding}`);
  }
}
