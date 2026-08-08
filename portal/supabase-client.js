// Shared Supabase client for the JOOD Owner Portal.
// Loaded by login.html and dashboard.html after the supabase-js CDN script.
const SUPABASE_URL = 'https://pbhudkzimquvwfsecslw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BlFVJuy5YjJv3uXmTfLWQQ_UPMwDonL';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
