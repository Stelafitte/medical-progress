-- Nouveau type d'asset : l'illustration d'un support (figure, ECG, schema,
-- coupe echographique) deposee a cote du document dont elle provient.
--
-- Isole dans sa propre migration : PostgreSQL interdit d'utiliser une valeur
-- d'enumeration dans la meme transaction que celle qui l'ajoute. La migration
-- suivante s'en sert dans une contrainte.

alter type public.asset_kind add value if not exists 'illustration';
