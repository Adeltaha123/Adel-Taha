const IDB = {
  db:null,
  open(){ if(this.db) return Promise.resolve(this.db); return new Promise((res,rej)=>{ const r=indexedDB.open("maktab",1); r.onupgradeneeded=()=>r.result.createObjectStore("audio"); r.onsuccess=()=>{this.db=r.result;res(r.result);}; r.onerror=()=>rej(r.error); }); },
  async tx(mode,fn){ const d=await this.open(); return new Promise((res,rej)=>{ const tx=d.transaction("audio",mode); const req=fn(tx.objectStore("audio")); tx.oncomplete=()=>res(req&&req.result); tx.onerror=()=>rej(tx.error); }); },
  put(k,v){ return this.tx("readwrite",st=>st.put(v,k)); },
  get(k){ return this.tx("readonly",st=>st.get(k)); },
  del(k){ return this.tx("readwrite",st=>st.delete(k)); }
};

export { IDB };
