/* ============================================================
   JOOD Tracker — Supabase client + data layer
   ------------------------------------------------------------
   Live, multi-user data via your Supabase project.
   The rest of the app only ever talks to `store`, never Supabase
   directly.
   ============================================================ */

// ── Fill these in after you create your Supabase project ────
const SUPABASE_URL = 'https://pbhudkzimquvwfsecslw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BlFVJuy5YjJv3uXmTfLWQQ_UPMwDonL';

const HAS_KEYS = !SUPABASE_URL.includes('YOUR-PROJECT');
const sb = (window.supabase && HAS_KEYS)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ── Store API (async everywhere) ────────────────────────────
// RLS refusals come back as 42501 / empty results — say so plainly instead of failing silently.
function denied(error){
  if (error && (error.code === '42501' || /row-level security/i.test(error.message || ''))){
    return 'Only JOOD staff can change this data.';
  }
  return (error && error.message) || 'Could not save. Please try again.';
}

// Surface read failures instead of quietly rendering zeros. If deleted_at
// hasn't been migrated yet, retry without that filter rather than showing
// an empty database.
function isMissingRelation(error){
  const m = (error && (error.message||'')) + '';
  return error && (error.code === '42P01' || /could not find the table|schema cache|does not exist/i.test(m));
}
// quiet:true → a missing table/view is a pending migration, not a page failure:
// return [] and let the calling panel say so locally, with no global toast.
async function fetchLive(build, quiet){
  let { data, error } = await build(true);
  if (error && /deleted_at/.test(error.message||'')){
    console.warn('[jood] deleted_at column missing — run the schema migration');
    ({ data, error } = await build(false));
  }
  if (error){
    if (quiet && isMissingRelation(error)){
      console.warn('[jood] missing relation — run supabase-schema.sql:', error.message);
      store.__missing = true;
      return [];
    }
    console.error('[jood] read failed:', error.message);
    if (typeof window.__joodReadError === 'function') window.__joodReadError(error.message);
    return [];
  }
  return data || [];
}

const store = {
  async currentUser(){
    const { data } = await sb.auth.getSession();
    if (!data.session) return null;
    const u = data.session.user;
    let role='owner', name=u.email;
    const { data:prof } = await sb.from('profiles').select('*').eq('id',u.id).maybeSingle();
    if (prof){ role=prof.role||'owner'; name=prof.full_name||u.email; }
    return { id:u.id, email:u.email, name, role };
  },
  async signIn(email,password){
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signOut(){ await sb.auth.signOut(); },

  async units(user){
    return fetchLive(live => {
      let q = sb.from('units').select('*').order('name');
      if (live) q = q.is('deleted_at', null);
      if (user.role!=='admin') q = q.eq('owner_id', user.id);
      return q;
    });
  },
  async bookings(unitIds){
    if(!unitIds.length) return [];
    return fetchLive(live => {
      let q = sb.from('bookings').select('*').in('unit_id',unitIds).order('checkin',{ascending:false});
      return live ? q.is('deleted_at', null) : q;
    });
  },
  async expenses(unitIds){
    if(!unitIds.length) return [];
    return fetchLive(live => {
      let q = sb.from('expenses').select('*').in('unit_id',unitIds).order('date',{ascending:false});
      return live ? q.is('deleted_at', null) : q;
    });
  },
  async guests(){
    return fetchLive(live => {
      let q = sb.from('guests').select('*').order('full_name');
      return live ? q.is('deleted_at', null) : q;
    });
  },
  // One guest per contact detail. Phone wins, then email, then exact name.
  // Returns the guest id to stamp on the booking.
  async linkGuest({ name, phone, email }){
    name=(name||'').trim(); phone=(phone||'').trim(); email=(email||'').trim();
    if(!name) return null;
    let found=null;
    if(phone){
      const { data } = await sb.from('guests').select('*').eq('phone',phone).maybeSingle();
      found=data||null;
    }
    if(!found && email){
      const { data } = await sb.from('guests').select('*').ilike('email',email).maybeSingle();
      found=data||null;
    }
    if(!found && !phone && !email){
      const { data } = await sb.from('guests').select('*').ilike('full_name',name).maybeSingle();
      found=data||null;
    }
    if(found){
      // fill in details we didn't have before, never overwrite what's there
      const patch={};
      if(!found.phone && phone) patch.phone=phone;
      if(!found.email && email) patch.email=email;
      if(Object.keys(patch).length) await sb.from('guests').update(patch).eq('id',found.id);
      return found.id;
    }
    const { data, error } = await sb.from('guests')
      .insert({ full_name:name, phone:phone||null, email:email||null })
      .select().single();
    if(error) throw new Error(denied(error));
    return data.id;
  },
  // Owner-facing directory: name, country, stay dates. No contact details.
  async guestDirectory(unitIds){
    if(!unitIds.length) return [];
    this.__missing = false;
    const rows = await fetchLive(() => sb.from('guest_directory').select('*').in('unit_id',unitIds).order('checkin',{ascending:false}), true);
    this.directoryMissing = !!this.__missing;
    return rows;
  },
  async saveGuest(row){
    const { data, error } = await sb.from('guests').update(row).eq('id',row.id).select().single();
    if(error) throw new Error(denied(error));
    return data;
  },

  async payouts(unitIds){
    if(!unitIds.length) return [];
    const { data } = await sb.from('payouts').select('*').in('unit_id',unitIds).order('date',{ascending:false});
    return data||[];
  },

  async save(table, row){
    const q = row.id
      ? sb.from(table).update(row).eq('id', row.id).select().single()
      : sb.from(table).insert(row).select().single();
    const { data, error } = await q;
    if (error) throw new Error(denied(error));
    return data;
  },
  // Nothing is destroyed: "remove" stamps deleted_at, the Trash view restores it.
  async remove(table, id){
    const { error } = await sb.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(denied(error));
  },
  async restore(table, id){
    const { error } = await sb.from(table).update({ deleted_at: null }).eq('id', id);
    if (error) throw new Error(denied(error));
  },
  async trash(){
    // RLS also refuses these for owners; this keeps the request from firing at all.
    const tables = ['units','bookings','expenses','payouts','guests'];
    const out = {};
    await Promise.all(tables.map(async t => {
      const { data } = await sb.from(t).select('*').not('deleted_at','is',null).order('deleted_at',{ascending:false});
      out[t] = data || [];
    }));
    return out;
  },
  // Everything, unfiltered — the backup download reads this.
  async everything(){
    const tables = ['units','guests','bookings','expenses','payouts','documents','messages','profiles','projections'];
    const out = {};
    await Promise.all(tables.map(async t => {
      const { data, error } = await sb.from(t).select('*');
      out[t] = error ? [] : (data || []);
    }));
    return out;
  },
  async addUnit(name, location, bedrooms, user){
    return this.save('units', { name, location, bedrooms:Number(bedrooms)||1, owner_id:user.id, model:'commission', commission_pct:25 });
  },
  // Soft delete only — the unit's bookings, expenses and payouts stay intact
  // and reappear the moment the unit is restored.
  async removeUnit(id){
    const { error } = await sb.from('units').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(denied(error));
  },
};
