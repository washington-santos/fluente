-- supabase/migrations/20260712000001_teacher_avatars_dicebear.sql

-- Switch teacher avatars from the plain colored-initial placeholders in
-- public/avatars/*.png to illustrated Dicebear personas. Requires
-- next.config.mjs to allow api.dicebear.com + SVG (see images.remotePatterns).
UPDATE public.teachers SET avatar_image_url = 'https://api.dicebear.com/9.x/personas/svg?seed=reynolds&backgroundColor=d1d4f9&backgroundType=gradientLinear' WHERE slug = 'dr-reynolds';
UPDATE public.teachers SET avatar_image_url = 'https://api.dicebear.com/9.x/personas/svg?seed=jake&backgroundColor=c0aede&backgroundType=gradientLinear' WHERE slug = 'mr-jake';
UPDATE public.teachers SET avatar_image_url = 'https://api.dicebear.com/9.x/personas/svg?seed=carol&backgroundColor=b6e3f4&backgroundType=gradientLinear' WHERE slug = 'mrs-carol';
UPDATE public.teachers SET avatar_image_url = 'https://api.dicebear.com/9.x/personas/svg?seed=sofia&backgroundColor=ffd5dc&backgroundType=gradientLinear' WHERE slug = 'sofia';
