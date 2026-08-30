-- Nouveau type d'asset : le clip d'une diapositive.
--
-- Isole dans sa propre migration : PostgreSQL interdit d'utiliser une valeur
-- d'enumeration dans la meme transaction que celle qui l'ajoute. La migration
-- suivante s'en sert.

alter type public.asset_kind add value if not exists 'slide_video';
