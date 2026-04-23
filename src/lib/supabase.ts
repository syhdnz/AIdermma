import { createClient } from '@supabase/supabase-js';

// Using verified hardcoded values to ensure no environment variable issues
const supabaseUrl = 'https://olcsdwuxaewyquzxmmmf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sY3Nkd3V4YWV3eXF1enhtbW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NjUzNzQsImV4cCI6MjA5MjU0MTM3NH0.Tq_Po8RXgMyZ7hEFlXDBw7Wz9L_HUQXYy3lh1J4cHj8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
