export default class ChargeEngine {
  static NETWORKS=Object.freeze({HOKKAIDO_CONVENTIONAL:'hokkaido_conventional',HOKKAIDO_SHINKANSEN:'hokkaido_shinkansen'});
  static SEAT_TYPES=Object.freeze({UNRESERVED:'unreserved',RESERVED:'reserved',GREEN:'green'});
  static SEASONS=Object.freeze({NORMAL:'normal',BUSY:'busy',OFF_PEAK:'off_peak'});
  static ERROR_CODES=Object.freeze({UNSUPPORTED_CHARGE_TABLE:'UNSUPPORTED_CHARGE_TABLE',INVALID_ARGUMENT:'INVALID_ARGUMENT',
    SEASON_ADJUSTMENT_NOT_FOUND:'SEASON_ADJUSTMENT_NOT_FOUND'});
  constructor(source,productCharges=[],seasonAdjustments=[]){
    if(source?.getRecords){
      this.dataAccess=source;this.config=source.getMetadata('charge_master');
      const records=source.getRecords('charge_master');
      this.chargeTables=records.filter(r=>r.metadata?.charge_type==='distance');
      this.productCharges=records.filter(r=>r.metadata?.charge_type==='product');
      this.seasonAdjustments=records.filter(r=>r.metadata?.charge_type==='season_adjustment');
    }else{
      this.dataAccess=null;this.config={};
      this.chargeTables=(source||[]).map((x,i)=>({id:`LEGACY-C-${i}`,metadata:{charge_type:'distance',...x}}));
      this.productCharges=(productCharges||[]).map(x=>({id:x.product_id,name:x.name,metadata:{charge_type:'product',...x}}));
      this.seasonAdjustments=(seasonAdjustments||[]).map((x,i)=>({id:`LEGACY-S-${i}`,metadata:{charge_type:'season_adjustment',...x}}));
    }
  }
  limitedExpressCharge({km,passenger='adult',seatType='unreserved',season='normal',network='hokkaido_conventional'}){
    this.validatePassenger(passenger);this.validatePositiveKm(km);
    const lookupKm=this.lookupKm(km),breakdown=[];
    if(seatType==='green'){
      breakdown.push(this.distanceCharge(this.resolveTableId({network,seatType:'unreserved',lookupKm}),lookupKm,passenger));
      breakdown.push(this.distanceCharge(this.resolveTableId({network,seatType:'green',lookupKm}),lookupKm,passenger));
    }else{
      const base=this.distanceCharge(this.resolveTableId({network,seatType,lookupKm}),lookupKm,passenger);
      if(seatType==='reserved'){const adj=this.seasonAdjustment(network,season,passenger);
        base.base_amount_yen=base.amount_yen;base.season_adjustment_yen=adj;base.amount_yen+=adj;base.season=season;}
      breakdown.push(base);
    }
    return{component:seatType==='green'?'limited_express_green':`limited_express_${seatType}`,
      name:seatType==='green'?'特急グリーン料金':seatType==='reserved'?'特急指定席料金':'特急自由席料金',
      network,seat_type:seatType,season:seatType==='reserved'?season:'normal',lookup_km:lookupKm,
      amount_yen:breakdown.reduce((s,x)=>s+x.amount_yen,0),discountable:seatType!=='green',breakdown};
  }
  distanceCharge(tableId,km,passenger){
    this.validatePassenger(passenger);const lookupKm=this.lookupKm(km);
    const row=this.chargeTables.find(r=>r.metadata.table_id===tableId&&
      Number(r.metadata.min_km)<=lookupKm&&lookupKm<=Number(r.metadata.max_km));
    if(!row)throw this.createError(ChargeEngine.ERROR_CODES.UNSUPPORTED_CHARGE_TABLE,
      `料金マスターに該当がありません: ${tableId}/${lookupKm}km`);
    return{component:row.metadata.component,name:this.tableName(tableId),table_id:tableId,
      charge_record_id:row.id,lookup_km:lookupKm,
      amount_yen:Number(passenger==='adult'?row.metadata.adult_yen:row.metadata.child_yen),
      discountable:['ordinary_express','limited_express_reserved','limited_express_unreserved'].includes(row.metadata.component)};
  }
  tableName(id){return this.config.table_names?.[id]||id;}
  productCharge(productId,travelDate,passenger){
    this.validatePassenger(passenger);const date=new Date(`${travelDate}T00:00:00`);
    const row=this.productCharges.find(r=>r.id===productId&&
      (!r.metadata.effective_from||date>=new Date(`${r.metadata.effective_from}T00:00:00`))&&
      (!r.metadata.effective_to||date<=new Date(`${r.metadata.effective_to}T23:59:59`)));
    if(!row)throw new Error(`商品がないか適用期間外です: ${productId}`);
    return{component:row.metadata.component,product_id:productId,name:row.name,
      amount_yen:Number(passenger==='adult'?row.metadata.adult_yen:row.metadata.child_yen),discountable:false};
  }
  resolveTableId({network,seatType,lookupKm}){
    const n=this.config.networks?.[network];if(!n)throw this.createError('UNSUPPORTED_CHARGE_TABLE',`路線体系がありません: ${network}`);
    let key=seatType;
    if(seatType==='reserved'&&n.reserved_short_max_km&&lookupKm<=n.reserved_short_max_km)key='reserved_short';
    const candidates=n.table_candidates?.[key]||[];
    const id=candidates.find(x=>this.chargeTables.some(r=>r.metadata.table_id===x&&
      Number(r.metadata.min_km)<=lookupKm&&lookupKm<=Number(r.metadata.max_km)));
    if(!id)throw this.createError('UNSUPPORTED_CHARGE_TABLE',`対応する料金表がありません: ${network}/${seatType}/${lookupKm}`);
    return id;
  }
  seasonAdjustment(network,season,passenger){
    const row=this.seasonAdjustments.find(r=>r.metadata.network===network&&r.metadata.season===season&&r.metadata.applies_to==='reserved');
    if(!row)throw this.createError('SEASON_ADJUSTMENT_NOT_FOUND',`シーズン差額設定がありません: ${network}/${season}`);
    return Number(passenger==='adult'?row.metadata.adult_yen:row.metadata.child_yen);
  }
  lookupKm(km){return Math.ceil(Number(km)-1e-12);}
  validatePassenger(p){if(!['adult','child'].includes(p))throw this.createError('INVALID_ARGUMENT',`旅客区分が不正です: ${p}`);}
  validatePositiveKm(k){if(!Number.isFinite(Number(k))||Number(k)<=0)throw this.createError('INVALID_ARGUMENT',`営業キロが不正です: ${k}`);}
  createError(code,message,details={}){const e=new Error(message);e.code=code;e.details=details;return e;}
}
