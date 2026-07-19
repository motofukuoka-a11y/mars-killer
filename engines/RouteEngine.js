export default class RouteEngine {
  constructor(source,segments=null) {
    if(source?.getRecords){
      this.dataAccess=source;
      this.stations=source.getRecords('station_master').map(r=>({
        station_id:r.id,station_name:r.name,...r.metadata
      }));
      this.segments=source.getRecords('distance_master').map(r=>({
        segment_id:r.id,...r.metadata
      }));
    } else {
      this.dataAccess=null;
      this.stations=source||[];
      this.segments=segments||[];
    }
    this.stationById=new Map(this.stations.map(s=>[s.station_id,s]));
    this.idsByName=new Map();
    for(const s of this.stations){
      if(!this.idsByName.has(s.station_name))this.idsByName.set(s.station_name,[]);
      this.idsByName.get(s.station_name).push(s.station_id);
    }
    this.graph=new Map();
    const add=(a,b,e)=>{if(!this.graph.has(a))this.graph.set(a,[]);this.graph.get(a).push({to:b,e});};
    for(const e of this.segments){add(e.from_station_id,e.to_station_id,e);add(e.to_station_id,e.from_station_id,e);}
  }
  resolveStation(value){
    const v=(value||'').trim();
    if(this.stationById.has(v))return v;
    const matches=this.idsByName.get(v)||[];
    if(matches.length===1)return matches[0];
    if(!matches.length)throw new Error(`駅が見つかりません: ${v}`);
    throw new Error(`同名駅が複数あります: ${v}`);
  }
  shortestLeg(start,goal){
    const dist=new Map([[start,0]]),prev=new Map(),done=new Set(),pq=[[0,start]];
    while(pq.length){pq.sort((a,b)=>a[0]-b[0]);const[d,u]=pq.shift();if(done.has(u))continue;
      done.add(u);if(u===goal)break;
      for(const{to,e}of this.graph.get(u)||[]){const nd=Math.round((d+Number(e.business_km))*1e10)/1e10;
        if(nd<(dist.get(to)??Infinity)){dist.set(to,nd);prev.set(to,{u,e});pq.push([nd,to]);}}}
    if(!dist.has(goal))throw new Error('経路が見つかりません');
    const legs=[];let u=goal;
    while(u!==start){const x=prev.get(u);if(!x)throw new Error('経路復元に失敗しました');
      legs.push({from:x.u,to:u,e:x.e});u=x.u;}
    return legs.reverse();
  }
  route(start,goal,via=[]){
    const points=[this.resolveStation(start),...via.filter(Boolean).map(v=>this.resolveStation(v)),this.resolveStation(goal)];
    const legs=[];for(let i=0;i<points.length-1;i++)legs.push(...this.shortestLeg(points[i],points[i+1]));
    return this.summarizeRoute(points[0],points.at(-1),legs,via);
  }
  summarizeRoute(startId,goalId,legs,via=[]){
    let business=0,conversion=0,fareCalc=0;const categories=new Set(),rows=[];
    for(const{from,to,e}of legs){
      business+=Number(e.business_km);conversion+=Number(e.conversion_km||0);
      fareCalc+=Number(e.fare_calculation_km??e.business_km);
      categories.add(e.line_category);
      rows.push({from_station_id:from,from_station_name:this.stationById.get(from).station_name,
        to_station_id:to,to_station_name:this.stationById.get(to).station_name,
        line_id:e.line_id,line_name:e.line_name,line_category:e.line_category,
        business_km:e.business_km,conversion_km:e.conversion_km,
        fare_calculation_km:e.fare_calculation_km,segment_id:e.segment_id});
    }
    let category='mixed';
    if(categories.size===1&&categories.has('trunk'))category='trunk';
    else if(categories.size===1&&categories.has('local'))category='local';
    const lookup=category==='mixed'?(Math.ceil(business-1e-12)<=10?business:fareCalc):business;
    return{start_station_id:startId,start_station_name:this.stationById.get(startId).station_name,
      goal_station_id:goalId,goal_station_name:this.stationById.get(goalId).station_name,via,
      route_category:category,business_km:Number(business.toFixed(1)),
      conversion_km:Number(conversion.toFixed(1)),fare_calculation_km:Number(fareCalc.toFixed(1)),
      ordinary_fare_lookup_km:Math.ceil(lookup-1e-12),segments:rows};
  }
}
