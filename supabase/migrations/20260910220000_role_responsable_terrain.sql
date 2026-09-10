/* ==================================================================
   LE ROLE « RESPONSABLE DE TERRAIN DE STAGE ».

   Demande de Stef, 10/09 : la communication interne doit s adresser a TROIS
   populations distinctes -- les etudiants, les encadrants, et les responsables
   de terrain de stage. Les deux premieres existaient ; la troisieme n existait
   nulle part dans le modele.

   POURQUOI UN ROLE ET NON UNE COLONNE `responsible_person_id` SUR `placements`.
   Une colonne aurait suffi a AFFICHER une liste. Elle n aurait rien donne
   d autre : pas d acces, pas de RLS, pas de navigation. Or ce que Stef decrit
   est quelqu un qui repond de ce qui se passe sur son terrain -- donc quelqu un
   qui devra, tot ou tard, VOIR quelque chose que l encadrant ne voit pas. Un
   role contextualise porte cela nativement, une colonne aurait du etre
   reprise a ce moment-la, en migrant des donnees deja en place.

   ⚠️ POURQUOI CETTE MIGRATION EST SEULE DANS SON FICHIER, ET NE FAIT QUE CA.
   `alter type ... add value` ajoute la valeur, mais PostgreSQL interdit de s en
   SERVIR dans la meme transaction que celle qui l a ajoutee. Toute contrainte,
   policy ou fonction qui mentionne 'placement_manager' echouerait ici avec
   « unsafe use of new value of enum type ». D ou la coupure : cette valeur
   d abord, ses usages dans la migration suivante.

   ⚠️ ET POURQUOI ELLE EST IRREVERSIBLE. PostgreSQL ne sait pas retirer une
   valeur d un enum. Si le role devait disparaitre, il faudrait recreer le type
   et reecrire toutes les colonnes qui s en servent. Ajout valide par Stef le
   10/09 en connaissance de cette contrainte.

   `after 'placement_supervisor'` : l ordre de tri de l enum devient
   learner, placement_supervisor, placement_manager, teacher, administrator --
   soit du plus proche du terrain au plus institutionnel. C est l ordre dans
   lequel les listes seront lues.
   ================================================================== */

alter type public.role_name
  add value if not exists 'placement_manager' after 'placement_supervisor';
