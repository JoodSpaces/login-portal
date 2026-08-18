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
    let q = sb.from('units').select('*').order('name');
    if (user.role!=='admin') q = q.eq('owner_id', user.id);
    const { data } = await q; return data||[];
  },
  async bookings(unitIds){
    if(!unitIds.length) return [];
    const { data } = await sb.from('bookings').select('*').in('unit_id',unitIds).order('checkin',{ascending:false});
    return data||[];
  },
  async expenses(unitIds){
    if(!unitIds.length) return [];
    const { data } = await sb.from('expenses').select('*').in('unit_id',unitIds).order('date',{ascending:false});
    return data||[];
  },
  async payouts(unitIds){
    if(!unitIds.length) return [];
    const { data } = await sb.from('payouts').select('*').in('unit_id',unitIds).order('date',{ascending:false});
    return data||[];
  },

  async save(table, row){
    if (row.id){ const { data } = await sb.from(table).update(row).eq('id',row.id).select().single(); return data; }
    const { data } = await sb.from(table).insert(row).select().single(); return data;
  },
  async remove(table, id){ await sb.from(table).delete().eq('id',id); },
  async addUnit(name, location, bedrooms, user){
    return this.save('units', { name, location, bedrooms:Number(bedrooms)||1, owner_id:user.id });
  },
  async removeUnit(id){
    // schema uses ON DELETE CASCADE, so child rows go automatically
    await sb.from('units').delete().eq('id',id);
  },
};
